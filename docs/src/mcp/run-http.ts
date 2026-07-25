import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from './tools';

const TOKEN = process.env.MCP_TOKEN;
let warnedNoToken = false;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(payload);
}

function isAuthorized(req: IncomingMessage): boolean {
    if (!TOKEN) return true;
    const header = String(req.headers['authorization'] || '');
    const match = header.match(/^Bearer\s+(.+)$/i);
    return Boolean(match) && match![1].trim() === TOKEN;
}

async function readBody(req: IncomingMessage): Promise<string> {
    let raw = '';
    for await (const chunk of req) {
        raw += chunk;
    }
    return raw;
}

/** Run the MCP server over stdio (for local clients that spawn the process). */
async function runStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    const server = createMcpServer();
    await server.connect(transport);
    console.error('MCP server running in stdio mode.');
}

/** Run the MCP server behind a Node HTTP server at /mcp. */
async function runHttp(): Promise<void> {
    const transports = new Map<string, StreamableHTTPServerTransport>();
    const port = Number(process.env.MCP_PORT || '3100');
    const host = process.env.MCP_HOST || '0.0.0.0';

    const httpServer = createServer(async (req, res) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if (url.pathname !== '/mcp') {
            sendJson(res, 404, { error: 'Not found' });
            return;
        }
        if (!isAuthorized(req)) {
            sendJson(res, 401, { error: 'Unauthorized' });
            return;
        }

        try {
            if (req.method === 'POST') {
                let body: unknown;
                try {
                    const raw = await readBody(req);
                    body = raw ? JSON.parse(raw) : undefined;
                } catch {
                    sendJson(res, 400, { error: 'Invalid JSON body' });
                    return;
                }

                if (isInitializeRequest(body)) {
                    const transport = new StreamableHTTPServerTransport({
                        sessionIdGenerator: () => randomUUID(),
                    });
                    transport.onclose = () => {
                        if (transport.sessionId) transports.delete(transport.sessionId);
                    };
                    const server: McpServer = createMcpServer();
                    await server.connect(transport);
                    await transport.handleRequest(req, res, body);
                    if (transport.sessionId) transports.set(transport.sessionId, transport);
                    return;
                }

                const sid = String(req.headers['mcp-session-id'] || '');
                const transport = transports.get(sid);
                if (!transport) {
                    sendJson(res, 400, {
                        error: 'No valid session. Send an initialize request first.',
                    });
                    return;
                }
                await transport.handleRequest(req, res, body);
                return;
            }

            if (req.method === 'GET' || req.method === 'DELETE') {
                const sid = String(req.headers['mcp-session-id'] || '');
                const transport = transports.get(sid);
                if (!transport) {
                    sendJson(res, 400, {
                        error: 'No valid session. Send an initialize request first.',
                    });
                    return;
                }
                await transport.handleRequest(req, res);
                return;
            }

            sendJson(res, 405, { error: 'Method not allowed' });
        } catch (err) {
            console.error('MCP request error:', err);
            if (!res.headersSent) {
                sendJson(res, 500, { error: (err as Error).message });
            }
        }
    });

    httpServer.listen(port, host, () => {
        console.log(`MCP server listening on http://${host}:${port}/mcp`);
        if (TOKEN) {
            console.log('Authentication: enabled (Bearer token).');
        } else if (!warnedNoToken) {
            warnedNoToken = true;
            console.error(
                'WARNING: MCP_TOKEN not set — running without authentication. Set MCP_TOKEN to secure this server.'
            );
        }
    });

    const shutdown = async () => {
        for (const transport of transports.values()) {
            try {
                await transport.close();
            } catch (err) {
                console.error('Error closing transport:', err);
            }
        }
        transports.clear();
        httpServer.close();
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

if (process.argv.includes('--stdio')) {
    runStdio().catch((err) => {
        console.error('MCP stdio failed:', err);
        process.exit(1);
    });
} else {
    runHttp().catch((err) => {
        console.error('MCP http failed:', err);
        process.exit(1);
    });
}

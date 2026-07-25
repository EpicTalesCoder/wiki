import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
    postsDir,
    readSidebarConfig,
    writeSidebarConfig,
    getSectionDir,
    getDirPath,
    listMdxFiles,
    readPageMeta,
    readPageFile,
    writePageFile,
    writeMdxFile,
    addPageToSidebar,
    removePageFromSidebar,
    resolveContentPath,
    resolvePageFilePath,
    sanitizeSlug,
    sanitizeDirectory,
    slugify,
    reloadDevServer,
    type SidebarSection,
} from '../lib/admin-utils';

/** Match a section by either its human label or its slugified key. */
function findSection(identifier: string): SidebarSection {
    const config = readSidebarConfig();
    const key = slugify(identifier);
    const sec = config.find((s) => slugify(s.label) === key);
    if (!sec) throw new Error('Đề mục không tồn tại');
    return sec;
}

/** Convert an absolute content path to a content-relative, forward-slashed path. */
function contentPath(fullPath: string): string {
    return path.relative(postsDir, fullPath).split(path.sep).join('/');
}

/** Wrap a structured result as a single text content block (JSON, for AI parsing). */
function ok(result: unknown) {
    return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
}

export function createMcpServer(): McpServer {
    const server = new McpServer({ name: 'starlight-docs', version: '1.0.0' });

    server.tool(
        'list_sections',
        'List every sidebar section together with the pages it contains.',
        async () => {
            try {
                const config = readSidebarConfig();
                const sections = config.map((sec) => {
                    const dirPath = getSectionDir(sec);
                    const pages = listMdxFiles(dirPath).map((file) =>
                        readPageMeta(dirPath, file)
                    );
                    return {
                        key: slugify(sec.label),
                        label: sec.label,
                        type: sec.type || 'manual',
                        directory: sec.directory || '',
                        pages,
                    };
                });
                return ok({ sections });
            } catch (err) {
                throw new Error(`list_sections failed: ${(err as Error).message}`);
            }
        }
    );

    server.tool(
        'list_pages',
        'List documentation pages. Pass `section` (label or key) to filter a single section.',
        { section: z.string().optional() },
        async (args) => {
            try {
                const config = readSidebarConfig();
                const sections = args.section
                    ? config.filter((s) => slugify(s.label) === slugify(args.section!))
                    : config;
                const pages: Array<{
                    path: string;
                    slug: string;
                    title: string;
                    description: string;
                    section: string;
                }> = [];
                for (const sec of sections) {
                    const dirPath = getSectionDir(sec);
                    for (const file of listMdxFiles(dirPath)) {
                        const meta = readPageMeta(dirPath, file);
                        pages.push({
                            path: contentPath(path.join(dirPath, file)),
                            slug: meta.slug,
                            title: meta.title,
                            description: meta.description,
                            section: slugify(sec.label),
                        });
                    }
                }
                return ok({ pages });
            } catch (err) {
                throw new Error(`list_pages failed: ${(err as Error).message}`);
            }
        }
    );

    server.tool(
        'read_page',
        'Read the title, description and Markdown body of a page by its content-relative path.',
        { path: z.string() },
        async (args) => {
            try {
                const filePath = resolvePageFilePath(args.path);
                if (!fs.existsSync(filePath)) {
                    throw new Error('Trang không tồn tại');
                }
                const data = readPageFile(filePath);
                return ok({ path: args.path, ...data });
            } catch (err) {
                throw new Error(`read_page failed: ${(err as Error).message}`);
            }
        }
    );

    server.tool(
        'create_page',
        'Create a new page inside a section. Returns the new slug and content-relative path.',
        {
            section: z.string(),
            title: z.string(),
            description: z.string().optional(),
            content: z.string().optional(),
        },
        async (args) => {
            try {
                const sec = findSection(args.section);
                const sectionKey = slugify(sec.label);
                const dirPath = getDirPath(sectionKey);
                const slug = slugify(args.title);
                if (listMdxFiles(dirPath).some((f) => f.replace(/\.mdx?$/, '') === slug)) {
                    throw new Error('Trang đã tồn tại');
                }
                writeMdxFile(
                    dirPath,
                    slug,
                    { title: args.title, description: args.description },
                    args.content || ''
                );
                addPageToSidebar(sectionKey, args.title, slug, dirPath);
                return ok({
                    success: true,
                    slug,
                    path: contentPath(path.join(dirPath, `${slug}.mdx`)),
                });
            } catch (err) {
                throw new Error(`create_page failed: ${(err as Error).message}`);
            }
        }
    );

    server.tool(
        'update_page',
        'Update the title, description and/or body of an existing page by its content-relative path. If `content` is omitted the existing body is preserved.',
        {
            path: z.string(),
            title: z.string().optional(),
            description: z.string().optional(),
            content: z.string().optional(),
        },
        async (args) => {
            try {
                const filePath = resolvePageFilePath(args.path);
                if (!fs.existsSync(filePath)) {
                    throw new Error('Trang không tồn tại');
                }
                if (args.title !== undefined && args.title.trim() === '') {
                    throw new Error('Tiêu đề không được để trống');
                }
                const existing = readPageFile(filePath);
                const overrides: Record<string, string | undefined> = {};
                if (args.title !== undefined) overrides.title = args.title;
                if (args.description !== undefined) overrides.description = args.description;
                writePageFile(filePath, overrides, args.content ?? existing.body);
                return ok({ success: true });
            } catch (err) {
                throw new Error(`update_page failed: ${(err as Error).message}`);
            }
        }
    );

    server.tool(
        'delete_page',
        'Delete a page from a section by its slug.',
        { section: z.string(), slug: z.string() },
        async (args) => {
            try {
                const sectionKey = slugify(args.section);
                const dirPath = getDirPath(sectionKey);
                const filePath = resolveContentPath(dirPath, args.slug);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                removePageFromSidebar(sectionKey, sanitizeSlug(args.slug));
                return ok({ success: true });
            } catch (err) {
                throw new Error(`delete_page failed: ${(err as Error).message}`);
            }
        }
    );

    server.tool(
        'create_section',
        'Create a new sidebar section. Defaults to an autogenerate section.',
        {
            label: z.string(),
            type: z.enum(['autogenerate', 'manual']).optional(),
            directory: z.string().optional(),
        },
        async (args) => {
            try {
                const config = readSidebarConfig();
                const key = slugify(args.label);
                const dir = sanitizeDirectory(args.directory || key);
                if (config.some((s) => slugify(s.label) === key)) {
                    throw new Error('Đề mục đã tồn tại');
                }
                const newSection =
                    args.type === 'manual'
                        ? { label: args.label, type: 'manual' as const, directory: dir, items: [] }
                        : { label: args.label, type: 'autogenerate' as const, directory: dir };
                config.push(newSection);
                writeSidebarConfig(config);
                const dirPath = getSectionDir(newSection);
                if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
                return ok({ success: true, key, directory: dir });
            } catch (err) {
                throw new Error(`create_section failed: ${(err as Error).message}`);
            }
        }
    );

    server.tool(
        'delete_section',
        'Delete a sidebar section by its label (or key).',
        { label: z.string() },
        async (args) => {
            try {
                const config = readSidebarConfig();
                const filtered = config.filter(
                    (s) => slugify(s.label) !== slugify(args.label)
                );
                if (filtered.length === config.length) {
                    throw new Error('Đề mục không tồn tại');
                }
                writeSidebarConfig(filtered);
                return ok({ success: true });
            } catch (err) {
                throw new Error(`delete_section failed: ${(err as Error).message}`);
            }
        }
    );

    server.tool(
        'reload',
        'Trigger the Astro dev server to rebuild so content changes become visible.',
        async () => {
            try {
                reloadDevServer();
                return ok({
                    success: true,
                    message: 'Dev server reload triggered. Pages will rebuild shortly.',
                });
            } catch (err) {
                throw new Error(`reload failed: ${(err as Error).message}`);
            }
        }
    );

    return server;
}

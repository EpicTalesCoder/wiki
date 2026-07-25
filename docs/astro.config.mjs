import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import starlight from '@astrojs/starlight';
import starlightSiteGraph from 'starlight-site-graph';
import starlightThemeObsidian from 'starlight-theme-obsidian';
import starlightLinksValidator from 'starlight-links-validator';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const isHeroku = Boolean(process.env.HEROKU_APP_NAME || process.env.HEROKU_APP_ID);
const site = isHeroku
    ? `https://${process.env.HEROKU_APP_NAME || 'starlight-theme-obsidian'}.herokuapp.com`
    : 'http://localhost:4321';
const base = isHeroku ? '/' : '/';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sidebarConfig = JSON.parse(readFileSync(path.join(__dirname, 'sidebar-config.json'), 'utf-8'));

const sidebar = sidebarConfig.map(sec => {
    if (sec.type === 'autogenerate') {
        return {
            label: sec.label,
            autogenerate: { directory: sec.directory },
        };
    }
    return {
        label: sec.label,
        items: sec.items,
    };
});

export default defineConfig({
    site,
    base,
    // Run as a Node SSR server (hybrid): Starlight pages stay prerendered,
    // API routes (prerender = false) run server-side so the editor + MCP work.
    adapter: node({ mode: 'standalone' }),
    integrations: [
        starlight({
            title: 'Starlight Obsidian Theme',
            credits: true,
            social: [
                { icon: 'github', label: 'GitHub', href: 'https://github.com/fevol/starlight-theme-obsidian' },
                { icon: 'discord', label: 'Discord', href: 'https://discord.com/users/264169866511122432' },
            ],
            editLink: {
                baseUrl: 'https://github.com/fevol/starlight-theme-obsidian/edit/main/docs/',
            },
            customCss: [
                './src/styles/global.css'
            ],
            plugins: [
                starlightLinksValidator({
                    errorOnInvalidHashes: false
                }),
                starlightSiteGraph(),
                starlightThemeObsidian({ overrideWarnings: true }),
            ],
            favicon: './favicon.svg',
            sidebar,
            components: {
                Head: './src/overrides/Head.astro',
                EditLink: './src/overrides/EditLink.astro',
            },
        }),
    ],
    devToolbar: { enabled: false },
});
// reload-stamp: 1784984738785

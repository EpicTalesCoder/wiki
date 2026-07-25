import { createHighlighter, type Highlighter } from 'shiki';
import { marked } from 'marked';

/**
 * Server-side faithful preview rendering for the inline page editor.
 *
 * The actual Starlight page renders Markdown/MDX with Expressive Code (Shiki)
 * for code and the `<Aside>` component for `:::note`-style callouts. To make the
 * editor's preview match the page, this module renders the Markdown body with:
 *   1. A `:::type[title]` → Starlight aside HTML transform (colors come from
 *      Starlight's built-in CSS via the `.starlight-aside--*` classes).
 *   2. `marked` for the rest of the Markdown.
 *   3. A post-pass that replaces fenced code blocks with Shiki-highlighted HTML
 *      (the same highlighter the site uses) using dual light/dark themes.
 *
 * The preview container is given the `sl-markdown-content` class so all of
 * Starlight's real Markdown CSS applies automatically.
 */

marked.setOptions({ gfm: true, breaks: false });

// ---------------------------------------------------------------------------
// Shiki (singleton — initial creation is async and shared across requests)
// ---------------------------------------------------------------------------

const BUNDLED_LANGS = [
    'javascript',
    'typescript',
    'jsx',
    'tsx',
    'json',
    'bash',
    'shell',
    'shellscript',
    'python',
    'html',
    'css',
    'markdown',
    'mdx',
    'yaml',
    'diff',
    'sql',
    'go',
    'rust',
    'java',
    'c',
    'cpp',
    'csharp',
    'php',
    'ruby',
];
const THEMES = ['github-dark', 'github-light'] as const;

let highlighterPromise: Promise<Highlighter> | undefined;

function getHighlighter(): Promise<Highlighter> {
    if (!highlighterPromise) {
        highlighterPromise = createHighlighter({
            langs: BUNDLED_LANGS,
            themes: [...THEMES],
        });
    }
    return highlighterPromise;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function unescapeHtml(input: string): string {
    return input
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

/** Map an arbitrary language hint to a loaded Shiki language. */
function resolveLang(raw: string, loaded: string[]): string {
    const lang = raw.trim().toLowerCase();
    const alias: Record<string, string> = {
        js: 'javascript',
        ts: 'typescript',
        py: 'python',
        sh: 'bash',
        shell: 'bash',
        yml: 'yaml',
        'c++': 'cpp',
        'c#': 'csharp',
    };
    const resolved = alias[lang] || lang;
    return loaded.includes(resolved) ? resolved : '';
}

/** Inline-SVG icon `<path>` markup matching Starlight's aside icon set. */
const ASIDE_ICONS: Record<string, string> = {
    note: '<path d="M12 11a1 1 0 0 0-1 1v4a1 1 0 0 0 2 0v-4a1 1 0 0 0-1-1Zm.38-3.92a1 1 0 0 0-.76 0 1 1 0 0 0-.33.21 1.15 1.15 0 0 0-.21.33 1 1 0 0 0 .21 1.09c.097.088.209.16.33.21A1 1 0 0 0 13 8a1.05 1.05 0 0 0-.29-.71 1 1 0 0 0-.33-.21ZM12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16.001A8 8 0 0 1 12 20Z"/>',
    tip: '<path fill-rule="evenodd" d="M1.44 8.855v-.001l3.527-3.516c.34-.344.802-.541 1.285-.548h6.649l.947-.947c3.07-3.07 6.207-3.072 7.62-2.868a1.821 1.821 0 0 1 1.557 1.557c.204 1.413.203 4.55-2.868 7.62l-.946.946v6.649a1.845 1.845 0 0 1-.549 1.286l-3.516 3.528a1.844 1.844 0 0 1-3.11-.944l-.858-4.275-4.52-4.52-2.31-.463-1.964-.394A1.847 1.847 0 0 1 .98 10.693a1.843 1.843 0 0 1 .46-1.838Zm5.379 2.017-3.873-.776L6.32 6.733h4.638l-4.14 4.14Zm8.403-5.655c2.459-2.46 4.856-2.463 5.89-2.33.134 1.035.13 3.432-2.329 5.891l-6.71 6.71-3.561-3.56 6.71-6.711Zm-1.318 15.837-.776-3.873 4.14-4.14v4.639l-3.364 3.374Z" clip-rule="evenodd"/>',
    caution: '<path d="M12 16a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm10.67 1.47-8.05-14a3 3 0 0 0-5.24 0l-8 14A3 3 0 0 0 3.94 22h16.12a3 3 0 0 0 2.61-4.53Zm-1.73 2a1 1 0 0 1-.88.51H3.94a1 1 0 0 1-.88-.51 1 1 0 0 1 0-1l8-14a1 1 0 0 1 1.78 0l8.05 14a1 1 0 0 1 .05 1.02v-.02ZM12 8a1 1 0 0 0-1 1v4a1 1 0 0 0 2 0V9a1 1 0 0 0-1-1Z"/>',
    danger: '<path d="M12 7a1 1 0 0 0-1 1v4a1 1 0 0 0 2 0V8a1 1 0 0 0-1-1Zm0 8a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm9.71-7.44-5.27-5.27a1.05 1.05 0 0 0-.71-.29H8.27a1.05 1.05 0 0 0-.71.29L2.29 7.56a1.05 1.05 0 0 0-.29.71v7.46c.004.265.107.518.29.71l5.27 5.27c.192.183.445.286.71.29h7.46a1.05 1.05 0 0 0 .71-.29l5.27-5.27a1.05 1.05 0 0 0 .29-.71V8.27a1.05 1.05 0 0 0-.29-.71ZM20 15.31 15.31 20H8.69L4 15.31V8.69L8.69 4h6.62L20 8.69v6.62Z"/>',
};

const ASIDE_DEFAULT_TITLE: Record<string, string> = {
    note: 'Lưu ý',
    tip: 'Mẹo',
    caution: 'Chú ý',
    danger: 'Nguy hiểm',
};

function buildAside(type: string, title: string, innerHtml: string): string {
    const icon = ASIDE_ICONS[type] || ASIDE_ICONS.note;
    const label = title || ASIDE_DEFAULT_TITLE[type] || 'Lưu ý';
    return (
        `<aside class="starlight-aside starlight-aside--${type}">` +
        `<p class="starlight-aside__title" aria-hidden="true">` +
        `<svg class="starlight-aside__icon" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">${icon}</svg>` +
        escapeHtml(label) +
        `</p>` +
        `<div class="starlight-aside__content">${innerHtml}</div>` +
        `</aside>`
    );
}

const ASIDE_TYPES = ['note', 'tip', 'caution', 'danger'] as const;

/**
 * Render Markdown that may contain Starlight `:::type[title] ... :::` callouts.
 * Callouts are parsed line-by-line (skipping fenced code blocks so `:::` inside
 * code is left alone) and their inner content is rendered recursively.
 */
function renderWithAsides(md: string): string {
    const lines = md.split(/\r?\n/);
    let output = '';
    let buffer = '';
    let inAside = false;
    let asideType = 'note';
    let asideTitle = '';
    let fence: string | null = null;

    const flush = (): void => {
        if (buffer) output += String(marked.parse(buffer));
        buffer = '';
    };

    for (const line of lines) {
        // Track fenced code blocks so directives inside code are ignored.
        const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})/);
        if (fenceMatch) {
            const marker = fenceMatch[2][0];
            if (fence === null) {
                fence = marker;
            } else if (fence === marker) {
                fence = null;
            }
        }

        if (fence === null && !inAside) {
            const open = line.match(/^:::\s*([a-z]*)\s*(?:\[([^\]]*)\])?\s*$/);
            if (open) {
                flush();
                inAside = true;
                asideType = ASIDE_TYPES.includes(open[1] as (typeof ASIDE_TYPES)[number])
                    ? open[1]
                    : open[1] || 'note';
                asideTitle = open[2] || '';
                continue;
            }
        }

        if (inAside && fence === null && /^:::\s*$/.test(line)) {
            const inner = String(marked.parse(buffer));
            output += buildAside(asideType, asideTitle, inner);
            inAside = false;
            buffer = '';
            asideTitle = '';
            continue;
        }

        buffer += line + '\n';
    }

    flush();
    // Unterminated callout → render what we have as an aside anyway.
    if (inAside) {
        output += buildAside(asideType, asideTitle, String(marked.parse(buffer)));
    }
    return output;
}

/** Replace marked's default `<pre><code>` blocks with Shiki-highlighted HTML. */
function highlightCodeBlocks(html: string, hl: Highlighter): string {
    const loaded = hl.getLoadedLanguages();
    return html.replace(
        /<pre><code(?:\s+class="language-([^"]+)")?>([\s\S]*?)<\/code><\/pre>/g,
        (_match, lang: string | undefined, codeHtml: string) => {
            const raw = unescapeHtml(codeHtml);
            const resolved = resolveLang(lang || '', loaded);
            if (!resolved) {
                return `<pre><code class="language-${escapeHtml(lang || '')}">${codeHtml}</code></pre>`;
            }
            try {
                return hl.codeToHtml(raw, {
                    lang: resolved,
                    themes: { light: 'github-light', dark: 'github-dark' },
                    defaultColor: false,
                });
            } catch {
                return `<pre><code class="language-${escapeHtml(lang || '')}">${codeHtml}</code></pre>`;
            }
        }
    );
}

/**
 * Render a Markdown body to preview HTML that matches the live Starlight page
 * (callouts + Shiki syntax highlighting). The returned HTML is intended to be
 * injected into an element carrying the `sl-markdown-content` class.
 */
export async function renderPreview(body: string): Promise<string> {
    const hl = await getHighlighter();
    let html = renderWithAsides(body || '');
    html = highlightCodeBlocks(html, hl);
    return html;
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const docsRoot = path.resolve(__dirname, '..', '..');
export const postsDir = path.join(docsRoot, 'src', 'content', 'docs');
export const sidebarConfigPath = path.join(docsRoot, 'sidebar-config.json');

export interface SidebarItem {
    label: string;
    link?: string;
}

export interface SidebarSection {
    label: string;
    type?: 'autogenerate' | 'manual';
    directory?: string;
    items?: SidebarItem[];
}

export interface PageMeta {
    slug: string;
    title: string;
    description: string;
}

export function slugify(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

export function isContained(base: string, target: string): boolean {
    const baseResolved = path.resolve(base);
    const targetResolved = path.resolve(target);
    return targetResolved === baseResolved || targetResolved.startsWith(baseResolved + path.sep);
}

export function sanitizeSlug(rawSlug: string): string {
    return slugify(rawSlug);
}

export function resolveContentPath(base: string, rawSlug: string): string {
    const safe = slugify(rawSlug);
    const resolved = path.resolve(base, `${safe}.mdx`);
    if (!isContained(base, resolved)) throw new Error('Đường dẫn không hợp lệ');
    return resolved;
}

export function sanitizeDirectory(dir: string): string {
    const safe = slugify(dir);
    if (!safe) throw new Error('Tên thư mục không hợp lệ');
    const resolved = path.resolve(postsDir, safe);
    if (!isContained(postsDir, resolved)) throw new Error('Đường dẫn không hợp lệ');
    return safe;
}

export function readSidebarConfig(): SidebarSection[] {
    if (!fs.existsSync(sidebarConfigPath)) return [];
    return JSON.parse(fs.readFileSync(sidebarConfigPath, 'utf-8')) as SidebarSection[];
}

export function writeSidebarConfig(config: SidebarSection[]): void {
    fs.writeFileSync(sidebarConfigPath, JSON.stringify(config, null, 4) + '\n', 'utf-8');
}

export function parseFrontmatter(content: string): Record<string, string> {
    return splitFrontmatter(content).frontmatter;
}

export function buildFrontmatter(fields: Record<string, string | undefined>): string {
    const lines = ['---'];
    for (const [key, value] of Object.entries(fields)) {
        if (value === undefined || value === '') continue;
        lines.push(`${key}: ${value}`);
    }
    lines.push('---');
    return lines.join('\n');
}

export function readPageMeta(dirPath: string, file: string): PageMeta {
    const slug = file.replace(/\.mdx?$/, '');
    const content = fs.readFileSync(path.join(dirPath, file), 'utf-8');
    const fm = parseFrontmatter(content);
    return { slug, title: fm.title || slug, description: fm.description || '' };
}

export function listMdxFiles(dirPath: string): string[] {
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath).filter((f) => f.endsWith('.mdx'));
}

export function getDirPath(sectionKey: string): string {
    const config = readSidebarConfig();
    const sec = config.find((s) => slugify(s.label) === sectionKey);
    return getSectionDir(sec);
}

export function getSectionDir(sec: SidebarSection | undefined): string {
    if (!sec || !sec.directory) return postsDir;
    const resolved = path.resolve(postsDir, sec.directory);
    return isContained(postsDir, resolved) ? resolved : postsDir;
}

export function addPageToSidebar(sectionKey: string, title: string, slug: string, dirPath: string): void {
    const config = readSidebarConfig();
    const sec = config.find((s) => slugify(s.label) === sectionKey);
    if (!sec || sec.type !== 'manual') return;
    const relDir = path.relative(postsDir, dirPath);
    const link = relDir ? `/${relDir}/${slug}/` : `/${slug}/`;
    if (!sec.items) sec.items = [];
    sec.items.push({ label: title, link });
    writeSidebarConfig(config);
}

export function removePageFromSidebar(sectionKey: string, slug: string): void {
    const config = readSidebarConfig();
    const sec = config.find((s) => slugify(s.label) === sectionKey);
    if (!sec || sec.type !== 'manual' || !sec.items) return;
    sec.items = sec.items.filter((item) => !item.link || !item.link.endsWith(`/${slug}/`));
    writeSidebarConfig(config);
}

export function writeMdxFile(
    dirPath: string,
    slug: string,
    frontmatter: Record<string, string | undefined>,
    body: string
): void {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
    const filePath = path.join(dirPath, `${slug}.mdx`);
    if (!isContained(dirPath, filePath)) throw new Error('Đường dẫn không hợp lệ');
    const content = buildFrontmatter(frontmatter) + '\n\n' + (body || '') + '\n';
    fs.writeFileSync(filePath, content, 'utf-8');
}

export const json = (data: unknown, status = 200): Response =>
    new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

const astroConfigPath = path.join(docsRoot, 'astro.config.mjs');
const contentConfigPath = path.join(docsRoot, 'src', 'content.config.ts');

function touchWithStamp(filePath: string): void {
    if (!fs.existsSync(filePath)) return;
    const marker = '// reload-stamp:';
    const stamp = `${marker} ${Date.now()}`;
    const original = fs.readFileSync(filePath, 'utf-8');
    let next: string;
    if (original.includes(marker)) {
        next = original.replace(new RegExp(`${marker}.*$`), stamp);
    } else {
        next = original.replace(/\s*$/, `\n${stamp}\n`);
    }
    fs.writeFileSync(filePath, next, 'utf-8');
}

export function reloadDevServer(): void {
    touchWithStamp(contentConfigPath);
    touchWithStamp(astroConfigPath);
}

// ---------------------------------------------------------------------------
// Page editor helpers (inline "Edit page" button)
// ---------------------------------------------------------------------------

const frontmatterBlockRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Split a Markdown/MDX file into its frontmatter map and body. */
export function splitFrontmatter(content: string): {
    frontmatter: Record<string, string>;
    body: string;
} {
    const frontmatter: Record<string, string> = {};
    const match = content.match(frontmatterBlockRegex);
    if (!match) return { frontmatter, body: content };
    for (const line of match[1].split(/\r?\n/)) {
        const m = line.match(/^([\w-]+):\s*(.*)$/);
        if (m) frontmatter[m[1]] = m[2].trim();
    }
    return { frontmatter, body: content.slice(match[0].length) };
}

/**
 * Resolve a content-relative path (e.g. `getting-started.mdx`,
 * `admin/index.mdx`) to an absolute file path inside the docs content folder.
 * Throws if the path escapes the content directory or is not a Markdown file.
 */
export function resolvePageFilePath(relativePath: string): string {
    if (!relativePath || relativePath.includes('..')) {
        throw new Error('Đường dẫn không hợp lệ');
    }
    const resolved = path.resolve(postsDir, relativePath);
    if (!isContained(postsDir, resolved)) throw new Error('Đường dẫn không hợp lệ');
    if (!/\.(md|mdx)$/.test(resolved)) throw new Error('Chỉ hỗ trợ file .md/.mdx');
    return resolved;
}

/** Read a page file and return its title, description, and Markdown body. */
export function readPageFile(filePath: string): {
    title: string;
    description: string;
    body: string;
} {
    const { frontmatter, body } = splitFrontmatter(fs.readFileSync(filePath, 'utf-8'));
    return {
        title: frontmatter.title || '',
        description: frontmatter.description || '',
        body: body.replace(/\s+$/, ''),
    };
}

/**
 * Write a page file, preserving any existing frontmatter fields and overriding
 * only the supplied ones (typically `title` and `description`).
 */
export function writePageFile(
    filePath: string,
    overrides: Record<string, string | undefined>,
    body: string
): void {
    const raw = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
    const match = raw.match(frontmatterBlockRegex);
    const existingBlock = match ? match[1] : '';
    const patched = patchFrontmatterLines(existingBlock, overrides);
    const fmBlock = `---\n${patched}\n---`;
    fs.writeFileSync(filePath, fmBlock + '\n\n' + (body || '') + '\n', 'utf-8');
}

/**
 * Return the frontmatter block text with the given fields replaced (when the
 * key already exists) or appended (when it does not). All other lines are kept
 * untouched so multi-line / block-style values survive a save.
 */
function patchFrontmatterLines(
    blockText: string,
    overrides: Record<string, string | undefined>
): string {
    const lines = blockText ? blockText.split(/\r?\n/) : [];
    for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined) continue;
        const idx = lines.findIndex((line) => {
            const m = line.match(/^([\w-]+):/);
            return Boolean(m) && m[1] === key;
        });
        const replacement = `${key}: ${value}`;
        if (idx >= 0) lines[idx] = replacement;
        else lines.push(replacement);
    }
    return lines.join('\n');
}

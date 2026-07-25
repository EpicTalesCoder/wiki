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

const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---/;

export function parseFrontmatter(content: string): Record<string, string> {
    const fm: Record<string, string> = {};
    const match = content.match(frontmatterRegex);
    if (!match) return fm;
    for (const line of match[1].split(/\r?\n/)) {
        const m = line.match(/^([\w-]+):\s*(.*)$/);
        if (m) fm[m[1]] = m[2].trim();
    }
    return fm;
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

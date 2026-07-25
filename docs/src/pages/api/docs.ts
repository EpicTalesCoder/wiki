import type { APIRoute } from 'astro';
import fs from 'node:fs';
import {
    readSidebarConfig,
    getDirPath,
    getSectionDir,
    addPageToSidebar,
    removePageFromSidebar,
    writeMdxFile,
    listMdxFiles,
    readPageMeta,
    parseFrontmatter,
    slugify,
    sanitizeSlug,
    resolveContentPath,
    json,
} from '../../lib/admin-utils';

export const prerender = false;

export const GET: APIRoute = () => {
    try {
        const config = readSidebarConfig();
        const sections = config.map((sec) => {
            const dirPath = getSectionDir(sec);
            const pages = listMdxFiles(dirPath).map((file) => readPageMeta(dirPath, file));
            return {
                key: slugify(sec.label),
                label: sec.label,
                type: sec.type || 'manual',
                directory: sec.directory || '',
                pages,
            };
        });
        return json({ sections });
    } catch (err) {
        return json({ error: (err as Error).message }, 500);
    }
};

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { action, slug, section, title, description, content, category } = body as {
            action?: string;
            slug?: string;
            section?: string;
            title?: string;
            description?: string;
            content?: string;
            category?: string;
        };

        const sectionKey = section || '';
        const dirPath = getDirPath(sectionKey);

        if (action === 'delete' && slug) {
            const safeSlug = sanitizeSlug(slug);
            const filePath = resolveContentPath(dirPath, slug);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            removePageFromSidebar(sectionKey, safeSlug);
            return json({ success: true });
        }

        if (action === 'create' && title && section) {
            const postSlug = slugify(title);
            if (listMdxFiles(dirPath).some((f) => f.replace(/\.mdx?$/, '') === postSlug)) {
                return json({ error: 'Trang đã tồn tại' }, 409);
            }
            const frontmatter: Record<string, string | undefined> = {
                title,
                description: description || '',
            };
            if (category) frontmatter.category = category;
            writeMdxFile(dirPath, postSlug, frontmatter, content || '');
            addPageToSidebar(sectionKey, title, postSlug, dirPath);
            return json({ success: true, slug: postSlug }, 201);
        }

        if (action === 'update' && slug && section) {
            const safeSlug = sanitizeSlug(slug);
            const filePath = resolveContentPath(dirPath, slug);
            if (!fs.existsSync(filePath)) {
                return json({ error: 'Trang không tồn tại' }, 404);
            }
            const existingFm = parseFrontmatter(fs.readFileSync(filePath, 'utf-8'));
            const frontmatter: Record<string, string | undefined> = {
                ...existingFm,
                title: title || safeSlug,
                description: description ?? existingFm.description ?? '',
            };
            if (category !== undefined) frontmatter.category = category;
            writeMdxFile(dirPath, safeSlug, frontmatter, content || '');
            return json({ success: true });
        }

        return json({ error: 'Action không hợp lệ' }, 400);
    } catch (err) {
        return json({ error: (err as Error).message }, 500);
    }
};

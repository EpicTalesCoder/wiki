import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import {
    docsRoot,
    listMdxFiles,
    parseFrontmatter,
    slugify,
    sanitizeSlug,
    resolveContentPath,
    isContained,
    writeMdxFile,
    json,
} from '../../lib/admin-utils';

const blogDir = path.join(docsRoot, 'src', 'content', 'docs', 'blog', 'posts');

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

function readPost(file: string) {
    const slug = file.replace(/\.mdx?$/, '');
    const content = fs.readFileSync(path.join(blogDir, file), 'utf-8');
    const fm = parseFrontmatter(content);
    return {
        slug,
        title: fm.title || slug,
        description: fm.description || '',
        category: fm.category || 'Khác',
        date: fm.date || today(),
    };
}

export const prerender = false;

export const GET: APIRoute = () => {
    try {
        const posts = listMdxFiles(blogDir)
            .map(readPost)
            .sort((a, b) => (a.date < b.date ? 1 : -1));
        return json(posts);
    } catch (err) {
        return json({ error: (err as Error).message }, 500);
    }
};

export const POST: APIRoute = async ({ request }) => {
    try {
        if (!fs.existsSync(blogDir)) fs.mkdirSync(blogDir, { recursive: true });

        const body = await request.json();
        const { action, slug, title, description, content, category } = body as {
            action?: string;
            slug?: string;
            title?: string;
            description?: string;
            content?: string;
            category?: string;
        };

        if (action === 'delete' && slug) {
            const filePath = resolveContentPath(blogDir, slug);
            if (!isContained(blogDir, filePath)) return json({ error: 'Đường dẫn không hợp lệ' }, 400);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return json({ success: true });
        }

        if (action === 'create' && title) {
            const postSlug = slugify(title);
            if (listMdxFiles(blogDir).some((f) => f.replace(/\.mdx?$/, '') === postSlug)) {
                return json({ error: 'Bài viết đã tồn tại' }, 409);
            }
            writeMdxFile(
                blogDir,
                postSlug,
                {
                    title,
                    description: description || '',
                    date: today(),
                    category: category || 'Khác',
                },
                content || ''
            );
            return json({ success: true, slug: postSlug }, 201);
        }

        if (action === 'update' && slug) {
            const safeSlug = sanitizeSlug(slug);
            const filePath = resolveContentPath(blogDir, slug);
            if (!fs.existsSync(filePath)) return json({ error: 'Bài viết không tồn tại' }, 404);
            const existing = parseFrontmatter(fs.readFileSync(filePath, 'utf-8'));
            writeMdxFile(
                blogDir,
                safeSlug,
                {
                    ...existing,
                    title: title || existing.title || safeSlug,
                    description: description ?? existing.description ?? '',
                    date: existing.date || today(),
                    category: category || existing.category || 'Khác',
                },
                content || ''
            );
            return json({ success: true });
        }

        return json({ error: 'Action không hợp lệ' }, 400);
    } catch (err) {
        return json({ error: (err as Error).message }, 500);
    }
};

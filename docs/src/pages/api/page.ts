import type { APIRoute } from 'astro';
import fs from 'node:fs';
import {
    resolvePageFilePath,
    readPageFile,
    writePageFile,
    json,
} from '../../lib/admin-utils';

export const prerender = false;

export const GET: APIRoute = ({ url }) => {
    try {
        const relativePath = url.searchParams.get('path') || '';
        if (!relativePath) return json({ error: 'Thiếu tham số path' }, 400);
        let filePath: string;
        try {
            filePath = resolvePageFilePath(relativePath);
        } catch (err) {
            return json({ error: (err as Error).message }, 400);
        }
        if (!fs.existsSync(filePath)) return json({ error: 'Trang không tồn tại' }, 404);
        const data = readPageFile(filePath);
        return json({ ...data, path: relativePath });
    } catch (err) {
        return json({ error: (err as Error).message }, 500);
    }
};

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { path: relativePath, title, description, content } = body as {
            path?: string;
            title?: string;
            description?: string;
            content?: string;
        };
        if (!relativePath) return json({ error: 'Thiếu tham số path' }, 400);
        let filePath: string;
        try {
            filePath = resolvePageFilePath(relativePath);
        } catch (err) {
            return json({ error: (err as Error).message }, 400);
        }
        if (!fs.existsSync(filePath)) return json({ error: 'Trang không tồn tại' }, 404);
        if (!title || !title.trim()) {
            return json({ error: 'Tiêu đề không được để trống' }, 400);
        }
        writePageFile(filePath, { title, description }, content || '');
        return json({ success: true });
    } catch (err) {
        return json({ error: (err as Error).message }, 500);
    }
};

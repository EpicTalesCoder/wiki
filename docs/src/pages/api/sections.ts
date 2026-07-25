import type { APIRoute } from 'astro';
import fs from 'node:fs';
import {
    readSidebarConfig,
    writeSidebarConfig,
    slugify,
    sanitizeDirectory,
    getSectionDir,
    json,
} from '../../lib/admin-utils';

export const prerender = false;

export const GET: APIRoute = () => {
    try {
        const config = readSidebarConfig();
        return json(config.map((s) => ({
            label: s.label,
            type: s.type || 'manual',
            directory: s.directory || '',
        })));
    } catch (err) {
        return json({ error: (err as Error).message }, 500);
    }
};

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { action, label, type: secType, directory, index } = body as {
            action?: string;
            label?: string;
            type?: string;
            directory?: string;
            index?: number;
        };

        if (action === 'create' && label) {
            const config = readSidebarConfig();
            const key = slugify(label);
            let dir: string;
            try {
                dir = sanitizeDirectory(directory || key);
            } catch {
                return json({ error: 'Tên thư mục không hợp lệ' }, 400);
            }
            if (config.some((s) => slugify(s.label) === key)) {
                return json({ error: 'Đề mục đã tồn tại' }, 409);
            }
            const newSection =
                secType === 'manual'
                    ? { label, type: 'manual' as const, directory: dir, items: [] }
                    : { label, type: 'autogenerate' as const, directory: dir };
            if (typeof index === 'number') {
                config.splice(index, 0, newSection);
            } else {
                config.push(newSection);
            }
            writeSidebarConfig(config);
            const dirPath = getSectionDir(newSection);
            if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
            return json({ success: true, section: newSection }, 201);
        }

        if (action === 'delete' && label) {
            const config = readSidebarConfig();
            const filtered = config.filter((s) => s.label !== label);
            if (filtered.length === config.length) {
                return json({ error: 'Đề mục không tồn tại' }, 404);
            }
            writeSidebarConfig(filtered);
            return json({ success: true });
        }

        if (action === 'reorder' && label && typeof index === 'number') {
            const config = readSidebarConfig();
            const idx = config.findIndex((s) => s.label === label);
            if (idx === -1) return json({ error: 'Đề mục không tồn tại' }, 404);
            const [moved] = config.splice(idx, 1);
            config.splice(index, 0, moved);
            writeSidebarConfig(config);
            return json({ success: true });
        }

        return json({ error: 'Action không hợp lệ' }, 400);
    } catch (err) {
        return json({ error: (err as Error).message }, 500);
    }
};

import type { APIRoute } from 'astro';
import { renderPreview } from '../../lib/preview';
import { json } from '../../lib/admin-utils';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
    try {
        const { content } = (await request.json()) as { content?: string };
        const html = await renderPreview(content || '');
        return json({ html });
    } catch (err) {
        return json({ error: (err as Error).message }, 500);
    }
};

import type { APIRoute } from 'astro';
import { reloadDevServer, json } from '../../lib/admin-utils';

export const prerender = false;

export const POST: APIRoute = async () => {
    try {
        reloadDevServer();
        return json({ success: true });
    } catch (err) {
        return json({ error: (err as Error).message }, 500);
    }
};

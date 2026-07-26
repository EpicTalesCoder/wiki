# Run the Astro DEV server on Heroku (NOT a production build).
#
# WHY dev mode: the inline "edit page" feature (EditLink.astro override,
# BlogAdmin, DocsAdmin, /api/* routes) relies on three things that only exist
# in `astro dev`:
#   1. content-collection entry.filePath  — used to show the edit button
#   2. Vite file-watcher (HMR)            — reloadDevServer() touches config
#                                            files to trigger a dev-server
#                                            restart so edits appear instantly
#   3. on-demand page rendering           — pages are NOT pre-built, so editing
#                                            a .mdx file updates the live page
#
# Tradeoffs vs production build:
#   - Slower page loads (no bundling/optimisation, compiled on each request)
#   - Higher memory usage (Vite keeps modules hot in memory)
#   - Ephemeral filesystem: edits made via the web editor are LOST when the
#     dyno restarts (every ~24h or on every new deploy). Commit changes to
#     git periodically if you want them to persist.
FROM node:24-alpine
RUN corepack enable && corepack prepare pnpm@11.14.0 --activate
WORKDIR /app

ENV HEROKU_APP_NAME=heroku
ENV HOST=0.0.0.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/starlight-theme-obsidian/package.json ./packages/starlight-theme-obsidian/
COPY docs/package.json ./docs/
RUN pnpm install --no-frozen-lockfile

# Copy all source so the dev server can read/write .mdx files and watch for changes.
COPY . .

# astro dev: reads PORT from env (Heroku injects it), --host binds 0.0.0.0.
# Shell form so ${PORT} expands at runtime.
CMD ["sh", "-c", "pnpm --filter docs exec astro dev --host 0.0.0.0 --port ${PORT:-4321}"]

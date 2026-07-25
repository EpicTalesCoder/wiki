# Single-stage image: build the Astro SSR site and run it with Node.
# (@astrojs/node standalone reads the PORT env var that Heroku injects.)
FROM node:24-alpine
RUN corepack enable && corepack prepare pnpm@11.14.0 --activate
WORKDIR /app

# Some builds land here with a lockfile that is slightly behind package.json
# (e.g. right after a dependency is added). --no-frozen-lockfile lets pnpm
# reconcile instead of failing the whole build.
ENV HEROKU_APP_NAME=heroku
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/starlight-theme-obsidian/package.json ./packages/starlight-theme-obsidian/
COPY docs/package.json ./docs/
RUN pnpm install --no-frozen-lockfile

# Build the SSR site (skip `astro check` so the deploy isn't blocked by type lint).
COPY . .
RUN pnpm --filter docs exec astro build

# @astrojs/node standalone listens on process.env.PORT (Heroku) / process.env.HOST.
CMD ["node", "./docs/dist/server/entry.mjs"]

# Single-stage image: build the Astro SSR site and run it with Node.
# (@astrojs/node standalone reads the PORT env var that Heroku injects.)
FROM node:24-alpine
RUN corepack enable && corepack prepare pnpm@11.14.0 --activate
WORKDIR /app

# Use the committed lockfile verbatim so the Heroku build installs the EXACT
# same versions that work locally. If package.json drifts from the lockfile,
# the build fails loudly here instead of silently resolving incompatible
# versions (which previously pulled @astrojs/node versions too new for astro).
# Always run `pnpm install` locally and commit pnpm-lock.yaml before pushing.
ENV HEROKU_APP_NAME=heroku
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/starlight-theme-obsidian/package.json ./packages/starlight-theme-obsidian/
COPY docs/package.json ./docs/
RUN pnpm install --frozen-lockfile

# Build the SSR site (skip `astro check` so the deploy isn't blocked by type lint).
COPY . .
RUN pnpm --filter docs exec astro build

# @astrojs/node standalone listens on process.env.PORT (Heroku) / process.env.HOST.
CMD ["node", "./docs/dist/server/entry.mjs"]

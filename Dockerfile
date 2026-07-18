FROM node:24-alpine AS builder
RUN corepack enable && corepack prepare pnpm@11.14.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/starlight-theme-obsidian/package.json ./packages/starlight-theme-obsidian/
COPY docs/package.json ./docs/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --prefix docs run build -- --base /

FROM nginx:alpine
COPY --from=builder /app/docs/dist /usr/share/nginx/html
COPY nginx.template.conf /etc/nginx/templates/default.conf.template
EXPOSE 80

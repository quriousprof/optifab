# ── Stage 1: install dependencies ─────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: build ────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── Stage 3: serve with caddy ─────────────────────────────────────────
FROM caddy:2-alpine AS production
ARG CADDYFILE=Caddyfile
COPY --from=build /app/dist /srv
COPY ${CADDYFILE} /etc/caddy/Caddyfile
EXPOSE 8080
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]

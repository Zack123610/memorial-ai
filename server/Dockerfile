# syntax=docker/dockerfile:1
#
# Express + Socket.IO API. Build from the repository root so the npm workspace
# lockfile is in context:
#
#   docker build -f server/Dockerfile -t memorial-server .

# Manifests only. npm resolves workspaces from the root package.json, so
# client/package.json has to be present even though the client itself is
# deployed separately to Cloudflare Pages.
FROM node:20-alpine AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

# Runtime dependencies, resolved without the toolchain.
FROM manifests AS deps
RUN npm ci --omit=dev --include-workspace-root --workspace server

# Full dependencies, so tsc is available.
FROM manifests AS build
RUN npm ci --include-workspace-root --workspace server
COPY server/tsconfig.json ./server/
COPY server/src ./server/src
RUN npm run build --workspace server

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S app && adduser -S -G app app

COPY --from=deps --chown=app:app /app/node_modules ./node_modules
COPY --from=deps --chown=app:app /app/package.json ./package.json
COPY --from=deps --chown=app:app /app/server/package.json ./server/package.json
COPY --from=build --chown=app:app /app/server/dist ./server/dist

USER app
EXPOSE 3001

# Liveness only — /api/health reports 503 when a downstream AI service is down,
# which is a degraded state for this container rather than a reason to restart.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]

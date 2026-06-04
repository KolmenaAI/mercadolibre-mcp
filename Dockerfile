# syntax=docker/dockerfile:1.7
#
# Container image for @kolmena-ai/meli-mcp.
#
# The server speaks Streamable HTTP natively on :8000 at POST /meli/mcp.
# No mcp-proxy wrapper — `Authorization: Bearer <token>` headers from the
# client are surfaced into each tool call via the MCP SDK's `requestInfo`
# and scoped per-request through AsyncLocalStorage. This is what enables
# per-user OAuth integrations like Bifrost.
#
# Override transport for stdio-style MCP client testing (Claude Desktop,
# Inspector) without changing the image:
#
#   docker run -i \
#     --entrypoint mercadolibre-mcp \
#     ghcr.io/kolmenaai/mercadolibre-mcp:<tag>
#
# (The `mercadolibre-mcp` and `meli-mcp` symlinks invoke
# `node /app/bin/mcp-server.mjs` with no flag, defaulting to stdio.)

ARG NODE_IMAGE_TAG=24.16.0-alpine3.23
ARG PNPM_VERSION=11.4.0

############################
# Stage 1 — build the MCP server with pnpm
############################
FROM node:${NODE_IMAGE_TAG} AS build
ARG PNPM_VERSION
WORKDIR /app

RUN npm install -g pnpm@${PNPM_VERSION}

# Install with the lockfile only — cached as long as lockfile + manifest are unchanged.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Produce a self-contained /prod tree with only production deps.
# --legacy is the supported deploy mode for single-package "workspaces" (no
# workspace cross-deps to inject); pnpm's non-legacy deploy only applies to
# monorepos with `workspace:` references between packages.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm deploy --legacy --filter=@kolmena-ai/meli-mcp --prod /prod

############################
# Stage 2 — runtime
############################
FROM node:${NODE_IMAGE_TAG}

LABEL org.opencontainers.image.title="mercadolibre-mcp" \
      org.opencontainers.image.source="https://github.com/KolmenaAI/mercadolibre-mcp" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app
COPY --from=build /prod /app

RUN chmod +x /app/bin/mcp-server.mjs \
 && ln -s /app/bin/mcp-server.mjs /usr/local/bin/mercadolibre-mcp \
 && ln -s /app/bin/mcp-server.mjs /usr/local/bin/meli-mcp

USER node
EXPOSE 8000

# Default the container to Streamable HTTP. Override with
# `--entrypoint mercadolibre-mcp` (or `meli-mcp`) to get stdio — the
# symlinks invoke `node /app/bin/mcp-server.mjs` with no flag, which
# defaults to stdio.
ENV PORT=8000

ENTRYPOINT ["node", "/app/bin/mcp-server.mjs", "--transport", "http"]

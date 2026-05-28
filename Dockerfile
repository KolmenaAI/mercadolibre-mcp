# syntax=docker/dockerfile:1.7
#
# Container image for @kolmena-ai/meli-mcp.
#
# Two runtime modes:
#
#   HTTP (default)
#     TBXark mcp-proxy bridges the stdio MCP server to Streamable HTTP
#     on :8000. Endpoint: POST /meli/mcp (path comes from the server
#     key in /etc/mcp-proxy/config.json).
#       docker run -p 8000:8000 ghcr.io/kolmenaai/mercadolibre-mcp:<tag>
#
#   Stdio
#     Skip the proxy and attach to the server's stdio directly. Useful
#     for local MCP clients (Claude Desktop, mcp-inspector) when run
#     against the container instead of an npm install.
#       docker run -i --entrypoint mercadolibre-mcp \
#         ghcr.io/kolmenaai/mercadolibre-mcp:<tag>
#
# Override the proxy config by mounting a file at /etc/mcp-proxy/config.json
# (downstream wrappers can also COPY a replacement at build time).

ARG NODE_IMAGE_TAG=24.15.0-alpine3.23
ARG MCP_PROXY_GIT_REF=v0.43.2

############################
# Stage 1 — build the MCP server (Node/TypeScript)
############################
FROM node:${NODE_IMAGE_TAG} AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

############################
# Stage 2 — build TBXark mcp-proxy (Go, stdio→HTTP bridge)
############################
FROM golang:1.24-alpine AS bridge-builder
ARG MCP_PROXY_GIT_REF

RUN apk add --no-cache git ca-certificates

RUN git clone --depth=1 --branch "${MCP_PROXY_GIT_REF}" \
      https://github.com/TBXark/mcp-proxy.git /src
WORKDIR /src
RUN CGO_ENABLED=0 GOOS=linux go build \
      -ldflags='-s -w' -trimpath \
      -o /out/mcp-proxy .

############################
# Stage 3 — runtime
############################
FROM node:${NODE_IMAGE_TAG}

LABEL org.opencontainers.image.title="mercadolibre-mcp" \
      org.opencontainers.image.source="https://github.com/KolmenaAI/mercadolibre-mcp" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app
COPY --from=build /app /app
COPY --from=bridge-builder /out/mcp-proxy /usr/local/bin/mcp-proxy
COPY config/mcp-proxy.docker.json /etc/mcp-proxy/config.json

RUN chmod +x /app/bin/mcp-server.mjs \
 && ln -s /app/bin/mcp-server.mjs /usr/local/bin/mercadolibre-mcp \
 && ln -s /app/bin/mcp-server.mjs /usr/local/bin/meli-mcp

USER node
EXPOSE 8000

ENTRYPOINT ["/usr/local/bin/mcp-proxy", "--config", "/etc/mcp-proxy/config.json"]

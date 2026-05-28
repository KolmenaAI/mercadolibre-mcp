# Handoff — deploy `@kolmena-ai/meli-mcp` to `mcp-meli` (Kubernetes)

Local MCP work is **buyer-ready** for catalog search + product detail. Seller tools and OAuth refresh are **not** in this package yet.

## What changed vs `@dan1d/mercadolibre-mcp@1.0.2`

| Area | Upstream | This fork |
|------|----------|-----------|
| Search | `/sites/{site}/search?q=` | `/products/search` (requires token) |
| Detail after search | `/items/{id}` only | `/products/{id}` + auto-fallback on `get_item` |
| Tools | 8 | 9 (`get_product` added) |

## Image build (replace dan1d in existing `mcp-meli` Dockerfile)

Keep the same layout as production today:

- **PID 1:** `mcp-proxy --config /etc/mcp-proxy/config.json`
- **Child:** `node …/bin/mcp-server.mjs` (stdio)
- **Port:** 8000 (`streamable-http`)
- **Env:** `MERCADOLIBRE_ACCESS_TOKEN` from secret `mcp-meli-token` (optional but required for search)

Minimal change in the image build stage:

```dockerfile
# was: npm install -g @dan1d/mercadolibre-mcp@1.0.2
COPY . /opt/meli-mcp
WORKDIR /opt/meli-mcp
RUN npm ci && npm run build
```

`config.json` for mcp-proxy:

```json
{
  "mcpProxy": { "addr": ":8000", "name": "kolmena-mcp-meli", "version": "1.0.4", "type": "streamable-http" },
  "mcpServers": {
    "meli": { "command": "node", "args": ["bin/mcp-server.mjs"], "cwd": "/opt/meli-mcp" }
  }
}
```

Tag example: `goharbor.b100pro.com/kolmena-ai/mcp-meli:1.0.4-kolmena.0`

## Fleet / Helm (`cb-cluster`)

1. Bump image tag on Deployment `mcp-meli` (namespace `kolmena-mcp`).
2. Keep **`dnsConfig.options.ndots: "1"`** (and attempts/timeout) under pod template — required for Node → `api.mercadolibre.com`.
3. Secret `mcp-meli-token` / key `access-token` → `MERCADOLIBRE_ACCESS_TOKEN`.
4. Bifrost client `mercadolibre` URL unchanged: `http://mcp-meli.kolmena-mcp.svc.cluster.local:8000`.
5. After rollout, re-run tool discovery (or call one tool) so Bifrost sees **9 tools** if it caches counts.

## Smoke test in cluster

```bash
kubectl exec -n kolmena-mcp deploy/mcp-meli -- node -e "
import('@kolmena-ai/meli-mcp').catch(() =>
  import('/opt/meli-mcp/dist/index.js')
).then(async (m) => {
  const t = m.createMercadoLibreTools(process.env.MERCADOLIBRE_ACCESS_TOKEN);
  const s = await t.tools.search_items({ query: 'iPhone 15', site_id: 'MLA', limit: 2 });
  console.log(s.search_api, (s.results||[]).length);
});
"
```

## Kolmena backend

No code change required for deploy if `bifrostClientName: mercadolibre` and tool names stay prefixed `mercadolibre-*`. Optional later: catalog row description mentioning catalog search.

## Not in scope (follow-up)

- Seller MCP tools (orders, listings) — use `meli-api` skill today or extend this fork.
- OAuth refresh inside the MCP process.
- Marketplace **listing** keyword search (if ML grants `/sites/search?q=` or another public listings API).
- Buyer **skill** for tool chaining (separate from this repo).

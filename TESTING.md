# Testing `@kolmena-ai/meli-mcp` with MCP Inspector

[MCP Inspector](https://github.com/modelcontextprotocol/inspector) is the official browser UI to connect to an MCP server, list tools, and run each tool with JSON arguments. No permanent install — it runs via `npx`.

## Prerequisites

- **Node.js 18+** (you have Node 24 in the meli-mcp image; 18+ is enough locally)
- Built server: `pnpm build`
- Optional: `MERCADOLIBRE_ACCESS_TOKEN` for endpoints that need auth (see per-tool notes below)

## Option A — One command (recommended)

From this directory:

```bash
cd /workspace/kolmena/meli-mcp
pnpm build
pnpm inspector
```

With a Mercado Libre access token:

```bash
MERCADOLIBRE_ACCESS_TOKEN='APP_USR-...' pnpm inspector:auth
```

The terminal prints something like:

```text
🔍 MCP Inspector is up and running at http://127.0.0.1:6274
🔗 Open inspector with token pre-filled:
   http://localhost:6274/?MCP_PROXY_AUTH_TOKEN=...
```

1. **Open that URL** in your browser (copy the full link including the token).
2. Inspector **starts your MCP server automatically** (stdio) — you do not run `pnpm start` in another terminal.
3. If the UI is empty, click **Connect** on the left (transport should already be stdio).

## Option B — Manual launch

```bash
cd /workspace/kolmena/meli-mcp
pnpm build
npx @modelcontextprotocol/inspector node /workspace/kolmena/meli-mcp/bin/mcp-server.mjs
```

With env:

```bash
npx @modelcontextprotocol/inspector \
  -e MERCADOLIBRE_ACCESS_TOKEN="APP_USR-..." \
  -- node /workspace/kolmena/meli-mcp/bin/mcp-server.mjs
```

## Option C — Configure in the UI (no npx args)

If you start Inspector alone:

```bash
npx @modelcontextprotocol/inspector
```

Then in the left panel:

| Field | Value |
|--------|--------|
| Transport | **stdio** |
| Command | `node` |
| Arguments | `/workspace/kolmena/meli-mcp/bin/mcp-server.mjs` |
| Working directory | `/workspace/kolmena/meli-mcp` |
| Environment | `MERCADOLIBRE_ACCESS_TOKEN=APP_USR-...` (optional) |

Click **Connect**.

## Using the UI (step by step)

1. **Connect** — status should show connected; no error in the console panel.
2. Open the **Tools** tab → **List Tools** — you should see **9 tools**.
3. Click a tool name → fill **JSON arguments** on the right → **Run Tool**.
4. Read the result in the panel (JSON text, or an error message).

### Ports

| Port | Role |
|------|------|
| 6274 | Inspector web UI |
| 6277 | Inspector proxy (internal) |

If something is already using those ports, set `CLIENT_PORT` / `SERVER_PORT` before running Inspector.

---

## All 8 tools — suggested test payloads

Run in this order where possible; later steps reuse IDs from earlier results.

### 1. `get_categories`

```json
{ "site_id": "MLA" }
```

**Expect:** JSON array of top-level categories. Pick any `id` (e.g. `MLA1055`) for step 4.

### 2. `get_trends`

```json
{ "site_id": "MLA" }
```

**Expect:** Trending searches for Argentina.

### 3. `get_currency_conversion`

```json
{ "from": "USD", "to": "ARS", "amount": 10 }
```

**Expect:** Conversion result with rates.

### 4. `get_category`

Use an `id` from step 1:

```json
{ "category_id": "MLA1055" }
```

**Expect:** Category name, path, children.

### 5. `search_items`

Requires `MERCADOLIBRE_ACCESS_TOKEN` (use `pnpm inspector:auth`).

```json
{
  "query": "iPhone 15",
  "site_id": "MLA",
  "limit": 3
}
```

**Expect:** JSON with `search_api: "products/search"` and `results[].id` catalog product ids (e.g. `MLA16240160`). Optional filter: `"category": "MLA-CELLPHONES"` (maps to `domain_id`).

### 6. `get_product` (recommended after search)

Use `results[].id` from step 5:

```json
{ "product_id": "MLA55016525" }
```

**Expect:** `resource_type: catalog_product` with `product.name`, `permalink`, `attributes`, etc.

### 7. `get_item`

Same id as search works — auto-falls back to catalog if not a listing:

```json
{ "item_id": "MLA55016525" }
```

**Expect:** `catalog_product` wrapper with `product` object, or `marketplace_item` if it is a real listing id.

### 8. `get_item_description`

Same id from search:

```json
{ "item_id": "MLA55016525" }
```

**Expect:** `plain_text` from catalog `short_description` (not `/items/.../description`).

### 9. `get_seller_info`

Use `seller_id` from step 6’s response (`seller_id` field), or example:

```json
{ "seller_id": 123456789 }
```

Replace with a real numeric seller id from `get_item`.

---

## CLI smoke test (no browser)

Runs all tools from the terminal (good for CI or quick checks):

```bash
pnpm smoke
```

With token:

```bash
MERCADOLIBRE_ACCESS_TOKEN='APP_USR-...' pnpm smoke
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Cannot find module '../dist/mcp-server.js'` | Run `pnpm build` first |
| UI asks for auth token | Open the full URL from the terminal (`MCP_PROXY_AUTH_TOKEN=...`) |
| Connection failed | Use absolute paths for `node` and `bin/mcp-server.mjs` |
| `search_items` → 403 / forbidden | Known ML API restriction; not an Inspector bug |
| `PA_UNAUTHORIZED_RESULT_FROM_POLICIES` | Datacenter IP blocked by Mercado Libre — test from your laptop or with a valid token |
| `get_currency_conversion` → 401 token not informed | Set `MERCADOLIBRE_ACCESS_TOKEN` (use `pnpm inspector:auth`) |
| `get_item` → 404 | Item id invalid or delisted; try another id from search |
| Remote dev machine | Open the printed `http://127.0.0.1:6274` via your IDE port-forward or SSH tunnel |

## References

- Inspector repo: https://github.com/modelcontextprotocol/inspector
- npm: https://www.npmjs.com/package/@modelcontextprotocol/inspector

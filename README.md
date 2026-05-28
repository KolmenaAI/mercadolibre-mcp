# @kolmena-ai/meli-mcp

> **Kolmena fork** of [dan1d/mercadolibre-mcp](https://github.com/dan1d/mercadolibre-mcp). See [FORK.md](./FORK.md) for upstream sync and local dev.

**MercadoLibre marketplace for AI agents.**

[![npm version](https://img.shields.io/npm/v/@dan1d/mercadolibre-mcp)](https://www.npmjs.com/package/@dan1d/mercadolibre-mcp)
[![tests](https://img.shields.io/github/actions/workflow/status/dan1d/mercadolibre-mcp/ci.yml?label=tests)](https://github.com/dan1d/mercadolibre-mcp/actions)
[![npm downloads](https://img.shields.io/npm/dm/@dan1d/mercadolibre-mcp)](https://www.npmjs.com/package/@dan1d/mercadolibre-mcp)
[![license](https://img.shields.io/npm/l/@dan1d/mercadolibre-mcp)](./LICENSE)

MCP server that connects AI agents to [MercadoLibre](https://www.mercadolibre.com), the largest e-commerce marketplace in Latin America (150M+ users). Search catalog products, get product details, browse categories, track trends, and convert currencies across Argentina, Brazil, Mexico, Chile, Colombia, and more.

**Kolmena docs:** [TESTING.md](./TESTING.md) · [BUYER-API-ROADMAP.md](./BUYER-API-ROADMAP.md) · [HANDOFF.md](./HANDOFF.md) · [CHANGELOG.md](./CHANGELOG.md)

---

## Kolmena buyer workflow

Most calls need `MERCADOLIBRE_ACCESS_TOKEN` (OAuth `APP_USR-...`).

1. **`search_items`** — keyword search → `results[].id` are **catalog product ids**
2. **`get_product`** — full datasheet for that id (recommended)
3. **`get_item`** / **`get_item_description`** — same id works (auto-fallback to catalog if not a listing)
4. Use **`product.permalink`** from the response as the buyer link

Ids from search are **not** marketplace listing ids; `/items/MLA55016525` alone will 404 without fallback.

```bash
pnpm install && pnpm build
export MERCADOLIBRE_ACCESS_TOKEN='APP_USR-...'
pnpm inspector:auth   # MCP Inspector UI
```

---

## Quick Start (upstream / npx)

Upstream `@dan1d/mercadolibre-mcp` used public `/sites/.../search`; this fork uses `/products/search` and requires a token for search.

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mercadolibre": {
      "command": "npx",
      "args": ["-y", "@dan1d/mercadolibre-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add mercadolibre -- npx -y @dan1d/mercadolibre-mcp
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "mercadolibre": {
      "command": "npx",
      "args": ["-y", "@dan1d/mercadolibre-mcp"]
    }
  }
}
```

### Windsurf

```json
{
  "mcpServers": {
    "mercadolibre": {
      "command": "npx",
      "args": ["-y", "@dan1d/mercadolibre-mcp"]
    }
  }
}
```

### With authentication (optional)

For endpoints that require auth (future premium features), add your access token:

```json
{
  "mcpServers": {
    "mercadolibre": {
      "command": "npx",
      "args": ["-y", "@dan1d/mercadolibre-mcp"],
      "env": {
        "MERCADOLIBRE_ACCESS_TOKEN": "APP_USR-..."
      }
    }
  }
}
```

> Once configured, ask your AI assistant things like: *"Search for iPhone 15 on MercadoLibre"* or *"What are the trending searches in Argentina?"* or *"Show me details for item MLA1234567890"*

---

## Available Tools (Kolmena fork)

Upstream `@dan1d/mercadolibre-mcp@1.0.2` shipped 8 buyer-only tools. This fork ships **77 tools** (36 buyer + 41 seller). The full per-call API mapping lives in [BUYER-API-ROADMAP.md](./BUYER-API-ROADMAP.md) and [SELLER-API-ROADMAP.md](./SELLER-API-ROADMAP.md). Most calls require `MERCADOLIBRE_ACCESS_TOKEN`; seller tools additionally require that the token belongs to the seller account being queried.

### Buyer — search & catalog

| Tool | Description |
|------|-------------|
| `search_items` | Catalog keyword search (`GET /products/search`). Returns catalog product ids. |
| `search_buyable_listings` | Composite workaround: catalog → buy box → price filter → optional seller reputation. Use for "listings under $X with seller ratings". |
| `search_listings` | Tries legacy `GET /sites/{site}/search?q=`; on 403 returns a fallback hint to `search_buyable_listings`. |
| `search_listings_by_seller` | Listings from one seller (`GET /sites/{site}/search?seller_id=`). |
| `get_product` | Catalog product datasheet (`GET /products/{id}`). |
| `get_product_buybox` | Buy box winner listing id and price range for a catalog product. |
| `get_product_listings` | Competing listings on a catalog PDP (deprecated by ML — prefer buy box). |
| `compare_products` | Compare 2–5 listings; optional reviews and shipping. |

### Buyer — item detail

| Tool | Description |
|------|-------------|
| `get_item` | Marketplace listing, with auto-fallback to catalog product if id came from search. |
| `get_items_bulk` | Up to 20 listings in one call (`GET /items?ids=`). |
| `get_item_description` | Listing description, or catalog `short_description` on fallback. |
| `get_item_reviews` | Product reviews and `rating_average`. |
| `get_item_shipping_options` | Shipping options and costs for a listing; optional `zip_code`. |
| `get_item_sale_terms` | Installments, warranty, `sale_terms`. |

### Buyer — categories & domains

| Tool | Description |
|------|-------------|
| `get_categories` | Top-level categories for a site. |
| `get_category` | Category tree node by id. |
| `get_category_attributes` | Category attribute definitions for spec comparison. |
| `get_domain_discovery` | Map a vague query to catalog domains. |

### Buyer — sellers & stores

| Tool | Description |
|------|-------------|
| `get_seller_info` | Seller profile and reputation. |
| `get_seller_response_time` | Average question response time. |
| `get_official_store` | Official store metadata. |

### Buyer — Q&A and trends

| Tool | Description |
|------|-------------|
| `get_item_questions` | Q&A on a listing. |
| `ask_seller_question` | Post a pre-sale question (max 2000 chars). |
| `get_question` | Single question by id. |
| `get_trends` | Trending searches for a site. |
| `get_currency_conversion` | FX rate between currencies. |

### Buyer — post-purchase (token-bound)

| Tool | Description |
|------|-------------|
| `get_me` | Current OAuth user (`GET /users/me`). |
| `get_my_orders` | Buyer orders; defaults `buyer_id` to `/users/me`. |
| `get_order` | Order detail. |
| `get_order_shipments` | Shipments for an order. |
| `get_shipment` | Shipment tracking detail. |
| `get_order_discounts` | Discounts applied to an order. |
| `get_order_feedback` | Feedback state for an order. |
| `search_my_claims` | Post-purchase claims for the token user. |
| `get_claim` | Claim detail. |
| `get_claim_returns` | Return status for a claim. |

### Seller — account & inventory

| Tool | Description |
|------|-------------|
| `seller_get_me` | Authenticated seller account snapshot. |
| `seller_list_my_items` | List your listing ids. |
| `seller_get_my_item` | One of your listings; rejects items owned by another seller. |
| `seller_get_my_items_bulk` | Up to 20 of your listings. |
| `seller_get_my_item_description` | Description for your listing. |
| `seller_get_store_snapshot` | Daily store summary: account, recent orders, unanswered questions, low stock. |
| `seller_inventory_report` | Low stock, fast sellers, and dead stock. |
| `seller_audit_listings` | Audit active listings: health, title length, category attributes sample. |
| `seller_get_listing_health` | Listing quality / health (`GET /items/{id}/health`). |
| `seller_get_item_visits` | Visit metrics (last 30 days by default). |
| `seller_list_performance_rankings` | Rank listings by sold quantity, visits, or stock. |
| `seller_get_item_price_to_win` | Catalog competition price hint. |

### Seller — orders & shipments

| Tool | Description |
|------|-------------|
| `seller_search_orders` | Seller orders. |
| `seller_get_order` | Order detail for your store. |
| `seller_get_order_shipments` | Shipments for an order. |
| `seller_get_shipment` | Shipment tracking detail. |
| `seller_get_order_discounts` | Discounts on an order. |
| `seller_list_orders_by_status` | Orders filtered by status (paid, cancelled, …). |
| `seller_find_shipping_exceptions` | Delayed or problematic shipments among recent orders. |
| `seller_list_pending_shipments` | Shipments for paid orders awaiting dispatch. |

### Seller — Q&A and messages

| Tool | Description |
|------|-------------|
| `seller_list_unanswered_questions` | Buyer questions awaiting your answer. |
| `seller_list_my_item_questions` | All questions on one of your listings. |
| `seller_get_question` | Single question by id. |
| `seller_answer_question` | Post an answer (max 2000 chars). |
| `seller_list_message_packs` | Pending post-sale message packs. |
| `seller_get_pack_messages` | Messages in a post-sale pack. |

### Seller — listing mutations

| Tool | Description |
|------|-------------|
| `seller_update_my_item` | Update price, stock, or status (`PUT /items/{id}`). Variation-aware. |
| `seller_update_my_item_description` | Update listing description plain text. |
| `seller_get_listing_requirements` | Required category attributes + publish checklist. |
| `seller_upload_listing_picture` | Upload image to seller library; returns `picture_id`. |
| `seller_validate_listing` | Dry-run `POST /items/validate`. |
| `seller_create_listing` | Publish a live listing (`POST /items`). |

### Seller — promotions, claims, feedback

| Tool | Description |
|------|-------------|
| `seller_list_promotions` | List seller promotions. |
| `seller_get_promotion` | Promotion detail by id. |
| `seller_create_promotion_draft` | Create a seller promotion (test users auto-detected). |
| `seller_search_claims` | Search post-purchase claims for your account. |
| `seller_get_claim` | Claim detail. |
| `seller_get_claim_returns` | Return status for a claim. |
| `seller_submit_claim_action` | Submit an action on a claim. |
| `seller_list_feedback` | Feedback received as seller. |
| `seller_reply_feedback` | Reply to buyer feedback. |

---

## Supported Sites

| Site ID | Country |
|---------|---------|
| `MLA` | Argentina |
| `MLB` | Brazil |
| `MLM` | Mexico |
| `MLC` | Chile |
| `MCO` | Colombia |
| `MLU` | Uruguay |
| `MPE` | Peru |
| `MEC` | Ecuador |
| `MCR` | Costa Rica |
| `MPA` | Panama |
| `MLV` | Venezuela |
| `MRD` | Dominican Republic |
| `MHN` | Honduras |
| `MBO` | Bolivia |
| `MNI` | Nicaragua |
| `MPY` | Paraguay |
| `MSV` | El Salvador |
| `MGT` | Guatemala |

---

## Example Prompts

- "Search for iPhone 15 on MercadoLibre Argentina"
- "Show me details for catalog product MLA55016525"
- "What's the description for the first search result?"
- "What are the trending searches in Brazil?"
- "List all categories on MercadoLibre Mexico"
- "Show me the reputation of seller 123456789"
- "Convert 100 USD to ARS"

---

## Programmatic Usage

```bash
npm install @dan1d/mercadolibre-mcp
```

```typescript
import { createMercadoLibreTools } from "@dan1d/mercadolibre-mcp";

const ml = createMercadoLibreTools();

// Search products
const results = await ml.tools.search_items({
  query: "iPhone 15",
  site_id: "MLA",
  price_max: 2000000,
  limit: 5,
});

// Get item details
const item = await ml.tools.get_item({ item_id: "MLA1405857684" });

// Get trending searches in Argentina
const trends = await ml.tools.get_trends({ site_id: "MLA" });

// Browse categories
const categories = await ml.tools.get_categories({ site_id: "MLA" });

// Get seller reputation
const seller = await ml.tools.get_seller_info({ seller_id: 123456789 });

// Convert currencies
const conversion = await ml.tools.get_currency_conversion({
  from: "USD",
  to: "BRL",
  amount: 100,
});
```

---

## Docker

A container image is published at `ghcr.io/kolmenaai/mercadolibre-mcp:<version>` for self-hosted deployments. It bundles the MCP server and [TBXark/mcp-proxy](https://github.com/TBXark/mcp-proxy), so it runs in either **HTTP** (default) or **stdio** mode.

### Pull a published image

```bash
docker run -p 8000:8000 \
  -e MERCADOLIBRE_ACCESS_TOKEN="${MERCADOLIBRE_ACCESS_TOKEN}" \
  ghcr.io/kolmenaai/mercadolibre-mcp:1.3.0
```

The server speaks Streamable HTTP at `POST http://localhost:8000/meli/mcp`.

### Build locally

From the repo root:

```bash
docker buildx build --load -t mercadolibre-mcp:dev .
```

This builds for your current architecture and loads the result into the local docker daemon so `docker run mercadolibre-mcp:dev` works. The CI workflow does multi-arch (`linux/amd64,linux/arm64`) and pushes to GHCR — local multi-arch builds require switching to the `docker-container` buildx driver and can't be `--load`ed into the local daemon, so they're rarely worth it outside CI.

### Test the local image — HTTP mode (default)

```bash
docker run --rm -p 8000:8000 \
  -e MERCADOLIBRE_ACCESS_TOKEN="${MERCADOLIBRE_ACCESS_TOKEN}" \
  mercadolibre-mcp:dev
```

In another terminal:

```bash
# TCP liveness
nc -zv localhost 8000

# Initialize and list tools
curl -s -X POST http://localhost:8000/meli/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Call a tool
curl -s -X POST http://localhost:8000/meli/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_items","arguments":{"query":"PlayStation 5","site_id":"MLA","limit":3}}}'
```

### Test the local image — stdio mode

Override the entrypoint to skip mcp-proxy and attach an MCP client directly to the container's stdin/stdout:

```bash
docker run --rm -i \
  --entrypoint mercadolibre-mcp \
  -e MERCADOLIBRE_ACCESS_TOKEN="${MERCADOLIBRE_ACCESS_TOKEN}" \
  mercadolibre-mcp:dev
```

Useful as a sanity check from a shell:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
| docker run --rm -i \
    --entrypoint mercadolibre-mcp \
    -e MERCADOLIBRE_ACCESS_TOKEN="${MERCADOLIBRE_ACCESS_TOKEN}" \
    mercadolibre-mcp:dev
```

### Override the proxy config

The default proxy config is baked at `/etc/mcp-proxy/config.json` (source: [`config/mcp-proxy.docker.json`](./config/mcp-proxy.docker.json)). To change the path, port, or `panicIfInvalid` behavior at runtime, mount your own:

```bash
docker run --rm -p 8000:8000 \
  -v "$(pwd)/my-config.json:/etc/mcp-proxy/config.json:ro" \
  -e MERCADOLIBRE_ACCESS_TOKEN="${MERCADOLIBRE_ACCESS_TOKEN}" \
  mercadolibre-mcp:dev
```

---

## Part of the LATAM MCP Toolkit

| Server | What it does |
|--------|-------------|
| [CobroYa](https://github.com/dan1d/mercadopago-tool) | Mercado Pago payments — create links, search payments, refunds |
| **MercadoLibre MCP** | MercadoLibre marketplace — search products, categories, trends |
| [DolarAPI MCP](https://github.com/dan1d/dolar-mcp) | Argentine exchange rates — blue, oficial, CCL, crypto, conversion |

---

## License

[MIT](./LICENSE) -- by [dan1d](https://dan1d.dev/)

# @kolmena-ai/meli-mcp

> **Kolmena fork** of [dan1d/mercadolibre-mcp](https://github.com/dan1d/mercadolibre-mcp). See [FORK.md](./FORK.md) for upstream sync and local dev.

**MercadoLibre marketplace for AI agents.**

[![npm version](https://img.shields.io/npm/v/@dan1d/mercadolibre-mcp)](https://www.npmjs.com/package/@dan1d/mercadolibre-mcp)
[![tests](https://img.shields.io/github/actions/workflow/status/dan1d/mercadolibre-mcp/ci.yml?label=tests)](https://github.com/dan1d/mercadolibre-mcp/actions)
[![npm downloads](https://img.shields.io/npm/dm/@dan1d/mercadolibre-mcp)](https://www.npmjs.com/package/@dan1d/mercadolibre-mcp)
[![license](https://img.shields.io/npm/l/@dan1d/mercadolibre-mcp)](./LICENSE)

MCP server that connects AI agents to [MercadoLibre](https://www.mercadolibre.com), the largest e-commerce marketplace in Latin America (150M+ users). Search catalog products, get product details, browse categories, track trends, and convert currencies across Argentina, Brazil, Mexico, Chile, Colombia, and more.

**Kolmena docs:** [TESTING.md](./TESTING.md) · [BUYER-API-ROADMAP.md](./BUYER-API-ROADMAP.md) · [HANDOFF.md](./HANDOFF.md) · [CHANGELOG.md](./CHANGELOG.md)

> **v1.10.0 — Read a single pasted listing.** New `get_listing_offer` answers "pasame el precio y envío de la publicación MLA…": it takes a listing id or URL and returns the live website price, installments, shipping and seller (`price_source: web`). This fills the gap left when the buyer-inaccessible `/items/{id}` tools were removed — a pasted listing id no longer dead-ends. See [Tools](#buyer--search--catalog).
>
> **v1.9.4 — Web offers from website search.** When Mercado Libre's catalog API exposes no buy-box price (common for iPhone / MacBook / refurbished — and especially niche or just-released models), the server now recovers offers from the **website search** (the same ranking a shopper sees) instead of scraping the catalog API's product matches, then best-effort enriches the top hits with seller/installments. This fixes new models like "MacBook Air M4" where the catalog API returned the wrong/older variants. Offers are tagged `price_source: "web"` with a clickable `permalink`. Buyer agents no longer need a browser. See [Web price enrichment](#web-price-enrichment-apify).

---

## Web price enrichment (Apify)

Mercado Libre's catalog API returns **no price** for products without an active buy-box winner, and ML blocks plain HTTP scraping. To recover the live price deterministically — server-side, with no agent-driven browser — the MCP server calls an [Apify](https://apify.com) Mercado Libre actor (a real browser behind residential proxies) and merges the result into the tool response.

**What gets enriched (only when `APIFY_TOKEN` is set):**

| Tool | Enrichment |
|------|------------|
| `find_offers_for_product_query` | When the catalog API exposes no price, offers are sourced from the live **website search** (right products for niche/new models) and promoted into `offers[]` with `price_source: "web"` + clickable `permalink`. Top hits are best-effort enriched with seller/installments; a slow product page degrades to price+link. Bounded by `SCRAPE_LIMIT`. |
| `get_listing_offer` | Scrapes a **single pasted listing** (id `MLA…` or URL) for its live price, installments, free-shipping/shipping, condition, availability and seller (`price_source: web`). |
| `get_product_buybox` | Returns `web_offer` (live price + seller + installments + shipping) when there is no API buy-box winner. |
| `search_items` | With `include_web_prices: true`, adds `web_offers[]` (catalog search returns price-less ids otherwise). |
| `rank_sellers_for_query` | Adds `web_ranked_sellers[]` — sellers + cheapest live price — reliable even when official seller-inventory endpoints are blocked. |
| `get_seller_info` | With `include_catalog: true`, adds `web_storefront` (seller's live catalog + reputation). |
| `get_item_reviews` | Falls back to scraped web reviews (`reviews_source: "web"`) when the official reviews API is empty. |

**Design notes:**

- **One shared token.** `APIFY_TOKEN` is a process-wide server secret read once from the environment — it serves every agent/user. It is **not** part of the per-user Mercado Libre OAuth (which still flows in as `Authorization: Bearer`) and must not be configured in Bifrost or per-agent settings.
- **Fail-soft.** Missing token, timeout, HTTP error, or empty dataset all degrade silently to "no enrichment" — a scrape failure never breaks a tool call.
- **Bounded + cached.** Each call scrapes at most `SCRAPE_LIMIT` products; results are TTL-cached (`SCRAPE_CACHE_TTL_MS`) to control cost (~$0.005 / scraped product) and latency.
- **Swappable.** The provider lives behind a `ScraperProvider` interface in [`src/apify-scraper.ts`](./src/apify-scraper.ts); switching backends touches one file.

```bash
export APIFY_TOKEN='apify_api_...'
# optional overrides:
export APIFY_ML_ACTOR='sourabhbgp~mercadolibre-scraper'
export SCRAPE_LIMIT=3
```

---

## Kolmena buyer workflow

Most calls need `MERCADOLIBRE_ACCESS_TOKEN` (OAuth `APP_USR-...`).

1. **`search_items`** — keyword search → `results[].id` are **catalog product ids**
2. **`get_product`** — full datasheet for that id (recommended)
3. **`find_offers_for_product_query`** — offers (price + seller + permalink) for what the user wants to buy
4. Use **`product.permalink`** / each offer's `permalink` as the buyer link

Ids from search are **catalog product ids**, not marketplace listing ids.

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
| `search_items` | Catalog keyword search (`GET /products/search`). Returns catalog product ids. With `include_web_prices` adds live web prices. |
| `find_offers_for_product_query` | Product-scoped offers: catalog buy-box + live website-search offers (`price_source` api/web). Use for "what can I buy / sellers and prices for X". |
| `get_listing_offer` | Price/shipping/seller for **one specific listing** the user pastes by id (`MLA…`) or URL. Resolves a bare id to the listing page and scrapes it (`price_source: web`). The only way to read a bare listing id (there is no catalog/API tool for it). |
| `get_product` | Catalog product datasheet (`GET /products/{id}`). |
| `get_product_buybox` | Buy box winner listing id and price range for a catalog product; web price fallback. |

### Buyer — item detail

| Tool | Description |
|------|-------------|
| `get_item_description` | Listing description, or catalog `short_description` on fallback. |
| `get_item_reviews` | Product reviews and `rating_average`; scraped web-review fallback. |

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
| `seller_audit_listings` | Audit active listings: quality (performance), title length, category attributes sample. |
| `seller_get_listing_health` | Listing quality (`GET /item/{id}/performance`): score, level, opportunities/warnings. |
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
| `seller_update_my_item` | Update price, stock, or status (`PUT /items/{id}`). Variation-aware. **Not for pictures.** |
| `seller_add_listing_pictures` | Add/replace pictures on an existing listing. Merges new ids with existing by default. |
| `seller_update_my_item_description` | Update listing description plain text. |
| `seller_get_listing_requirements` | Required category attributes + publish checklist. |
| `seller_upload_listing_picture` | Upload to seller library → `picture_id`. Pair with `seller_add_listing_pictures` (existing ad) or `seller_create_listing` (new). |
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

A container image is published at `ghcr.io/kolmenaai/mercadolibre-mcp:<version>` for self-hosted deployments. The server speaks **Streamable HTTP natively** on `:8000` at `POST /meli/mcp` — no proxy wrapper, so the inbound `Authorization: Bearer <token>` header reaches each tool call and per-user OAuth gateways (Bifrost, etc.) work out of the box.

### Pull a published image

```bash
docker run -p 8000:8000 \
  -e MERCADOLIBRE_ACCESS_TOKEN="${MERCADOLIBRE_ACCESS_TOKEN}" \
  ghcr.io/kolmenaai/mercadolibre-mcp:1.6.0
```

The server speaks Streamable HTTP at `POST http://localhost:8000/meli/mcp`. Liveness probe: `GET /healthz` returns `ok`.

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
# Liveness
curl -s http://localhost:8000/healthz

# Initialize and list tools
curl -s -X POST http://localhost:8000/meli/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Call a tool with a per-request token (overrides MERCADOLIBRE_ACCESS_TOKEN)
curl -s -X POST http://localhost:8000/meli/mcp \
  -H "Authorization: Bearer ${USER_MERCADOLIBRE_TOKEN}" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_me","arguments":{}}}'
```

To verify token propagation end-to-end, set `MELI_AUTH_TRACE=1` in the container — each tool response will prepend a redacted `inbound_source=request|default|none` / `inbound_fp=<sha256[:10]>` line.

### Test the local image — stdio mode

Override the ENTRYPOINT to run the same binary in stdio mode (the `mercadolibre-mcp` and `meli-mcp` symlinks invoke `node /app/bin/mcp-server.mjs` with no `--transport` flag, defaulting to stdio):

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

### Runtime knobs

Transport is selected by a single CLI flag: `--transport stdio|http`. The Docker image's ENTRYPOINT bakes `--transport http`; the `mercadolibre-mcp` / `meli-mcp` symlinks invoke the script without the flag, defaulting to stdio. The MCP endpoint path (`/meli/mcp`) is a hardcoded constant — Bifrost has it baked into its client config.

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `8000` | HTTP listen port. |
| `MERCADOLIBRE_ACCESS_TOKEN` | _(unset)_ | Fallback token used when no inbound `Authorization: Bearer` is present. |
| `MELI_AUTH_TRACE` | _(unset)_ | Set to `1` to emit redacted token-source traces for verifying per-user OAuth wiring. |
| `APIFY_TOKEN` | _(unset)_ | **Enables web price enrichment.** Shared Apify API token (see [Web price enrichment](#web-price-enrichment-apify)). One token serves all agents; not per-user. |
| `APIFY_ML_ACTOR` | `sourabhbgp~mercadolibre-scraper` | Apify actor id used for product/search/seller/reviews scraping. |
| `APIFY_TIMEOUT_MS` | `45000` | Per-scrape timeout. Failures degrade silently to no enrichment. Keep strictly below the MCP gateway tool-execution timeout (recommended Bifrost = 60s). |
| `WEB_DETAIL_TIMEOUT_MS` | `20000` | Per-call timeout for the best-effort seller/installments product-detail scrape in `find_offers_for_product_query`. A slow page degrades to the search hit's price+link. |
| `SCRAPE_LIMIT` | `3` | Max web offers returned per `find_offers_for_product_query` call (capped at 5). |
| `SCRAPE_CACHE_TTL_MS` | `600000` | In-memory TTL cache for scrape results (10 min). |

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

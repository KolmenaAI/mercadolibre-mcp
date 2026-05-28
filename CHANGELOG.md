# Changelog — @kolmena-ai/meli-mcp

## 1.3.0

First release under the `@kolmena-ai/` scope. Fork of [`@dan1d/mercadolibre-mcp@1.0.2`](https://www.npmjs.com/package/@dan1d/mercadolibre-mcp) (8 buyer tools) expanded to **77 tools** (36 buyer + 41 seller).

### Buyer

- **Catalog search rewrite** — `search_items` now hits `GET /products/search` (token-bound) instead of the upstream `GET /sites/{site}/search?q=` which started returning 403 for many apps. Response is wrapped with `search_api` / `result_type: catalog_product` so callers can tell which API answered.
- **Catalog fallback** — `get_item` and `get_item_description` fall back to `GET /products/{id}` when `/items/{id}` returns 404, so catalog ids returned by `search_items` (e.g. `MLA55016525`) work without an extra round trip.
- **`get_product`** — explicit `GET /products/{id}` for catalog datasheets.
- **Buyer suite (27 new tools)** — compare, reviews, shipping, Q&A, orders, shipments, claims, domain discovery, official stores, seller response time, etc.
- **`search_buyable_listings`** — composite workaround for the blocked legacy search: catalog → buy box → price filter → optional seller reputation. Use this for "listings under $X with seller ratings" workflows.
- **`search_listings`** — still tries the legacy endpoint; on 403 returns a structured fallback hint pointing at `search_buyable_listings`.
- **`compare_products`** — bulk compare with optional reviews and shipping.
- Most buyer / post-purchase calls now require `MERCADOLIBRE_ACCESS_TOKEN`.

### Seller (new in this fork)

- **41 `seller_*` tools** — store snapshot, listings audit, inventory, orders, shipments, Q&A, promotions, messages, claims, feedback. Full mapping in [SELLER-API-ROADMAP.md](./SELLER-API-ROADMAP.md).
- **Listing creation** — `seller_get_listing_requirements`, `seller_upload_listing_picture`, `seller_validate_listing`, `seller_create_listing`.
- **Ownership checks** on `seller_get_my_item`, `seller_get_order`, and bulk variants — synthetic 403 if the token doesn't match `seller_id`.

### Client / infrastructure

- **`MercadoLibreClient`** gains `postJson`, `postValidate` (204 / 400 discriminated union for `/items/validate`), `postMultipart` (picture upload), and HTTP `PUT` for listing updates.
- Package renamed to `@kolmena-ai/meli-mcp`; binaries `mercadolibre-mcp` and `meli-mcp` share the same entrypoint.
- Local dev: `npm run inspector` / `inspector:auth` for MCP Inspector, `npm run smoke` for CLI smoke of every tool, see [TESTING.md](./TESTING.md).
- Kolmena backend: `meli-buyer` + `meli-seller` skills consume this MCP via `CALL_MCP_TOOL`; the old `meli-api` skill is deprecated.

# Changelog — @kolmena-ai/meli-mcp

## 1.3.0-kolmena.0

- **Listing creation (3 tools):** `seller_upload_listing_picture`, `seller_validate_listing`, `seller_create_listing`.
- **`MercadoLibreClient`:** `postJson`, `postValidate` (204/400), `postMultipart` for picture upload.
- Tool count: **76** (36 buyer + 40 seller).

## 1.2.0-kolmena.0

- **Seller suite (37 new `seller_*` tools)** — store snapshot, listings audit, inventory, orders, shipments, Q&A, promotions, messages, claims, feedback. See [SELLER-API-ROADMAP.md](./SELLER-API-ROADMAP.md).
- **HTTP PUT** on `MercadoLibreClient` for listing updates.
- **Ownership checks** on `seller_get_my_item`, `seller_get_order`, bulk items.
- Tool count: **73** (36 buyer + 37 seller).
- Kolmena: **`meli-seller` skill** replaces **`meli-api`** (MCP `CALL_MCP_TOOL` only).

## 1.1.0-kolmena.0

- **Buyer suite (27 new tools)** — compare, reviews, shipping, Q&A, orders, claims, domain discovery, official stores, etc.
- **`search_buyable_listings`** — composite workaround for blocked `sites/search?q=` (catalog → buy box → price filter → seller reputation).
- **`search_listings`** — tries legacy search; on 403 returns fallback to `search_buyable_listings`.
- **`compare_products`** — bulk compare with optional reviews/shipping.
- Tool count: **36** (was 9).
- Requires `MERCADOLIBRE_ACCESS_TOKEN` for most buyer/post-purchase calls.

## 1.0.4-kolmena.0

- **`get_product`** — `GET /products/{id}` for catalog ids from `search_items`.
- **`get_item` / `get_item_description`** — auto-fallback to catalog product when `/items/...` returns 404 (fixes 404 on ids like `MLA55016525` from search).
- Tool count: **9** (was 8 upstream).

## 1.0.3-kolmena.0

- **`search_items`** — uses `GET /products/search` (`site_id`, `status=active`, `q`) instead of blocked `GET /sites/{site}/search?q=`.
- Response wrapper documents `search_api` and `result_type: catalog_product`.

## 1.0.2-kolmena.0

- Initial Kolmena fork from `@dan1d/mercadolibre-mcp@1.0.2`.
- Package rename, `meli-mcp` binary alias, `TESTING.md`, MCP Inspector scripts.

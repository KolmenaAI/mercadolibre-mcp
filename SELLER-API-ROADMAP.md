# Seller agent — Mercado Libre API & MCP tool roadmap

Seller store swarms (Basic / Growth / Advanced) use **`seller_*` MCP tools** on the same `mercadolibre` server as buyer tools. The legacy **`meli-api` skill** (curl + refresh token) is replaced by **`meli-seller`** (`CALL_MCP_TOOL` only).

**Auth:** Seller OAuth token in `MERCADOLIBRE_ACCESS_TOKEN` (or per-user via Kolmena/Bifrost). Token refresh is handled inside the MCP process — not exposed as a tool.

**Version:** `1.2.0-kolmena.0` — 36 buyer + 37 seller tools (73 total).

---

## Swarm tier coverage

| Tier | Seller MCP phases | Skill |
|------|-------------------|--------|
| Basic (3 agents) | S0 + S1 | `meli-seller` — read + approved writes only |
| Growth (5 agents) | S0–S2 | + listing updates, messages, performance |
| Advanced (8–9 agents) | S0–S3 | + claims, feedback, promotion drafts |

Non-ML: social publish, ads, CRM, approvals → Kolmena plugins / other integrations.

---

## S0 — meli-api parity (shipped)

| Tool | API |
|------|-----|
| `seller_get_me` | `GET /users/me` |
| `seller_list_my_items` | `GET /users/{id}/items/search` |
| `seller_get_my_item` | `GET /items/{id}` (ownership check) |
| `seller_get_my_items_bulk` | `GET /items?ids=` |
| `seller_get_my_item_description` | `GET /items/{id}/description` |
| `seller_search_orders` | `GET /orders/search?seller=` |
| `seller_get_order` | `GET /orders/{id}` |
| `seller_get_order_shipments` | `GET /orders/{id}/shipments` |
| `seller_get_shipment` | `GET /shipments/{id}` |
| `seller_get_order_discounts` | `GET /orders/{id}/discounts` |
| `seller_get_store_snapshot` | composite |
| `seller_inventory_report` | composite |

---

## S1 — Basic swarm (shipped)

| Tool | API |
|------|-----|
| `seller_get_listing_health` | `GET /items/{id}/health` |
| `seller_get_item_visits` | `GET /items/{id}/visits` |
| `seller_list_unanswered_questions` | `GET /questions/search?status=UNANSWERED` |
| `seller_list_my_item_questions` | `GET /questions/search?item=` |
| `seller_get_question` | `GET /questions/{id}` |
| `seller_answer_question` | `POST /answers` |
| `seller_audit_listings` | composite |
| `seller_list_promotions` | `GET /seller-promotions/users/{id}` |
| `seller_get_promotion` | `GET /seller-promotions/promotions/{id}?app_version=v2` |
| `seller_get_item_price_to_win` | `GET /items/{id}/price_to_win` |

---

## S2 — Growth swarm (shipped)

| Tool | API |
|------|-----|
| `seller_list_performance_rankings` | composite |
| `seller_list_orders_by_status` | `orders/search` filtered |
| `seller_find_shipping_exceptions` | composite |
| `seller_list_pending_shipments` | composite |
| `seller_list_message_packs` | `GET /messages/unread?role=seller&tag=post_sale` (domestic); `GET /marketplace/messages/unread` (global selling) |
| `seller_get_pack_messages` | `GET /messages/packs/{id}/sellers/{seller_id}?tag=post_sale` |
| `seller_send_pack_message` | `POST /messages/packs/{id}/sellers/{seller_id}?tag=post_sale` |
| `seller_update_my_item` | `PUT /items/{id}` |
| `seller_update_my_item_description` | `PUT /items/{id}/description` |

---

## S4 — Listing creation (shipped)

| Tool | API |
|------|-----|
| `seller_get_listing_requirements` | `GET /categories/{id}/attributes` (required fields + checklist) |
| `seller_upload_listing_picture` | `POST /pictures/items/upload` (multipart from public `image_url`) |
| `seller_validate_listing` | `POST /items/validate` |
| `seller_create_listing` | `POST /items` (+ optional `PUT /items/{id}/description`) |

Workflow: `seller_get_me` → `get_domain_discovery` → `seller_get_listing_requirements` → `seller_upload_listing_picture` (optional) → `seller_validate_listing` → (approval) → `seller_create_listing`.

---

## S3 — Advanced swarm (shipped)

| Tool | API |
|------|-----|
| `seller_search_claims` | `GET /post-purchase/v1/claims/search` |
| `seller_get_claim` | `GET /post-purchase/v1/claims/{id}` |
| `seller_get_claim_returns` | `GET /post-purchase/v2/claims/{id}/returns` |
| `seller_submit_claim_action` | `POST /post-purchase/v1/claims/{id}/actions` |
| `seller_list_feedback` | `GET /orders/search` + `GET /orders/{id}/feedback` (purchase side) |
| `seller_get_order_feedback` | `GET /orders/{id}/feedback` |
| `seller_reply_feedback` | `POST /feedback/{id}/reply` |
| `seller_create_promotion_draft` | `POST /seller-promotions/promotions?app_version=v2` |

---

## Shared buyer tools (reuse on seller agents)

| Tool | Use |
|------|-----|
| `get_category_attributes` | Missing listing attributes |
| `get_category` / `get_categories` | Category tree |
| `get_trends` | Market context |
| `get_item_reviews` | Reviews on own listings |
| `get_currency_conversion` | FX |

Do **not** use buyer order/search/claim tools on seller agents.

---

## Skill: `meli-seller`

Location: `kolmena-backend/packages/plugin-skills/skills/meli-seller/SKILL.md`

- `allowed-actions`: `CALL_MCP_TOOL`, `REPLY`
- No `curl`, no `MELI_REFRESH_TOKEN` in skill metadata
- Approval required before write tools (`seller_answer_question`, `seller_update_my_*`, claims, feedback, promotions)

`meli-api` skill is **deprecated** (REPLY-only migration stub).

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  getInboundAuthContext,
  getRequestAccessToken,
  getRequestInboundHeaders,
  runWithRequestAccessToken,
  type RedactedInboundHeaders,
} from "./client.js";
import { MercadoLibreError } from "./errors.js";
import type { createMercadoLibreTools } from "./index.js";

type Tools = ReturnType<typeof createMercadoLibreTools>["tools"];
type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

/** See src/mcp-tools.ts for the rationale. */
const REDACTED_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "x-amz-security-token",
]);

function redactInboundHeaders(
  headers: ToolExtra["requestInfo"] extends infer R
    ? R extends { headers?: infer H }
      ? H | undefined
      : undefined
    : undefined
): RedactedInboundHeaders | undefined {
  if (!headers) return undefined;
  const out: RedactedInboundHeaders = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    out[name] = REDACTED_HEADER_NAMES.has(name.toLowerCase()) ? "[redacted]" : value;
  }
  return out;
}

function resolveBearerToken(extra: ToolExtra | undefined): string | undefined {
  const rawAuthorization = extra?.requestInfo?.headers?.authorization;
  if (!rawAuthorization) return undefined;
  const authorization =
    typeof rawAuthorization === "string" ? rawAuthorization : rawAuthorization.join(", ");
  const [scheme, token] = authorization.split(" ");
  if (!scheme || !token) return undefined;
  if (scheme.toLowerCase() !== "bearer") return undefined;
  return token.trim() || undefined;
}

const listingAttributeSchema = z.object({
  id: z.string(),
  value_id: z.string().optional(),
  value_name: z.string().optional(),
});

const listingDraftParams = {
  title: z.string().describe("Listing title shown on Mercado Libre"),
  category_id: z
    .string()
    .describe("Leaf category id (e.g. MLA1055). From get_domain_discovery."),
  price: z.number().describe("Price in currency_id units"),
  currency_id: z
    .string()
    .describe("ARS, USD, etc. Must match site (MLA → usually ARS)"),
  available_quantity: z.number().optional().describe("Stock; default 1"),
  buying_mode: z.string().optional().describe("Default buy_it_now"),
  listing_type_id: z
    .string()
    .optional()
    .describe("Default gold_special — requires at least one picture"),
  condition: z
    .string()
    .optional()
    .describe("Legacy condition field; prefer ITEM_CONDITION in attributes"),
  description: z.string().optional().describe("Short description in POST body if supported"),
  picture_sources: z
    .array(z.string())
    .optional()
    .describe("Public HTTPS image URLs → { source } in pictures[]"),
  picture_ids: z
    .array(z.string())
    .optional()
    .describe("Ids from seller_upload_listing_picture → { id } in pictures[]"),
  attributes: z
    .array(listingAttributeSchema)
    .optional()
    .describe(
      "Category specs: [{ id, value_id?, value_name? }]. Run seller_get_listing_requirements first."
    ),
  sale_terms: z
    .array(listingAttributeSchema)
    .optional()
    .describe("Warranty etc. e.g. WARRANTY_TYPE, WARRANTY_TIME"),
};

/** See src/mcp-tools.ts:logToolError — same shape, same rationale. */
function logToolError(error: unknown): void {
  const auth = getInboundAuthContext();
  const inboundHeaders = getRequestInboundHeaders();
  const base: Record<string, unknown> = {
    level: "error",
    msg: "meli_tool_error",
    inbound_source: auth.source,
    inbound_prefix: auth.prefix,
    inbound_fp: auth.fp,
    inbound_headers: inboundHeaders ?? {},
  };
  if (error instanceof MercadoLibreError) {
    console.error(
      JSON.stringify({
        ...base,
        method: error.method,
        path: error.path,
        status: error.status,
        response_headers: error.responseHeaders ?? {},
        response_body: error.body,
        error: error.message,
      })
    );
    return;
  }
  console.error(
    JSON.stringify({
      ...base,
      error: error instanceof Error ? error.message : String(error),
    })
  );
}

function toolResult(
  handler: () => Promise<unknown>,
  extra?: ToolExtra
): () => Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  return async () => {
    try {
      // Inherit the outer wrapper's request token when this call site did
      // not forward `extra`, so we don't clobber it with `undefined` and
      // strip the Authorization header (ML 401 "authorization value not
      // present"). See src/mcp-tools.ts:toolResult.
      const accessToken = resolveBearerToken(extra) ?? getRequestAccessToken();
      const result = await runWithRequestAccessToken(accessToken, handler);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      logToolError(error);
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: message }], isError: true };
    }
  };
}

export function registerSellerMercadoLibreTools(server: McpServer, tools: Tools): void {
  const originalTool = server.tool.bind(server);
  server.tool = ((...args: unknown[]) => {
    const callbackIndex = args.length - 1;
    const originalCallback = args[callbackIndex];
    if (typeof originalCallback !== "function")
      return (originalTool as (...a: unknown[]) => unknown)(...args);

    const wrappedCallback = (...callbackArgs: unknown[]) => {
      const maybeExtra = callbackArgs[callbackArgs.length - 1] as ToolExtra | undefined;
      const accessToken = resolveBearerToken(maybeExtra);
      const headers = redactInboundHeaders(maybeExtra?.requestInfo?.headers);
      return runWithRequestAccessToken(
        accessToken,
        async () => originalCallback(...callbackArgs) as Promise<unknown>,
        headers
      );
    };

    args[callbackIndex] = wrappedCallback;
    return (originalTool as (...a: unknown[]) => unknown)(...args);
  }) as typeof server.tool;

  server.tool(
    "seller_get_me",
    "Authenticated seller account: profile, reputation, transactions (GET /users/me).",
    {},
    async () => toolResult(() => tools.seller_get_me())()
  );

  server.tool(
    "seller_list_my_items",
    "List own listing ids (GET /users/{seller_id}/items/search).",
    {
      seller_id: z.number().optional(),
      status: z.string().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_list_my_items(params))()
  );

  server.tool(
    "seller_get_my_item",
    "Get one of your listings; rejects items owned by another seller.",
    {
      item_id: z.string(),
      seller_id: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_get_my_item(params))()
  );

  server.tool(
    "seller_get_my_items_bulk",
    "Up to 20 of your listings (GET /items?ids=).",
    {
      item_ids: z.array(z.string()).min(1).max(20),
      seller_id: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_get_my_items_bulk(params))()
  );

  server.tool(
    "seller_get_my_item_description",
    "Description for your listing.",
    {
      item_id: z.string(),
      seller_id: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_get_my_item_description(params))()
  );

  server.tool(
    "seller_search_orders",
    "Seller orders (GET /orders/search?seller=).",
    {
      seller_id: z.number().optional(),
      status: z.string().optional(),
      sort: z.string().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
      q: z.string().optional(),
    },
    async (params) => toolResult(() => tools.seller_search_orders(params))()
  );

  server.tool(
    "seller_get_order",
    "Order detail for your store.",
    {
      order_id: z.number(),
      seller_id: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_get_order(params))()
  );

  server.tool(
    "seller_get_order_shipments",
    "Shipments for an order.",
    { order_id: z.number() },
    async (params) => toolResult(() => tools.seller_get_order_shipments(params))()
  );

  server.tool(
    "seller_get_shipment",
    "Shipment tracking detail.",
    { shipment_id: z.number() },
    async (params) => toolResult(() => tools.seller_get_shipment(params))()
  );

  server.tool(
    "seller_get_order_discounts",
    "Discounts on an order.",
    { order_id: z.number() },
    async (params) => toolResult(() => tools.seller_get_order_discounts(params))()
  );

  server.tool(
    "seller_get_store_snapshot",
    "Daily store summary: account, recent orders, unanswered questions, low stock.",
    {
      seller_id: z.number().optional(),
      orders_limit: z.number().optional(),
      low_stock_threshold: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_get_store_snapshot(params))()
  );

  server.tool(
    "seller_inventory_report",
    "Low stock, fast sellers, and dead stock from active listings.",
    {
      seller_id: z.number().optional(),
      low_stock_threshold: z.number().optional(),
      item_scan_limit: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_inventory_report(params))()
  );

  server.tool(
    "seller_get_listing_health",
    "Listing quality for your item (GET /item/{id}/performance): score 0-100, level, and opportunities/warnings. Replaces the discontinued /health endpoint.",
    {
      item_id: z.string(),
      seller_id: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_get_listing_health(params))()
  );

  server.tool(
    "seller_get_item_visits",
    "Visit metrics for your listing (last 30 days by default).",
    {
      item_id: z.string(),
      date_from: z.string().optional(),
      date_to: z.string().optional(),
      seller_id: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_get_item_visits(params))()
  );

  server.tool(
    "seller_list_unanswered_questions",
    "Buyer questions awaiting your answer.",
    {
      seller_id: z.number().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_list_unanswered_questions(params))()
  );

  server.tool(
    "seller_list_my_item_questions",
    "All questions on one of your listings.",
    {
      item_id: z.string(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_list_my_item_questions(params))()
  );

  server.tool(
    "seller_get_question",
    "Single question by id.",
    { question_id: z.number() },
    async (params) => toolResult(() => tools.seller_get_question(params))()
  );

  server.tool(
    "seller_answer_question",
    "Post an answer to a buyer question (POST /answers). Confirm with seller before calling in production.",
    {
      question_id: z.number(),
      text: z.string().max(2000),
    },
    async (params) => toolResult(() => tools.seller_answer_question(params))()
  );

  server.tool(
    "seller_audit_listings",
    "Audit active listings: health, title length, category attributes sample.",
    {
      seller_id: z.number().optional(),
      item_scan_limit: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_audit_listings(params))()
  );

  server.tool(
    "seller_list_promotions",
    "List seller promotions (read).",
    {
      seller_id: z.number().optional(),
      status: z.string().optional(),
      limit: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_list_promotions(params))()
  );

  server.tool(
    "seller_get_promotion",
    "Promotion detail by id.",
    {
      promotion_id: z.string(),
      promotion_type: z.string().optional(),
    },
    async (params) => toolResult(() => tools.seller_get_promotion(params))()
  );

  server.tool(
    "seller_get_item_price_to_win",
    "Catalog competition price hint (GET /items/{id}/price_to_win?version=v2). Only works on catalog listings after opt-in — not traditional marketplace items.",
    {
      item_id: z.string(),
      seller_id: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_get_item_price_to_win(params))()
  );

  server.tool(
    "seller_create_catalog_listing",
    "Opt in a traditional marketplace item to catalog competition (POST /items/catalog_listings). Creates a new catalog_listing id — use that id with seller_get_item_price_to_win. Requires seller approval. Pass variation_id when the item has 2+ variations (auto-selected when only one).",
    {
      item_id: z.string().describe("Source marketplace item id to opt in from"),
      catalog_product_id: z
        .string()
        .describe("Catalog product id e.g. MLA27172665 (from get_product or item.catalog_product_id)"),
      variation_id: z
        .number()
        .optional()
        .describe("Required when item has 2+ variations; auto when only one"),
      seller_id: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_create_catalog_listing(params))()
  );

  server.tool(
    "seller_list_performance_rankings",
    "Rank your listings by sold quantity, visits, or stock.",
    {
      seller_id: z.number().optional(),
      item_scan_limit: z.number().optional(),
      sort_by: z.enum(["visits", "sold_quantity", "available_quantity"]).optional(),
    },
    async (params) => toolResult(() => tools.seller_list_performance_rankings(params))()
  );

  server.tool(
    "seller_list_orders_by_status",
    "Orders filtered by status (paid, cancelled, etc.).",
    {
      status: z.string(),
      seller_id: z.number().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_list_orders_by_status(params))()
  );

  server.tool(
    "seller_find_shipping_exceptions",
    "Find delayed or problematic shipments among recent orders.",
    {
      seller_id: z.number().optional(),
      orders_limit: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_find_shipping_exceptions(params))()
  );

  server.tool(
    "seller_list_pending_shipments",
    "Shipments for paid orders awaiting dispatch.",
    {
      seller_id: z.number().optional(),
      limit: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_list_pending_shipments(params))()
  );

  server.tool(
    "seller_list_message_packs",
    "Unread post-sale message packs. Domestic sellers: GET /messages/unread?role=seller&tag=post_sale. Global Selling fallback: GET /marketplace/messages/unread.",
    {
      seller_id: z.number().optional(),
      limit: z.number().optional().describe("Max packs returned (client-side trim of results[])"),
    },
    async (params) => toolResult(() => tools.seller_list_message_packs(params))()
  );

  server.tool(
    "seller_get_pack_messages",
    "Messages in a post-sale pack (GET /messages/packs/{id}/sellers/{seller_id}?tag=post_sale). Default mark_as_read=false so listing unread packs does not mark them read.",
    {
      pack_id: z.string(),
      seller_id: z.number().optional(),
      mark_as_read: z.boolean().optional(),
    },
    async (params) => toolResult(() => tools.seller_get_pack_messages(params))()
  );

  server.tool(
    "seller_send_pack_message",
    "Send a post-sale reply to the buyer (POST /messages/packs/{id}/sellers/{seller_id}?tag=post_sale). Max 350 chars. Confirm with seller before calling. buyer_id optional when the pack thread already has buyer messages.",
    {
      pack_id: z.string(),
      text: z.string().max(350),
      buyer_id: z.number().optional(),
      seller_id: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_send_pack_message(params))()
  );

  server.tool(
    "seller_update_my_item",
    "Update price, stock, or status only (PUT /items/{id}). Does NOT add pictures — use seller_add_listing_pictures. Variation-aware for price/stock.",
    {
      item_id: z.string(),
      price: z.number().optional(),
      available_quantity: z.number().optional(),
      status: z.string().optional(),
      variation_id: z
        .number()
        .optional()
        .describe("Variation id when item has multiple SKUs/colors; omit if only one variation"),
      seller_id: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_update_my_item(params))()
  );

  server.tool(
    "seller_update_my_item_description",
    "Update listing description plain text (PUT /items/{id}/description).",
    {
      item_id: z.string(),
      plain_text: z.string(),
      seller_id: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_update_my_item_description(params))()
  );

  server.tool(
    "seller_add_listing_pictures",
    "Add or replace pictures on an existing listing (PUT /items/{id} pictures[] + variation picture_ids when applicable). Default add mode merges new picture_ids with existing ones. Upload first with seller_upload_listing_picture. Verifies with GET after PUT.",
    {
      item_id: z.string(),
      picture_ids: z
        .array(z.string())
        .optional()
        .describe("New ids from seller_upload_listing_picture — appended to existing by default"),
      picture_sources: z
        .array(z.string())
        .optional()
        .describe("Public HTTPS URLs as { source } — appended to existing by default"),
      replace_pictures: z
        .boolean()
        .optional()
        .describe("When true, set pictures to only the ids/sources provided (omit to append)"),
      seller_id: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_add_listing_pictures(params))()
  );

  server.tool(
    "seller_search_claims",
    "Search post-purchase claims for your seller account.",
    {
      seller_id: z.number().optional(),
      status: z.string().optional(),
      stage: z.string().optional(),
      order_id: z.number().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_search_claims(params))()
  );

  server.tool(
    "seller_get_claim",
    "Claim detail.",
    { claim_id: z.number() },
    async (params) => toolResult(() => tools.seller_get_claim(params))()
  );

  server.tool(
    "seller_get_claim_returns",
    "Return status for a claim.",
    { claim_id: z.number() },
    async (params) => toolResult(() => tools.seller_get_claim_returns(params))()
  );

  server.tool(
    "seller_submit_claim_action",
    "Submit an action on a claim (confirm with seller before calling).",
    {
      claim_id: z.number(),
      action: z.string(),
      payload: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    },
    async (params) => toolResult(() => tools.seller_submit_claim_action(params))()
  );

  server.tool(
    "seller_get_order_feedback",
    "Feedback for one order (GET /orders/{order_id}/feedback). purchase = buyer feedback to seller; sale = seller feedback to buyer.",
    {
      order_id: z.number(),
      seller_id: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_get_order_feedback(params))()
  );

  server.tool(
    "seller_list_feedback",
    "Recent buyer feedback received as seller. Scans GET /orders/search then GET /orders/{id}/feedback per order (purchase side). No bulk /feedback/receiver endpoint exists.",
    {
      seller_id: z.number().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_list_feedback(params))()
  );

  server.tool(
    "seller_reply_feedback",
    "Reply to buyer feedback (confirm with seller before calling).",
    {
      feedback_id: z.number(),
      reply: z.string(),
    },
    async (params) => toolResult(() => tools.seller_reply_feedback(params))()
  );

  server.tool(
    "seller_create_promotion_draft",
    "Create a seller promotion. Dates: YYYY-MM-DD or DD-MM-YYYY (time added automatically). Test users: version=test auto. Requires green reputation for SELLER_CAMPAIGN.",
    {
      name: z.string().describe("Campaign name (must be unique per seller)"),
      start_date: z
        .string()
        .describe("Start day: 2026-05-28 or 28-05-2026 (→ 00:00:00 for API)"),
      finish_date: z
        .string()
        .describe("End day: 2026-06-03 or 03-06-2026 (→ 23:59:59 for API)"),
      use_test_promotions: z
        .boolean()
        .optional()
        .describe("Default true for test_user accounts (adds version=test)"),
      seller_id: z.number().optional(),
      promotion_type: z
        .string()
        .optional()
        .describe("Default SELLER_CAMPAIGN; or SELLER_COUPON_CAMPAIGN"),
      sub_type: z
        .string()
        .optional()
        .describe("Default FLEXIBLE_PERCENTAGE for SELLER_CAMPAIGN"),
      raw_body: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Extra ML fields (budget, fixed_amount, min_purchase_amount, etc.)"),
    },
    async (params) => toolResult(() => tools.seller_create_promotion_draft(params))()
  );

  server.tool(
    "seller_get_listing_requirements",
    "List required category attributes and a publish checklist for seller_validate_listing / seller_create_listing (GET /categories/{id}/attributes).",
    {
      category_id: z.string().describe("e.g. MLA1055 from get_domain_discovery"),
    },
    async (params) => toolResult(() => tools.seller_get_listing_requirements(params))()
  );

  server.tool(
    "seller_upload_listing_picture",
    "Upload image to seller library (not tied to an item). Returns picture_id — use seller_add_listing_pictures for existing listings, or seller_create_listing.picture_ids for new ones.",
    {
      image_url: z.string().describe("Public HTTPS URL the server can download"),
    },
    async (params) => toolResult(() => tools.seller_upload_listing_picture(params))()
  );

  server.tool(
    "seller_validate_listing",
    "Dry-run POST /items/validate. ready_to_publish is true when there are no type:error causes. Fix attributes + pictures first.",
    listingDraftParams,
    async (params) => toolResult(() => tools.seller_validate_listing(params))()
  );

  server.tool(
    "seller_create_listing",
    "Publish live listing (POST /items). Same JSON as a successful seller_validate_listing. Requires seller approval.",
    {
      ...listingDraftParams,
      plain_text_description: z
        .string()
        .optional()
        .describe("Long description via PUT /items/{id}/description after create"),
    },
    async (params) => toolResult(() => tools.seller_create_listing(params))()
  );
}

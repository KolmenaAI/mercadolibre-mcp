import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import { createHash } from "node:crypto";
import { z } from "zod";
import { runWithRequestAccessToken } from "./client.js";
import type { createMercadoLibreTools } from "./index.js";

type Tools = ReturnType<typeof createMercadoLibreTools>["tools"];
type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;
const AUTH_TRACE_ENABLED =
  process.env.MELI_AUTH_TRACE === "1" || process.env.MELI_AUTH_TRACE?.toLowerCase() === "true";

function tokenFingerprint(token: string | undefined): string {
  if (!token) return "none";
  return createHash("sha256").update(token).digest("hex").slice(0, 10);
}

function tokenPrefix(token: string | undefined): string {
  if (!token) return "none";
  return token.startsWith("APP_USR") ? "APP_USR" : "other";
}

function traceIncomingAuth(source: string, token: string | undefined): void {
  if (!AUTH_TRACE_ENABLED) return;
  console.log(
    `[MELI_AUTH_TRACE] ${source} prefix=${tokenPrefix(token)} fp=${tokenFingerprint(token)}`
  );
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

function toolResult(
  handler: () => Promise<unknown>,
  extra?: ToolExtra
): () => Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  return async () => {
    try {
      const rawAuthorization = extra?.requestInfo?.headers?.authorization;
      const authorization =
        !rawAuthorization
          ? undefined
          : typeof rawAuthorization === "string"
            ? rawAuthorization
            : rawAuthorization.join(", ");
      const [scheme, token] = authorization?.split(" ") ?? [];
      const accessToken = scheme?.toLowerCase() === "bearer" && token ? token.trim() : undefined;
      traceIncomingAuth("seller_tool_result", accessToken);
      const result = await runWithRequestAccessToken(accessToken, handler);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
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
      const rawAuthorization = maybeExtra?.requestInfo?.headers?.authorization;
      const authorization =
        !rawAuthorization
          ? undefined
          : typeof rawAuthorization === "string"
            ? rawAuthorization
            : rawAuthorization.join(", ");
      const [scheme, token] = authorization?.split(" ") ?? [];
      const accessToken = scheme?.toLowerCase() === "bearer" && token ? token.trim() : undefined;
      traceIncomingAuth("seller_tool_wrapper", accessToken);
      return runWithRequestAccessToken(
        accessToken,
        async () => originalCallback(...callbackArgs) as Promise<unknown>
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
    "Listing quality / health for your item (GET /items/{id}/health).",
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
    "Catalog competition price hint for your listing.",
    {
      item_id: z.string(),
      seller_id: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_get_item_price_to_win(params))()
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
    "Pending post-sale message packs (if API scope allows).",
    {
      seller_id: z.number().optional(),
      limit: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_list_message_packs(params))()
  );

  server.tool(
    "seller_get_pack_messages",
    "Messages in a post-sale pack.",
    {
      pack_id: z.string(),
      seller_id: z.number().optional(),
    },
    async (params) => toolResult(() => tools.seller_get_pack_messages(params))()
  );

  server.tool(
    "seller_update_my_item",
    "Update price, stock, or status (PUT /items/{id}). Listings with variations/user_product_id need price/stock on the variation (auto if only one). Status uses item root.",
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
    "seller_list_feedback",
    "Feedback received as seller.",
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
    "Upload image to seller library (not tied to an item). Returns picture_id — pass it in seller_create_listing.picture_ids.",
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

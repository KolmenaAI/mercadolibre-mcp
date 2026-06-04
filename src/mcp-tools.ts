import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  getInboundAuthContext,
  getRequestInboundHeaders,
  runWithRequestAccessToken,
  type RedactedInboundHeaders,
} from "./client.js";
import { MercadoLibreError } from "./errors.js";
import type { createMercadoLibreTools } from "./index.js";

type Tools = ReturnType<typeof createMercadoLibreTools>["tools"];
type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

/**
 * Headers we redact before stashing in AsyncLocalStorage / emitting on
 * error. Bearer + cookies are sensitive; everything else (including
 * `traceparent`, `x-request-id`, Bifrost's `x-bf-eh-*` family, etc.) is
 * kept verbatim so an operator can join with upstream traces.
 */
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

function resolveBearerToken(extra: ToolExtra): string | undefined {
  const rawAuthorization = extra.requestInfo?.headers?.authorization;
  if (!rawAuthorization) return undefined;
  const authorization =
    typeof rawAuthorization === "string" ? rawAuthorization : rawAuthorization.join(", ");

  const [scheme, token] = authorization.split(" ");
  if (!scheme || !token) return undefined;
  if (scheme.toLowerCase() !== "bearer") return undefined;
  return token.trim() || undefined;
}

/**
 * One JSON-line log on stderr per failed tool call. `level: "error"`
 * lets ClickStack / OTel collectors classify the entry as SeverityText=
 * ERROR. Includes:
 *   - the redacted inbound auth context (source/prefix/fp)
 *   - the redacted inbound MCP request headers (e.g. `traceparent` so
 *     pod logs can be joined with Bifrost / OTel traces)
 *   - the MercadoLibre call's method/path/status, the response body,
 *     and the response headers (e.g. `x-request-id` for ML support
 *     tickets, `x-rate-limit-*` for 429 diagnosis)
 *
 * Verbose by design — we want maximum signal during the per-user OAuth
 * rollout. Tighten the field set in a follow-up once the wiring is stable.
 *
 * stderr, not stdout — the stdio transport reserves stdout for JSON-RPC.
 */
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
      const token = extra ? resolveBearerToken(extra) : undefined;
      const result = await runWithRequestAccessToken(token, handler);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      logToolError(error);
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: message }], isError: true };
    }
  };
}

function wrapToolWithRequestTokenContext(server: McpServer): void {
  const originalTool = server.tool.bind(server);
  const toolWithToken = ((...args: unknown[]) => {
    const callbackIndex = args.length - 1;
    const originalCallback = args[callbackIndex];
    if (typeof originalCallback !== "function") return (originalTool as (...a: unknown[]) => unknown)(...args);

    const wrappedCallback = (...callbackArgs: unknown[]) => {
      const maybeExtra = callbackArgs[callbackArgs.length - 1] as ToolExtra | undefined;
      const token = maybeExtra ? resolveBearerToken(maybeExtra) : undefined;
      const headers = redactInboundHeaders(maybeExtra?.requestInfo?.headers);
      return runWithRequestAccessToken(
        token,
        async () => originalCallback(...callbackArgs) as Promise<unknown>,
        headers
      );
    };

    args[callbackIndex] = wrappedCallback;
    return (originalTool as (...a: unknown[]) => unknown)(...args);
  }) as typeof server.tool;

  server.tool = toolWithToken;
}

export function registerMercadoLibreTools(server: McpServer, tools: Tools): void {
  wrapToolWithRequestTokenContext(server);
  server.tool(
    "search_items",
    "Search MercadoLibre catalog products by keyword (GET /products/search). Returns catalog product ids — use get_product_buybox or search_buyable_listings for prices and sellers.",
    {
      query: z.string(),
      site_id: z.string().optional(),
      category: z.string().optional().describe("domain_id filter e.g. MLA-CELLPHONES"),
      price_min: z.number().optional(),
      price_max: z.number().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    },
    async (params, extra) => toolResult(() => tools.search_items(params), extra)()
  );

  server.tool(
    "search_buyable_listings",
    "Buyer search workaround: catalog search → buy box listing → filter by price → optional seller reputation. Use instead of blocked sites/search?q= for 'listings under $X with seller ratings'.",
    {
      query: z.string(),
      site_id: z.string().optional(),
      domain_id: z.string().optional(),
      price_max: z.number().optional(),
      price_min: z.number().optional(),
      catalog_limit: z.number().optional().describe("Max catalog products to scan (default 15)"),
      include_seller_ratings: z.boolean().optional(),
    },
    async (params, extra) => toolResult(() => tools.search_buyable_listings(params), extra)()
  );

  server.tool(
    "search_listings",
    "Try legacy marketplace keyword search GET /sites/{site}/search?q=. Often 403; returns fallback hint to search_buyable_listings.",
    {
      query: z.string(),
      site_id: z.string().optional(),
      price_max: z.number().optional(),
      price_min: z.number().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    },
    async (params) => toolResult(() => tools.search_listings(params))()
  );

  server.tool(
    "search_listings_by_seller",
    "List marketplace listings from one seller (GET /sites/{site}/search?seller_id=).",
    {
      seller_id: z.number(),
      site_id: z.string().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    },
    async (params) => toolResult(() => tools.search_listings_by_seller(params))()
  );

  server.tool(
    "get_product",
    "Catalog product datasheet (GET /products/{id}).",
    { product_id: z.string() },
    async (params) => toolResult(() => tools.get_product(params))()
  );

  server.tool(
    "get_product_buybox",
    "Resolve buy box winner listing id and price range for a catalog product.",
    { product_id: z.string() },
    async (params) => toolResult(() => tools.get_product_buybox(params))()
  );

  server.tool(
    "get_product_listings",
    "Competing listings on a catalog PDP (deprecated by ML — prefer buy box).",
    {
      product_id: z.string(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    },
    async (params) => toolResult(() => tools.get_product_listings(params))()
  );

  server.tool(
    "get_item",
    "Marketplace listing or catalog fallback.",
    { item_id: z.string() },
    async (params) => toolResult(() => tools.get_item(params))()
  );

  server.tool(
    "get_items_bulk",
    "Up to 20 listings in one call (GET /items?ids=).",
    { item_ids: z.array(z.string()).min(1).max(20) },
    async (params) => toolResult(() => tools.get_items_bulk(params))()
  );

  server.tool(
    "compare_products",
    "Compare 2–5 listings: bulk items + optional reviews and shipping.",
    {
      item_ids: z.array(z.string()).optional(),
      product_ids: z.array(z.string()).optional(),
      include_reviews: z.boolean().optional(),
      include_shipping: z.boolean().optional(),
      zip_code: z.string().optional(),
    },
    async (params) => toolResult(() => tools.compare_products(params))()
  );

  server.tool(
    "get_item_description",
    "Listing description or catalog short_description.",
    { item_id: z.string() },
    async (params) => toolResult(() => tools.get_item_description(params))()
  );

  server.tool(
    "get_item_reviews",
    "Product reviews and rating_average (GET /reviews/item/{id}).",
    {
      item_id: z.string(),
      catalog_product_id: z.string().optional(),
    },
    async (params) => toolResult(() => tools.get_item_reviews(params))()
  );

  server.tool(
    "get_item_shipping_options",
    "Shipping options and costs for a listing; optional zip_code.",
    {
      item_id: z.string(),
      zip_code: z.string().optional(),
    },
    async (params) => toolResult(() => tools.get_item_shipping_options(params))()
  );

  server.tool(
    "get_item_sale_terms",
    "Installments, warranty, and sale_terms from a listing.",
    { item_id: z.string() },
    async (params) => toolResult(() => tools.get_item_sale_terms(params))()
  );

  server.tool(
    "get_categories",
    "Top-level categories for a site.",
    { site_id: z.string().optional() },
    async (params) => toolResult(() => tools.get_categories(params))()
  );

  server.tool(
    "get_category",
    "Category tree node.",
    { category_id: z.string() },
    async (params) => toolResult(() => tools.get_category(params))()
  );

  server.tool(
    "get_category_attributes",
    "Category attribute definitions for spec comparison.",
    { category_id: z.string() },
    async (params) => toolResult(() => tools.get_category_attributes(params))()
  );

  server.tool(
    "get_domain_discovery",
    "Map a vague query to catalog domains (GET /sites/{site}/domain_discovery/search).",
    {
      query: z.string(),
      site_id: z.string().optional(),
      limit: z.number().optional(),
    },
    async (params) => toolResult(() => tools.get_domain_discovery(params))()
  );

  server.tool(
    "get_seller_info",
    "Seller profile and reputation.",
    { seller_id: z.number() },
    async (params) => toolResult(() => tools.get_seller_info(params))()
  );

  server.tool(
    "get_seller_response_time",
    "Seller average question response time in minutes.",
    { seller_id: z.number() },
    async (params) => toolResult(() => tools.get_seller_response_time(params))()
  );

  server.tool(
    "get_official_store",
    "Official store metadata.",
    { store_id: z.number() },
    async (params) => toolResult(() => tools.get_official_store(params))()
  );

  server.tool(
    "get_item_questions",
    "Q&A on a listing (GET /questions/search?item=).",
    {
      item_id: z.string(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    },
    async (params) => toolResult(() => tools.get_item_questions(params))()
  );

  server.tool(
    "ask_seller_question",
    "Post a pre-sale question (POST /questions). Requires buyer token; max 2000 chars.",
    {
      item_id: z.string(),
      text: z.string().max(2000),
    },
    async (params) => toolResult(() => tools.ask_seller_question(params))()
  );

  server.tool(
    "get_question",
    "Single question by id.",
    { question_id: z.number() },
    async (params) => toolResult(() => tools.get_question(params))()
  );

  server.tool(
    "get_trends",
    "Trending searches for a site.",
    { site_id: z.string().optional() },
    async (params) => toolResult(() => tools.get_trends(params))()
  );

  server.tool(
    "get_currency_conversion",
    "FX rate between currencies.",
    {
      from: z.string(),
      to: z.string(),
      amount: z.number().optional(),
    },
    async (params) => toolResult(() => tools.get_currency_conversion(params))()
  );

  server.tool(
    "get_me",
    "Current OAuth user (GET /users/me). Use before buyer order tools.",
    {},
    async (_params, extra) => toolResult(() => tools.get_me(), extra)()
  );

  server.tool(
    "get_my_orders",
    "Buyer orders (GET /orders/search?buyer=). Uses /users/me if buyer_id omitted.",
    {
      buyer_id: z.number().optional(),
      status: z.string().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
      q: z.string().optional(),
    },
    async (params) => toolResult(() => tools.get_my_orders(params))()
  );

  server.tool(
    "get_order",
    "Order detail.",
    { order_id: z.number() },
    async (params) => toolResult(() => tools.get_order(params))()
  );

  server.tool(
    "get_order_shipments",
    "Shipments for an order.",
    { order_id: z.number() },
    async (params) => toolResult(() => tools.get_order_shipments(params))()
  );

  server.tool(
    "get_shipment",
    "Shipment tracking detail.",
    { shipment_id: z.number() },
    async (params) => toolResult(() => tools.get_shipment(params))()
  );

  server.tool(
    "get_order_discounts",
    "Discounts applied to an order.",
    { order_id: z.number() },
    async (params) => toolResult(() => tools.get_order_discounts(params))()
  );

  server.tool(
    "get_order_feedback",
    "Feedback state for an order.",
    { order_id: z.number() },
    async (params) => toolResult(() => tools.get_order_feedback(params))()
  );

  server.tool(
    "search_my_claims",
    "Post-purchase claims for token user.",
    {
      stage: z.string().optional(),
      status: z.string().optional(),
      order_id: z.number().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    },
    async (params) => toolResult(() => tools.search_my_claims(params))()
  );

  server.tool(
    "get_claim",
    "Claim detail (post-purchase/v1).",
    { claim_id: z.number() },
    async (params) => toolResult(() => tools.get_claim(params))()
  );

  server.tool(
    "get_claim_returns",
    "Return status for a claim (post-purchase/v2).",
    { claim_id: z.number() },
    async (params) => toolResult(() => tools.get_claim_returns(params))()
  );
}

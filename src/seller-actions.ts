import { MercadoLibreClient } from "./client.js";
import { MercadoLibreError } from "./errors.js";
import type { MercadoLibreListingPictureRef } from "./listing-types.js";
import { getCategoryAttributes } from "./buyer-actions.js";
import { chunkIds, type MarketplaceItemSummary } from "./item-helpers.js";
import {
  assertMyItem,
  defaultVisitsDateRange,
  getMeProfile,
  isTestUserProfile,
  normalizeMultigetItems,
  normalizePromotionLocalDate,
  resolveSellerId,
} from "./seller-helpers.js";
import type {
  SellerAnswerQuestionParams,
  SellerAuditListingsParams,
  SellerCreateListingParams,
  SellerCreatePromotionDraftParams,
  SellerGetListingRequirementsParams,
  SellerFindShippingExceptionsParams,
  SellerGetClaimParams,
  SellerGetClaimReturnsParams,
  SellerGetItemPriceToWinParams,
  SellerGetItemVisitsParams,
  SellerGetListingHealthParams,
  SellerGetMyItemDescriptionParams,
  SellerGetMyItemParams,
  SellerGetMyItemsBulkParams,
  SellerGetOrderDiscountsParams,
  SellerGetOrderParams,
  SellerGetOrderShipmentsParams,
  SellerGetOrderFeedbackParams,
  SellerGetPackMessagesParams,
  SellerGetPromotionParams,
  SellerGetQuestionParams,
  SellerGetShipmentParams,
  SellerGetStoreSnapshotParams,
  SellerInventoryReportParams,
  SellerListFeedbackParams,
  SellerListMessagePacksParams,
  SellerListMyItemQuestionsParams,
  SellerListMyItemsParams,
  SellerListOrdersByStatusParams,
  SellerListPendingShipmentsParams,
  SellerListPerformanceRankingsParams,
  SellerListPromotionsParams,
  SellerListUnansweredQuestionsParams,
  SellerReplyFeedbackParams,
  SellerSendPackMessageParams,
  SellerSearchClaimsParams,
  SellerSearchOrdersParams,
  SellerSubmitClaimActionParams,
  SellerAddListingPicturesParams,
  SellerCreateCatalogListingParams,
  SellerUpdateMyItemDescriptionParams,
  SellerUpdateMyItemParams,
  SellerUploadListingPictureParams,
  SellerValidateListingParams,
} from "./seller-schemas.js";
import {
  buildCreateItemBody,
  buildPicturesPutPayload,
  extractItemPictureRefs,
  isCatalogManagedListing,
  type CategoryAttributeDefinition,
  guessImageFilename,
  parseListingValidationResponse,
  summarizeCategoryListingRequirements,
} from "./seller-listing-helpers.js";

const MULTIGET_MAX = 20;
const DEFAULT_ITEM_SCAN = 50;

interface ItemsSearchResponse {
  results?: string[];
  paging?: { total: number; limit: number; offset: number };
}

interface OrdersSearchResponse {
  results?: Array<Record<string, unknown>>;
  paging?: { total: number; limit: number; offset: number };
}

interface QuestionsSearchResponse {
  questions?: Array<Record<string, unknown>>;
  total?: number;
}

export async function sellerGetMe(client: MercadoLibreClient): Promise<unknown> {
  const me = await getMeProfile(client);
  return {
    api: "GET /users/me",
    seller_id: me.id,
    nickname: me.nickname,
    site_id: me.site_id,
    email: me.email,
    seller_reputation: me.seller_reputation ?? null,
    transactions: me.transactions ?? null,
    user: me,
  };
}

export async function sellerListMyItems(
  client: MercadoLibreClient,
  params: SellerListMyItemsParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  const qp: Record<string, string> = {
    status: params.status ?? "active",
    limit: String(Math.min(params.limit ?? 50, 100)),
  };
  if (params.offset !== undefined) {
    qp.offset = String(params.offset);
  }
  const result = await client.get<ItemsSearchResponse>(
    `/users/${encodeURIComponent(String(sellerId))}/items/search`,
    qp
  );
  return {
    api: "GET /users/{seller_id}/items/search",
    seller_id: sellerId,
    status: qp.status,
    item_ids: result.results ?? [],
    paging: result.paging ?? null,
  };
}

export async function sellerGetMyItem(
  client: MercadoLibreClient,
  params: SellerGetMyItemParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  const item = await assertMyItem(client, params.item_id, sellerId);
  return {
    api: "GET /items/{id}",
    seller_id: sellerId,
    item,
  };
}

export async function sellerGetMyItemsBulk(
  client: MercadoLibreClient,
  params: SellerGetMyItemsBulkParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  const ids = [...new Set(params.item_ids.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    throw new Error("item_ids must contain at least one id");
  }
  if (ids.length > MULTIGET_MAX) {
    throw new Error(`item_ids supports at most ${MULTIGET_MAX} ids per call`);
  }
  const raw = await client.get<unknown>("/items", { ids: ids.join(",") });
  const items = normalizeMultigetItems(raw);
  const owned = items.filter((item) => item.seller_id === sellerId);
  const rejected = ids.filter(
    (id) => !owned.some((item) => item.id === id)
  );
  return {
    api: "GET /items?ids=",
    seller_id: sellerId,
    requested: ids.length,
    items: owned,
    rejected_ids: rejected.length > 0 ? rejected : undefined,
  };
}

export async function sellerGetMyItemDescription(
  client: MercadoLibreClient,
  params: SellerGetMyItemDescriptionParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  await assertMyItem(client, params.item_id, sellerId);
  const description = await client.get(
    `/items/${encodeURIComponent(params.item_id)}/description`
  );
  return {
    api: "GET /items/{id}/description",
    seller_id: sellerId,
    item_id: params.item_id,
    description,
  };
}

export async function sellerSearchOrders(
  client: MercadoLibreClient,
  params: SellerSearchOrdersParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  const qp: Record<string, string> = {
    seller: String(sellerId),
    sort: params.sort ?? "date_desc",
    limit: String(Math.min(params.limit ?? 20, 50)),
  };
  if (params.offset !== undefined) {
    qp.offset = String(params.offset);
  }
  if (params.status) {
    qp["order.status"] = params.status;
  }
  if (params.q) {
    qp.q = params.q;
  }
  const result = await client.get<OrdersSearchResponse>("/orders/search", qp);
  return {
    api: "GET /orders/search?seller=",
    seller_id: sellerId,
    result,
  };
}

export async function sellerGetOrder(
  client: MercadoLibreClient,
  params: SellerGetOrderParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  const order = await client.get<Record<string, unknown>>(
    `/orders/${encodeURIComponent(String(params.order_id))}`
  );
  const orderSeller = order.seller as { id?: number } | undefined;
  if (orderSeller?.id !== undefined && orderSeller.id !== sellerId) {
    throw new MercadoLibreError(
      "GET",
      `/orders/${params.order_id}`,
      403,
      JSON.stringify({ message: "Order does not belong to authenticated seller" })
    );
  }
  return {
    api: "GET /orders/{id}",
    seller_id: sellerId,
    order,
  };
}

export async function sellerGetOrderShipments(
  client: MercadoLibreClient,
  params: SellerGetOrderShipmentsParams
): Promise<unknown> {
  return client.get(
    `/orders/${encodeURIComponent(String(params.order_id))}/shipments`
  );
}

export async function sellerGetShipment(
  client: MercadoLibreClient,
  params: SellerGetShipmentParams
): Promise<unknown> {
  return client.get(`/shipments/${encodeURIComponent(String(params.shipment_id))}`);
}

export async function sellerGetOrderDiscounts(
  client: MercadoLibreClient,
  params: SellerGetOrderDiscountsParams
): Promise<unknown> {
  return client.get(
    `/orders/${encodeURIComponent(String(params.order_id))}/discounts`
  );
}

export async function sellerListUnansweredQuestions(
  client: MercadoLibreClient,
  params: SellerListUnansweredQuestionsParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  const qp: Record<string, string> = {
    seller_id: String(sellerId),
    status: "UNANSWERED",
    api_version: "4",
    limit: String(Math.min(params.limit ?? 20, 50)),
  };
  if (params.offset !== undefined) {
    qp.offset = String(params.offset);
  }
  const result = await client.get<QuestionsSearchResponse>("/questions/search", qp);
  return {
    api: "GET /questions/search?status=UNANSWERED",
    seller_id: sellerId,
    result,
  };
}

export async function sellerListMyItemQuestions(
  client: MercadoLibreClient,
  params: SellerListMyItemQuestionsParams
): Promise<unknown> {
  const qp: Record<string, string> = {
    item: params.item_id,
    api_version: "4",
    limit: String(Math.min(params.limit ?? 20, 50)),
  };
  if (params.offset !== undefined) {
    qp.offset = String(params.offset);
  }
  return client.get("/questions/search", qp);
}

export async function sellerGetQuestion(
  client: MercadoLibreClient,
  params: SellerGetQuestionParams
): Promise<unknown> {
  return client.get(`/questions/${encodeURIComponent(String(params.question_id))}`, {
    api_version: "4",
  });
}

export async function sellerAnswerQuestion(
  client: MercadoLibreClient,
  params: SellerAnswerQuestionParams
): Promise<unknown> {
  if (params.text.length > 2000) {
    throw new Error("Answer text must be at most 2000 characters");
  }
  return client.post("/answers", {
    question_id: params.question_id,
    text: params.text,
  });
}

export async function sellerGetListingHealth(
  client: MercadoLibreClient,
  params: SellerGetListingHealthParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  await assertMyItem(client, params.item_id, sellerId);
  // Mercado Libre discontinued GET /items/{id}/health (Feb 2026) — it now 404s
  // for marketplace (buy_it_now) items. The per-item /performance resource
  // replaces it and groups all listing-quality data (score 0-100, level, and
  // buckets of opportunities/warnings) into a single call. Note: path is the
  // singular `/item/` (not `/items/`).
  const performance = await client.get(
    `/item/${encodeURIComponent(params.item_id)}/performance`
  );
  return {
    api: "GET /item/{id}/performance",
    seller_id: sellerId,
    item_id: params.item_id,
    performance,
  };
}

export async function sellerGetItemVisits(
  client: MercadoLibreClient,
  params: SellerGetItemVisitsParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  await assertMyItem(client, params.item_id, sellerId);
  const range = defaultVisitsDateRange();
  const qp: Record<string, string> = {
    date_from: params.date_from ?? range.date_from,
    date_to: params.date_to ?? range.date_to,
  };
  const visits = await client.get(
    `/items/${encodeURIComponent(params.item_id)}/visits`,
    qp
  );
  return {
    api: "GET /items/{id}/visits",
    seller_id: sellerId,
    item_id: params.item_id,
    date_from: qp.date_from,
    date_to: qp.date_to,
    visits,
  };
}

export async function sellerListPromotions(
  client: MercadoLibreClient,
  params: SellerListPromotionsParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  const qp: Record<string, string> = {
    // Mercado Libre promotions endpoints require app_version=v2.
    app_version: "v2",
    limit: String(Math.min(params.limit ?? 20, 50)),
  };
  if (params.status) {
    qp.status = params.status;
  }
  try {
    const result = await client.get(
      `/seller-promotions/users/${encodeURIComponent(String(sellerId))}`,
      qp
    );
    return {
      api: "GET /seller-promotions/users/{user_id}",
      seller_id: sellerId,
      result,
    };
  } catch (error) {
    if (error instanceof MercadoLibreError && (error.status === 403 || error.status === 404)) {
      return {
        api: "GET /seller-promotions/users/{user_id}",
        seller_id: sellerId,
        unavailable: true,
        status: error.status,
        message:
          "Promotions API not available for this app or seller. Check OAuth scopes in DevCenter.",
      };
    }
    throw error;
  }
}

export async function sellerGetPromotion(
  client: MercadoLibreClient,
  params: SellerGetPromotionParams
): Promise<unknown> {
  const qp: Record<string, string> = { app_version: "v2" };
  if (params.promotion_type) {
    qp.promotion_type = params.promotion_type;
  }
  const result = await client.get(
    `/seller-promotions/promotions/${encodeURIComponent(params.promotion_id)}`,
    qp
  );
  return {
    api: "GET /seller-promotions/promotions/{promotion_id}?app_version=v2",
    promotion_id: params.promotion_id,
    result,
  };
}

export async function sellerGetItemPriceToWin(
  client: MercadoLibreClient,
  params: SellerGetItemPriceToWinParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  await assertMyItem(client, params.item_id, sellerId);
  const result = await client.get(
    `/items/${encodeURIComponent(params.item_id)}/price_to_win`,
    { version: "v2" }
  );
  return {
    api: "GET /items/{id}/price_to_win?version=v2",
    seller_id: sellerId,
    item_id: params.item_id,
    result,
  };
}

export async function sellerCreateCatalogListing(
  client: MercadoLibreClient,
  params: SellerCreateCatalogListingParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  const item = await assertMyItem(client, params.item_id, sellerId);
  const itemRecord = item as Record<string, unknown>;
  const catalogProductId = params.catalog_product_id.trim();

  if (isCatalogManagedListing(itemRecord)) {
    throw new Error(
      `Item ${params.item_id} is already a catalog listing (catalog_listing). Use seller_get_item_price_to_win on this id — do not opt in again.`
    );
  }

  const itemCatalogProductId =
    typeof item.catalog_product_id === "string" ? item.catalog_product_id : null;
  const catalogMismatchNote =
    itemCatalogProductId !== null && itemCatalogProductId !== catalogProductId
      ? `Note: marketplace item has catalog_product_id ${itemCatalogProductId} but you sent ${catalogProductId}. ML may reject if they do not match.`
      : null;

  const rawVariations = itemRecord.variations;
  const variationRows: Array<Record<string, unknown>> = Array.isArray(rawVariations)
    ? rawVariations.filter(
        (row): row is Record<string, unknown> => row !== null && typeof row === "object"
      )
    : [];
  const variationIds = variationRows
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id));

  let variationId = params.variation_id;
  if (variationRows.length > 1 && variationId === undefined) {
    throw new Error(
      `Item has ${variationRows.length} variations; pass variation_id for the SKU/color to opt in. Available: ${variationIds.join(", ")}. Call once per variation.`
    );
  }
  if (variationRows.length === 1 && variationId === undefined) {
    variationId = variationIds[0];
  }
  if (variationId !== undefined && !variationIds.includes(variationId)) {
    throw new Error(
      `variation_id ${variationId} not found on item ${params.item_id}. Available: ${variationIds.join(", ") || "none"}`
    );
  }

  const body: Record<string, string | number> = {
    item_id: params.item_id.trim(),
    catalog_product_id: catalogProductId,
  };
  if (variationId !== undefined) {
    body.variation_id = variationId;
  }

  try {
    const created = await client.postJson<{
      id?: string;
      permalink?: string;
      catalog_listing?: boolean;
      catalog_product_id?: string;
      status?: string;
      title?: string;
    }>("/items/catalog_listings", body);

    const catalogListingId = typeof created.id === "string" ? created.id : null;
    return {
      api: "POST /items/catalog_listings",
      seller_id: sellerId,
      source_item_id: params.item_id,
      catalog_product_id: catalogProductId,
      variation_id: variationId ?? null,
      catalog_listing_id: catalogListingId,
      permalink: created.permalink ?? null,
      catalog_listing: created.catalog_listing ?? true,
      status: created.status ?? null,
      title: created.title ?? null,
      note:
        "Use catalog_listing_id (not the source marketplace item_id) with seller_get_item_price_to_win for catalog competition pricing.",
      catalog_product_id_mismatch_note: catalogMismatchNote,
      result: created,
    };
  } catch (error) {
    if (error instanceof MercadoLibreError) {
      throw new Error(
        `${error.message}${catalogMismatchNote ? `\n\n${catalogMismatchNote}` : ""}\n\nRequest body sent:\n${JSON.stringify(body, null, 2)}`
      );
    }
    throw error;
  }
}

export async function sellerListOrdersByStatus(
  client: MercadoLibreClient,
  params: SellerListOrdersByStatusParams
): Promise<unknown> {
  return sellerSearchOrders(client, {
    seller_id: params.seller_id,
    status: params.status,
    limit: params.limit,
    offset: params.offset,
  });
}

export async function sellerListMessagePacks(
  client: MercadoLibreClient,
  params: SellerListMessagePacksParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  const maxResults = params.limit !== undefined ? Math.min(params.limit, 50) : undefined;

  const trimUnreadResults = (raw: unknown): unknown => {
    if (maxResults === undefined || typeof raw !== "object" || raw === null) {
      return raw;
    }
    const record = raw as Record<string, unknown>;
    const results = record.results;
    if (!Array.isArray(results) || results.length <= maxResults) {
      return raw;
    }
    return { ...record, results: results.slice(0, maxResults) };
  };

  try {
    const result = await client.get("/messages/unread", {
      role: "seller",
      tag: "post_sale",
    });
    return {
      api: "GET /messages/unread?role=seller&tag=post_sale",
      seller_id: sellerId,
      result: trimUnreadResults(result),
    };
  } catch (error) {
    if (!(error instanceof MercadoLibreError) || (error.status !== 403 && error.status !== 404)) {
      throw error;
    }
    try {
      const result = await client.get("/marketplace/messages/unread", {
        role: "seller",
        tag: "post_sale",
        user_id: String(sellerId),
      });
      return {
        api: "GET /marketplace/messages/unread?role=seller&tag=post_sale",
        seller_id: sellerId,
        result: trimUnreadResults(result),
      };
    } catch (marketplaceError) {
      if (
        marketplaceError instanceof MercadoLibreError &&
        (marketplaceError.status === 403 || marketplaceError.status === 404)
      ) {
        return {
          api: "GET /messages/unread (domestic) | GET /marketplace/messages/unread (global selling)",
          seller_id: sellerId,
          unavailable: true,
          status: marketplaceError.status,
          message:
            "Post-sale messages API unavailable for this seller. Domestic sellers use GET /messages/unread; Global Selling uses GET /marketplace/messages/unread. Model 6 sellers are blocked by Mercado Libre (403).",
        };
      }
      throw marketplaceError;
    }
  }
}

export async function sellerGetPackMessages(
  client: MercadoLibreClient,
  params: SellerGetPackMessagesParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  const markAsRead = params.mark_as_read === true ? "true" : "false";
  const qp: Record<string, string> = {
    tag: "post_sale",
    mark_as_read: markAsRead,
  };
  const result = await client.get(
    `/messages/packs/${encodeURIComponent(params.pack_id)}/sellers/${encodeURIComponent(String(sellerId))}`,
    qp
  );
  return {
    api: `GET /messages/packs/{pack_id}/sellers/{seller_id}?tag=post_sale&mark_as_read=${markAsRead}`,
    seller_id: sellerId,
    pack_id: params.pack_id,
    result,
  };
}

function extractBuyerIdFromPackThread(thread: unknown, sellerId: number): number | undefined {
  if (typeof thread !== "object" || thread === null) {
    return undefined;
  }
  const record = thread as Record<string, unknown>;
  const nested = record.result;
  const messagesSource =
    typeof nested === "object" && nested !== null && Array.isArray((nested as Record<string, unknown>).messages)
      ? (nested as Record<string, unknown>).messages
      : record.messages;
  if (!Array.isArray(messagesSource)) {
    return undefined;
  }
  const messages = messagesSource as Array<Record<string, unknown>>;
  for (const message of messages) {
    const from = message.from as { user_id?: number | string } | undefined;
    const fromId = from?.user_id !== undefined ? Number(from.user_id) : Number.NaN;
    if (Number.isFinite(fromId) && fromId !== sellerId) {
      return fromId;
    }
  }
  for (const message of messages) {
    const to = message.to as { user_id?: number | string } | undefined;
    const toId = to?.user_id !== undefined ? Number(to.user_id) : Number.NaN;
    if (Number.isFinite(toId) && toId !== sellerId) {
      return toId;
    }
  }
  return undefined;
}

export async function sellerSendPackMessage(
  client: MercadoLibreClient,
  params: SellerSendPackMessageParams
): Promise<unknown> {
  if (params.text.length === 0) {
    throw new Error("Message text is required");
  }
  if (params.text.length > 350) {
    throw new Error("Post-sale seller messages must be at most 350 characters");
  }
  const sellerId = await resolveSellerId(client, params.seller_id);
  let buyerId = params.buyer_id;
  if (buyerId === undefined) {
    const thread = await client.get(
      `/messages/packs/${encodeURIComponent(params.pack_id)}/sellers/${encodeURIComponent(String(sellerId))}`,
      { tag: "post_sale", mark_as_read: "false" }
    );
    buyerId = extractBuyerIdFromPackThread(thread, sellerId);
    if (buyerId === undefined) {
      throw new Error(
        "buyer_id is required when the pack thread has no buyer messages to infer the recipient"
      );
    }
  }
  const result = await client.post(
    `/messages/packs/${encodeURIComponent(params.pack_id)}/sellers/${encodeURIComponent(String(sellerId))}`,
    {
      from: { user_id: String(sellerId) },
      to: { user_id: String(buyerId) },
      text: params.text,
    },
    { tag: "post_sale" }
  );
  return {
    api: "POST /messages/packs/{pack_id}/sellers/{seller_id}?tag=post_sale",
    seller_id: sellerId,
    pack_id: params.pack_id,
    buyer_id: buyerId,
    char_count: params.text.length,
    seller_max_message_length: 350,
    note: "Replying to an existing buyer message does not require the action_guide flow. Seller-initiated first contact on Mercado Envíos 2 may require action_guide.",
    result,
  };
}

interface ItemVariationRow {
  id: number;
  user_product_id?: string;
  price?: number;
  available_quantity?: number;
}

function resolveVariationForUpdate(
  variations: ItemVariationRow[],
  variationId?: number
): ItemVariationRow {
  if (variations.length === 0) {
    throw new Error("Item has no variations; use root-level price or available_quantity");
  }
  if (variationId !== undefined) {
    const match = variations.find((row) => row.id === variationId);
    if (!match) {
      const ids = variations.map((row) => String(row.id)).join(", ");
      throw new Error(`variation_id ${variationId} not found on this item. Available: ${ids}`);
    }
    return match;
  }
  if (variations.length === 1) {
    return variations[0];
  }
  const ids = variations.map((row) => String(row.id)).join(", ");
  throw new Error(
    `Item has ${variations.length} variations; price/stock must target one via variation_id. Available: ${ids}`
  );
}

function buildItemUpdatePutBody(
  params: SellerUpdateMyItemParams,
  variations: ItemVariationRow[]
): { body: Record<string, string | number | Array<Record<string, string | number>>>; update_mode: "item" | "variation"; variation_id?: number } {
  const body: Record<string, string | number | Array<Record<string, string | number>>> = {};
  const hasPriceOrStock =
    params.price !== undefined || params.available_quantity !== undefined;
  const useVariationRoute = hasPriceOrStock && variations.length > 0;

  if (params.status !== undefined) {
    body.status = params.status;
  }

  if (useVariationRoute) {
    const variation = resolveVariationForUpdate(variations, params.variation_id);
    const variationBody: Record<string, string | number> = { id: variation.id };
    if (params.price !== undefined) {
      variationBody.price = params.price;
    }
    if (params.available_quantity !== undefined) {
      variationBody.available_quantity = params.available_quantity;
    }
    body.variations = [variationBody];
    return {
      body,
      update_mode: "variation",
      variation_id: variation.id,
    };
  }

  if (params.price !== undefined) {
    body.price = params.price;
  }
  if (params.available_quantity !== undefined) {
    body.available_quantity = params.available_quantity;
  }

  return { body, update_mode: "item" };
}

export async function sellerUpdateMyItem(
  client: MercadoLibreClient,
  params: SellerUpdateMyItemParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  const item = await assertMyItem(client, params.item_id, sellerId);
  const rawVariations = item.variations;
  const variations: ItemVariationRow[] = Array.isArray(rawVariations)
    ? rawVariations
        .filter((row): row is Record<string, unknown> => row !== null && typeof row === "object")
        .map((row) => ({
          id: Number(row.id),
          user_product_id:
            typeof row.user_product_id === "string" ? row.user_product_id : undefined,
          price: typeof row.price === "number" ? row.price : undefined,
          available_quantity:
            typeof row.available_quantity === "number" ? row.available_quantity : undefined,
        }))
        .filter((row) => Number.isFinite(row.id))
    : [];

  const { body, update_mode, variation_id } = buildItemUpdatePutBody(params, variations);
  if (Object.keys(body).length === 0) {
    throw new Error("Provide at least one of price, available_quantity, or status to update");
  }

  const updatedFields: string[] = [];
  if (params.status !== undefined) {
    updatedFields.push("status");
  }
  if (params.price !== undefined) {
    updatedFields.push("price");
  }
  if (params.available_quantity !== undefined) {
    updatedFields.push("available_quantity");
  }

  try {
    const result = await client.put(
      `/items/${encodeURIComponent(params.item_id)}`,
      body as Record<string, string | number | boolean | null | Record<string, unknown>>
    );
    return {
      api: "PUT /items/{id}",
      seller_id: sellerId,
      item_id: params.item_id,
      update_mode,
      variation_id,
      updated_fields: updatedFields,
      request_body: body,
      result,
    };
  } catch (error) {
    if (error instanceof MercadoLibreError) {
      const hints: string[] = [];
      if (error.body.includes("item.price.not_modifiable")) {
        hints.push(
          "Price cannot be set on the item root when variations/user_product_id exist; the tool routes via variations when possible."
        );
      }
      if (error.body.includes("available_quantity") && error.body.includes("not modifiable")) {
        hints.push(
          "Stock must be updated on a variation (user-product listings), not on the parent item."
        );
      }
      if (variations.length > 0) {
        hints.push(
          `This item has ${variations.length} variation(s): ${variations.map((v) => v.id).join(", ")}.`
        );
      }
      const hintText = hints.length > 0 ? `\n\nHints:\n- ${hints.join("\n- ")}` : "";
      throw new Error(`${error.message}${hintText}\n\nRequest body sent:\n${JSON.stringify(body, null, 2)}`);
    }
    throw error;
  }
}

export async function sellerUpdateMyItemDescription(
  client: MercadoLibreClient,
  params: SellerUpdateMyItemDescriptionParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  await assertMyItem(client, params.item_id, sellerId);
  const result = await client.put(
    `/items/${encodeURIComponent(params.item_id)}/description`,
    { plain_text: params.plain_text }
  );
  return {
    api: "PUT /items/{id}/description",
    seller_id: sellerId,
    item_id: params.item_id,
    result,
  };
}

export async function sellerAddListingPictures(
  client: MercadoLibreClient,
  params: SellerAddListingPicturesParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  const item = await assertMyItem(client, params.item_id, sellerId);
  const itemRecord = item as Record<string, unknown>;

  if (isCatalogManagedListing(itemRecord)) {
    throw new Error(
      "This listing is a Mercado Libre catalog listing (catalog_listing). Photos are managed by the catalog and cannot be added via the seller API — the PUT may succeed but the live page will not show seller-added images. Suggest corrections in Mercado Libre (Listings → Edit → Modification history) or publish a traditional (non-catalog) listing."
    );
  }

  const newIds = params.picture_ids ?? [];
  const newSources = params.picture_sources ?? [];
  if (newIds.length === 0 && newSources.length === 0) {
    throw new Error("Provide at least one picture_id or picture_source to add");
  }

  const payload = buildPicturesPutPayload(
    itemRecord,
    newSources.length > 0 ? newSources : undefined,
    newIds.length > 0 ? newIds : undefined,
    params.replace_pictures
  );

  if (payload.pictures.length === 0) {
    throw new Error("No pictures to set on item");
  }

  const body: Record<string, MercadoLibreListingPictureRef[] | Array<{ id: number; picture_ids: string[] }>> = {
    pictures: payload.pictures,
  };
  if (payload.variations && payload.variations.length > 0) {
    body.variations = payload.variations;
  }

  try {
    const result = await client.put(
      `/items/${encodeURIComponent(params.item_id)}`,
      body as unknown as Record<
        string,
        string | number | boolean | null | Record<string, unknown>
      >
    );

    const afterItem = await client.get<Record<string, unknown>>(
      `/items/${encodeURIComponent(params.item_id)}`
    );
    const verifiedPictureCount = extractItemPictureRefs(afterItem).length;
    const expectedPictureCount = payload.pictures.length;
    const verified = verifiedPictureCount >= expectedPictureCount;

    const response: Record<string, unknown> = {
      api: "PUT /items/{id} (pictures)",
      seller_id: sellerId,
      item_id: params.item_id,
      mode: params.replace_pictures ? "replace" : "add",
      existing_picture_count: extractItemPictureRefs(itemRecord).length,
      pictures_sent: payload.pictures,
      variations_sent: payload.variations ?? null,
      added_picture_ids: newIds,
      verified,
      verified_picture_count: verifiedPictureCount,
      expected_picture_count: expectedPictureCount,
      result,
    };

    if (!verified) {
      response.warning =
        "PUT succeeded but GET /items still shows fewer pictures than expected. If this listing is catalog-linked, photos may not be editable via API. Otherwise retry — items with variations require picture_ids on each variation (now included automatically).";
    }

    return response;
  } catch (error) {
    if (error instanceof MercadoLibreError) {
      throw new Error(
        `${error.message}\n\nMercado Libre requires existing picture ids plus new ones when adding, and items with variations need picture_ids on each variation. This tool merges both automatically.\n\nRequest body sent:\n${JSON.stringify(body, null, 2)}`
      );
    }
    throw error;
  }
}

export async function sellerSearchClaims(
  client: MercadoLibreClient,
  params: SellerSearchClaimsParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  const qp: Record<string, string> = {
    limit: String(Math.min(params.limit ?? 20, 50)),
  };
  if (params.offset !== undefined) {
    qp.offset = String(params.offset);
  }
  if (params.status) {
    qp.status = params.status;
  }
  if (params.stage) {
    qp.stage = params.stage;
  }
  if (params.order_id !== undefined) {
    qp.order_id = String(params.order_id);
  }
  qp.seller_id = String(sellerId);
  return client.get("/post-purchase/v1/claims/search", qp);
}

export async function sellerGetClaim(
  client: MercadoLibreClient,
  params: SellerGetClaimParams
): Promise<unknown> {
  return client.get(
    `/post-purchase/v1/claims/${encodeURIComponent(String(params.claim_id))}`
  );
}

export async function sellerGetClaimReturns(
  client: MercadoLibreClient,
  params: SellerGetClaimReturnsParams
): Promise<unknown> {
  return client.get(
    `/post-purchase/v2/claims/${encodeURIComponent(String(params.claim_id))}/returns`
  );
}

export async function sellerSubmitClaimAction(
  client: MercadoLibreClient,
  params: SellerSubmitClaimActionParams
): Promise<unknown> {
  const body: Record<string, string | number | boolean | Record<string, unknown>> = {
    action: params.action,
    ...(params.payload ?? {}),
  };
  return client.post(
    `/post-purchase/v1/claims/${encodeURIComponent(String(params.claim_id))}/actions`,
    body
  );
}

interface OrderFeedbackSide {
  id?: number;
  role?: string;
  rating?: string;
  message?: string | null;
  reply?: string | null;
  fulfilled?: boolean;
  date_created?: string;
  status?: string;
  item?: unknown;
  from?: unknown;
  order_id?: number;
}

interface OrderFeedbackResponse {
  sale?: OrderFeedbackSide | null;
  purchase?: OrderFeedbackSide | null;
}

function hasBuyerFeedback(purchase: OrderFeedbackSide | null | undefined): boolean {
  if (!purchase || typeof purchase !== "object") {
    return false;
  }
  if (purchase.id !== undefined && purchase.id !== null) {
    return true;
  }
  if (purchase.rating !== undefined && purchase.rating !== null && purchase.rating !== "") {
    return true;
  }
  if (typeof purchase.message === "string" && purchase.message.trim().length > 0) {
    return true;
  }
  return false;
}

export async function sellerGetOrderFeedback(
  client: MercadoLibreClient,
  params: SellerGetOrderFeedbackParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  const order = await client.get<Record<string, unknown>>(
    `/orders/${encodeURIComponent(String(params.order_id))}`
  );
  const orderSeller = order.seller as { id?: number } | undefined;
  if (orderSeller?.id !== undefined && orderSeller.id !== sellerId) {
    throw new MercadoLibreError(
      "GET",
      `/orders/${params.order_id}`,
      403,
      JSON.stringify({ message: "Order does not belong to authenticated seller" })
    );
  }
  const feedback = await client.get<OrderFeedbackResponse>(
    `/orders/${encodeURIComponent(String(params.order_id))}/feedback`
  );
  return {
    api: "GET /orders/{order_id}/feedback",
    seller_id: sellerId,
    order_id: params.order_id,
    sale: feedback.sale ?? null,
    purchase: feedback.purchase ?? null,
    note: "Buyer feedback received by the seller is the purchase side. Use purchase.id with seller_reply_feedback.",
    result: feedback,
  };
}

export async function sellerListFeedback(
  client: MercadoLibreClient,
  params: SellerListFeedbackParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  const feedbackLimit = Math.min(params.limit ?? 10, 50);
  const ordersScanLimit = Math.min(Math.max(feedbackLimit * 3, 20), 50);
  const searchQp: Record<string, string> = {
    seller: String(sellerId),
    sort: "date_desc",
    limit: String(ordersScanLimit),
  };
  if (params.offset !== undefined) {
    searchQp.offset = String(params.offset);
  }
  const searchResult = await client.get<OrdersSearchResponse>("/orders/search", searchQp);
  const orders = searchResult.results ?? [];
  const feedbackEntries: Array<Record<string, unknown>> = [];
  const fetchErrors: Array<{ order_id: number; status?: number; message: string }> = [];

  for (const order of orders) {
    if (feedbackEntries.length >= feedbackLimit) {
      break;
    }
    const orderId = order.id;
    if (typeof orderId !== "number") {
      continue;
    }
    try {
      const feedback = await client.get<OrderFeedbackResponse>(
        `/orders/${encodeURIComponent(String(orderId))}/feedback`
      );
      const purchase = feedback.purchase;
      if (!hasBuyerFeedback(purchase)) {
        continue;
      }
      feedbackEntries.push({
        order_id: orderId,
        feedback_id: purchase?.id ?? null,
        role: "buyer_to_seller",
        rating: purchase?.rating ?? null,
        message: purchase?.message ?? null,
        reply: purchase?.reply ?? null,
        fulfilled: purchase?.fulfilled ?? null,
        date_created: purchase?.date_created ?? null,
        status: purchase?.status ?? null,
        item: purchase?.item ?? null,
        from: purchase?.from ?? null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = error instanceof MercadoLibreError ? error.status : undefined;
      fetchErrors.push({ order_id: orderId, status, message });
    }
  }

  return {
    api: "GET /orders/search?seller={seller_id} + GET /orders/{order_id}/feedback",
    seller_id: sellerId,
    note:
      "Mercado Libre has no bulk feedback list endpoint. Buyer feedback is the purchase side of GET /orders/{id}/feedback. Use feedback_id with seller_reply_feedback.",
    orders_scanned: orders.length,
    feedback_count: feedbackEntries.length,
    feedback: feedbackEntries,
    paging: searchResult.paging ?? null,
    fetch_errors: fetchErrors.length > 0 ? fetchErrors : undefined,
  };
}

export async function sellerReplyFeedback(
  client: MercadoLibreClient,
  params: SellerReplyFeedbackParams
): Promise<unknown> {
  return client.post(
    `/feedback/${encodeURIComponent(String(params.feedback_id))}/reply`,
    { reply: params.reply }
  );
}

export async function sellerCreatePromotionDraft(
  client: MercadoLibreClient,
  params: SellerCreatePromotionDraftParams
): Promise<unknown> {
  const me = await getMeProfile(client);
  const sellerId = params.seller_id ?? me.id;
  const promotionType = params.promotion_type ?? "SELLER_CAMPAIGN";

  const startRaw = params.start_date ?? params.raw_body?.start_date;
  const finishRaw = params.finish_date ?? params.raw_body?.finish_date;

  const body: Record<string, unknown> = {
    ...(params.raw_body ?? {}),
    promotion_type: promotionType,
    name: params.name,
    start_date: normalizePromotionLocalDate(startRaw, "start_date"),
    finish_date: normalizePromotionLocalDate(finishRaw, "finish_date"),
  };

  if (params.sub_type) {
    body.sub_type = params.sub_type;
  } else if (promotionType === "SELLER_CAMPAIGN" && body.sub_type === undefined) {
    body.sub_type = "FLEXIBLE_PERCENTAGE";
  }

  const queryParams: Record<string, string> = { app_version: "v2" };
  const useTestVersion = params.use_test_promotions ?? isTestUserProfile(me);
  if (useTestVersion) {
    queryParams.version = "test";
  }

  try {
    const result = await client.post(
      "/seller-promotions/promotions",
      body as Record<string, string | number | boolean | Record<string, unknown>>,
      queryParams
    );
    return {
      api: "POST /seller-promotions/promotions?app_version=v2",
      seller_id: sellerId,
      site_id: me.site_id,
      test_user: isTestUserProfile(me),
      request_body: body,
      result,
    };
  } catch (error) {
    if (error instanceof MercadoLibreError) {
      const hint =
        error.body.includes("not allowed to create")
          ? " Seller campaigns require green reputation and active listings; test users may be blocked even with valid dates."
          : error.body.includes("local format")
            ? " Dates are sent as YYYY-MM-DDTHH:mm:ss; pass YYYY-MM-DD or DD-MM-YYYY in the tool and we expand them."
            : "";
      throw new Error(
        `${error.message}${hint}\n\nRequest body sent:\n${JSON.stringify(body, null, 2)}`
      );
    }
    throw error;
  }
}

interface PictureUploadResponse {
  id?: string;
  status?: string;
  variations?: Array<{ secure_url?: string }>;
}

export async function sellerUploadListingPicture(
  client: MercadoLibreClient,
  params: SellerUploadListingPictureParams
): Promise<unknown> {
  const imageUrl = params.image_url.trim();
  if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://")) {
    throw new Error("image_url must be an absolute http(s) URL");
  }

  const imageRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
  if (!imageRes.ok) {
    throw new Error(`Failed to download image (${imageRes.status}): ${imageUrl}`);
  }
  const contentType = imageRes.headers.get("content-type");
  const bytes = await imageRes.arrayBuffer();
  if (bytes.byteLength === 0) {
    throw new Error("Downloaded image is empty");
  }
  const filename = guessImageFilename(imageUrl, contentType);
  const blob = new Blob([bytes], { type: contentType ?? "application/octet-stream" });
  const form = new FormData();
  form.append("file", blob, filename);

  const upload = await client.postMultipart<PictureUploadResponse>(
    "/pictures/items/upload",
    form
  );
  const pictureId = upload.id;
  if (!pictureId) {
    throw new Error("Mercado Libre picture upload did not return an id");
  }
  return {
    api: "POST /pictures/items/upload",
    picture_id: pictureId,
    status: upload.status ?? null,
    secure_url: upload.variations?.[0]?.secure_url ?? null,
    upload,
  };
}

export async function sellerGetListingRequirements(
  client: MercadoLibreClient,
  params: SellerGetListingRequirementsParams
): Promise<unknown> {
  const categoryId = params.category_id.trim();
  const raw = await getCategoryAttributes(client, { category_id: categoryId });
  const attributes = Array.isArray(raw)
    ? (raw as CategoryAttributeDefinition[])
    : [];
  const summary = summarizeCategoryListingRequirements(categoryId, attributes);
  return {
    api: "GET /categories/{category_id}/attributes",
    ...summary,
    note:
      "Use required_for_listing in seller_validate_listing.attributes. Pictures are mandatory when listing_type_id is gold_special (default).",
  };
}

export async function sellerValidateListing(
  client: MercadoLibreClient,
  params: SellerValidateListingParams
): Promise<unknown> {
  await resolveSellerId(client);
  const body = buildCreateItemBody(params);
  const validation = await client.postValidate("/items/validate", body);
  const parsed = parseListingValidationResponse(
    validation.status,
    validation.valid ? undefined : validation.errors
  );

  const hints: string[] = [];
  if (!body.pictures || (Array.isArray(body.pictures) && body.pictures.length === 0)) {
    hints.push(
      "No pictures in payload. gold_special requires picture_ids and/or picture_sources — upload with seller_upload_listing_picture first."
    );
  }
  if (!body.attributes || (Array.isArray(body.attributes) && body.attributes.length === 0)) {
    hints.push(
      "attributes array is empty. Call seller_get_listing_requirements for this category_id before validate."
    );
  }
  for (const err of parsed.errors) {
    if (err.code === "item.attributes.missing_required") {
      hints.push(
        "Missing category attributes. Call seller_get_listing_requirements and add every id listed in required_for_listing."
      );
      break;
    }
  }

  return {
    api: "POST /items/validate",
    payload: body,
    validation,
    parsed,
    hints,
    ready_to_publish: parsed.valid,
  };
}

export async function sellerCreateListing(
  client: MercadoLibreClient,
  params: SellerCreateListingParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client);
  const body = buildCreateItemBody(params);
  const created = await client.postJson<{
    id?: string;
    permalink?: string;
    status?: string;
    title?: string;
  }>("/items", body);
  const itemId = typeof created.id === "string" ? created.id : null;
  let descriptionUpdate: unknown = null;
  const plainText = params.plain_text_description?.trim();
  if (itemId && plainText && !body.description) {
    descriptionUpdate = await client.put(
      `/items/${encodeURIComponent(itemId)}/description`,
      { plain_text: plainText }
    );
  }
  return {
    api: "POST /items",
    seller_id: sellerId,
    listing: created,
    item_id: itemId,
    permalink: typeof created.permalink === "string" ? created.permalink : null,
    description_update: descriptionUpdate,
  };
}

async function fetchSellerItemsWithDetails(
  client: MercadoLibreClient,
  sellerId: number,
  scanLimit: number
): Promise<MarketplaceItemSummary[]> {
  const search = await sellerListMyItems(client, {
    seller_id: sellerId,
    status: "active",
    limit: Math.min(scanLimit, 100),
  });
  const ids = (search as { item_ids: string[] }).item_ids ?? [];
  if (ids.length === 0) {
    return [];
  }
  const all: MarketplaceItemSummary[] = [];
  for (const chunk of chunkIds(ids, MULTIGET_MAX)) {
    const bulk = await sellerGetMyItemsBulk(client, {
      item_ids: chunk,
      seller_id: sellerId,
    });
    const items = (bulk as { items: MarketplaceItemSummary[] }).items ?? [];
    all.push(...items);
  }
  return all;
}

export async function sellerGetStoreSnapshot(
  client: MercadoLibreClient,
  params: SellerGetStoreSnapshotParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  const lowThreshold = params.low_stock_threshold ?? 3;
  const me = await sellerGetMe(client);
  const orders = await sellerSearchOrders(client, {
    seller_id: sellerId,
    limit: params.orders_limit ?? 10,
  });
  let unansweredCount = 0;
  try {
    const questions = await sellerListUnansweredQuestions(client, {
      seller_id: sellerId,
      limit: 1,
    });
    const qResult = (questions as { result: QuestionsSearchResponse }).result;
    unansweredCount = qResult?.total ?? qResult?.questions?.length ?? 0;
  } catch {
    unansweredCount = -1;
  }
  const items = await fetchSellerItemsWithDetails(client, sellerId, 30);
  const lowStock = items.filter(
    (item) =>
      typeof item.available_quantity === "number" &&
      item.available_quantity <= lowThreshold
  );
  return {
    api: "composite seller_get_store_snapshot",
    seller_id: sellerId,
    account: me,
    recent_orders: orders,
    unanswered_questions_count: unansweredCount,
    low_stock_items: lowStock.map((item) => ({
      id: item.id,
      title: item.title,
      available_quantity: item.available_quantity,
      sold_quantity: item.sold_quantity,
    })),
    active_listings_scanned: items.length,
  };
}

export async function sellerInventoryReport(
  client: MercadoLibreClient,
  params: SellerInventoryReportParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  const lowThreshold = params.low_stock_threshold ?? 3;
  const scanLimit = params.item_scan_limit ?? DEFAULT_ITEM_SCAN;
  const items = await fetchSellerItemsWithDetails(client, sellerId, scanLimit);
  const lowStock = items.filter(
    (item) =>
      typeof item.available_quantity === "number" &&
      item.available_quantity <= lowThreshold &&
      item.available_quantity >= 0
  );
  const fastSelling = [...items]
    .filter((item) => typeof item.sold_quantity === "number")
    .sort((a, b) => (b.sold_quantity ?? 0) - (a.sold_quantity ?? 0))
    .slice(0, 10);
  const deadStock = items.filter(
    (item) =>
      (item.sold_quantity ?? 0) === 0 &&
      typeof item.available_quantity === "number" &&
      item.available_quantity > 0
  );
  return {
    api: "composite seller_inventory_report",
    seller_id: sellerId,
    scanned: items.length,
    low_stock: lowStock,
    fast_selling: fastSelling,
    dead_stock: deadStock.slice(0, 20),
    thresholds: { low_stock: lowThreshold },
  };
}

export async function sellerAuditListings(
  client: MercadoLibreClient,
  params: SellerAuditListingsParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  const scanLimit = params.item_scan_limit ?? 20;
  const items = await fetchSellerItemsWithDetails(client, sellerId, scanLimit);
  const audits: Array<Record<string, unknown>> = [];
  for (const item of items.slice(0, Math.min(scanLimit, 15))) {
    const entry: Record<string, unknown> = {
      item_id: item.id,
      title: item.title,
      title_length: item.title?.length ?? 0,
      available_quantity: item.available_quantity,
      category_id: item.category_id ?? null,
    };
    try {
      const performance = await sellerGetListingHealth(client, {
        item_id: item.id,
        seller_id: sellerId,
      });
      entry.performance = (performance as { performance: unknown }).performance;
    } catch (error) {
      entry.performance_error = error instanceof Error ? error.message : String(error);
    }
    if (typeof item.category_id === "string") {
      try {
        const attrs = await getCategoryAttributes(client, { category_id: item.category_id });
        entry.category_attributes_available = Array.isArray(attrs)
          ? attrs.length
          : "object";
      } catch {
        entry.category_attributes_available = null;
      }
    }
    audits.push(entry);
  }
  return {
    api: "composite seller_audit_listings",
    seller_id: sellerId,
    audited: audits.length,
    listings: audits,
  };
}

export async function sellerListPerformanceRankings(
  client: MercadoLibreClient,
  params: SellerListPerformanceRankingsParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  const scanLimit = params.item_scan_limit ?? DEFAULT_ITEM_SCAN;
  const items = await fetchSellerItemsWithDetails(client, sellerId, scanLimit);
  const sortBy = params.sort_by ?? "sold_quantity";
  const ranked = [...items].map((item) => ({
    item_id: item.id,
    title: item.title,
    price: item.price,
    sold_quantity: item.sold_quantity ?? 0,
    available_quantity: item.available_quantity ?? 0,
    visits: null as number | null,
  }));
  for (const row of ranked.slice(0, 10)) {
    try {
      const visitsResult = await sellerGetItemVisits(client, {
        item_id: row.item_id,
        seller_id: sellerId,
      });
      const visits = (visitsResult as { visits: { total_visits?: number } }).visits;
      row.visits =
        typeof visits === "object" && visits !== null && "total_visits" in visits
          ? (visits.total_visits as number)
          : null;
    } catch {
      row.visits = null;
    }
  }
  ranked.sort((a, b) => {
    if (sortBy === "visits") {
      return (b.visits ?? 0) - (a.visits ?? 0);
    }
    if (sortBy === "available_quantity") {
      return (b.available_quantity ?? 0) - (a.available_quantity ?? 0);
    }
    return (b.sold_quantity ?? 0) - (a.sold_quantity ?? 0);
  });
  return {
    api: "composite seller_list_performance_rankings",
    seller_id: sellerId,
    sort_by: sortBy,
    rankings: ranked.slice(0, 20),
  };
}

export async function sellerFindShippingExceptions(
  client: MercadoLibreClient,
  params: SellerFindShippingExceptionsParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  const ordersResult = await sellerSearchOrders(client, {
    seller_id: sellerId,
    limit: params.orders_limit ?? 30,
  });
  const orders =
    ((ordersResult as { result: OrdersSearchResponse }).result?.results ?? []) as Array<
      Record<string, unknown>
    >;
  const exceptions: Array<Record<string, unknown>> = [];
  for (const order of orders.slice(0, 15)) {
    const orderId = order.id as number | undefined;
    if (orderId === undefined) {
      continue;
    }
    try {
      const shipments = await sellerGetOrderShipments(client, { order_id: orderId });
      const shipmentList = Array.isArray(shipments)
        ? shipments
        : (shipments as { shipments?: unknown[] }).shipments ?? [shipments];
      for (const shipment of shipmentList as Array<Record<string, unknown>>) {
        const status = String(shipment.status ?? "");
        const substatus = String(shipment.substatus ?? "");
        if (
          status === "delayed" ||
          substatus.includes("delayed") ||
          substatus.includes("late")
        ) {
          exceptions.push({
            order_id: orderId,
            shipment_id: shipment.id,
            status,
            substatus,
          });
        }
      }
    } catch (error) {
      exceptions.push({
        order_id: orderId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    api: "composite seller_find_shipping_exceptions",
    seller_id: sellerId,
    orders_scanned: Math.min(orders.length, 15),
    exceptions,
  };
}

export async function sellerListPendingShipments(
  client: MercadoLibreClient,
  params: SellerListPendingShipmentsParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  const ordersResult = await sellerSearchOrders(client, {
    seller_id: sellerId,
    status: "paid",
    limit: params.limit ?? 30,
  });
  const orders =
    ((ordersResult as { result: OrdersSearchResponse }).result?.results ?? []) as Array<
      Record<string, unknown>
    >;
  const pending: Array<Record<string, unknown>> = [];
  for (const order of orders.slice(0, 20)) {
    const orderId = order.id as number | undefined;
    if (orderId === undefined) {
      continue;
    }
    try {
      const shipments = await sellerGetOrderShipments(client, { order_id: orderId });
      pending.push({ order_id: orderId, shipments });
    } catch (error) {
      pending.push({
        order_id: orderId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    api: "composite seller_list_pending_shipments",
    seller_id: sellerId,
    paid_orders_scanned: Math.min(orders.length, 20),
    pending_shipments: pending,
  };
}

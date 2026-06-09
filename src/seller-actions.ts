import { MercadoLibreClient } from "./client.js";
import { MercadoLibreError } from "./errors.js";
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
  SellerSearchClaimsParams,
  SellerSearchOrdersParams,
  SellerSubmitClaimActionParams,
  SellerAddListingPicturesParams,
  SellerUpdateMyItemDescriptionParams,
  SellerUpdateMyItemParams,
  SellerUploadListingPictureParams,
  SellerValidateListingParams,
} from "./seller-schemas.js";
import {
  buildCreateItemBody,
  buildListingPictures,
  extractItemPictureRefs,
  mergeListingPictures,
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
    `/items/${encodeURIComponent(params.item_id)}/price_to_win`
  );
  return {
    api: "GET /items/{id}/price_to_win",
    seller_id: sellerId,
    item_id: params.item_id,
    result,
  };
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
  const qp: Record<string, string> = {
    limit: String(Math.min(params.limit ?? 20, 50)),
  };
  try {
    const result = await client.get("/marketplace/messages/pending", qp);
    return {
      api: "GET /marketplace/messages/pending",
      seller_id: sellerId,
      result,
    };
  } catch (error) {
    if (error instanceof MercadoLibreError && (error.status === 403 || error.status === 404)) {
      return {
        api: "GET /marketplace/messages/pending",
        seller_id: sellerId,
        unavailable: true,
        status: error.status,
        message: "Messages API not available for this app. Check OAuth scopes.",
      };
    }
    throw error;
  }
}

export async function sellerGetPackMessages(
  client: MercadoLibreClient,
  params: SellerGetPackMessagesParams
): Promise<unknown> {
  await resolveSellerId(client, params.seller_id);
  return client.get(
    `/messages/packs/${encodeURIComponent(params.pack_id)}/messages`
  );
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

  const newIds = params.picture_ids ?? [];
  const newSources = params.picture_sources ?? [];
  if (newIds.length === 0 && newSources.length === 0) {
    throw new Error("Provide at least one picture_id or picture_source to add");
  }

  let pictures;
  if (params.replace_pictures) {
    pictures = buildListingPictures(newSources, newIds);
  } else {
    const existing = extractItemPictureRefs(itemRecord);
    pictures = mergeListingPictures(existing, newSources, newIds);
  }

  if (!pictures || pictures.length === 0) {
    throw new Error("No pictures to set on item");
  }

  try {
    const result = await client.put(
      `/items/${encodeURIComponent(params.item_id)}`,
      { pictures } as unknown as Record<
        string,
        string | number | boolean | null | Record<string, unknown>
      >
    );
    return {
      api: "PUT /items/{id} (pictures)",
      seller_id: sellerId,
      item_id: params.item_id,
      mode: params.replace_pictures ? "replace" : "add",
      existing_picture_count: extractItemPictureRefs(itemRecord).length,
      pictures_sent: pictures,
      added_picture_ids: newIds,
      result,
    };
  } catch (error) {
    if (error instanceof MercadoLibreError) {
      throw new Error(
        `${error.message}\n\nMercado Libre requires sending existing picture ids plus new ones when adding. This tool merges them automatically.\n\nRequest body sent:\n${JSON.stringify({ pictures }, null, 2)}`
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

export async function sellerListFeedback(
  client: MercadoLibreClient,
  params: SellerListFeedbackParams
): Promise<unknown> {
  const sellerId = await resolveSellerId(client, params.seller_id);
  const qp: Record<string, string> = {
    limit: String(Math.min(params.limit ?? 20, 50)),
  };
  if (params.offset !== undefined) {
    qp.offset = String(params.offset);
  }
  try {
    const result = await client.get(
      `/feedback/receiver/${encodeURIComponent(String(sellerId))}`,
      qp
    );
    return {
      api: "GET /feedback/receiver/{user_id}",
      seller_id: sellerId,
      result,
    };
  } catch (error) {
    if (error instanceof MercadoLibreError && (error.status === 403 || error.status === 404)) {
      return {
        api: "GET /feedback/receiver/{user_id}",
        seller_id: sellerId,
        unavailable: true,
        status: error.status,
        message: "Feedback API not available for this app.",
      };
    }
    throw error;
  }
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

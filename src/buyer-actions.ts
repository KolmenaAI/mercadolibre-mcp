import { MercadoLibreClient } from "./client.js";
import { MercadoLibreError } from "./errors.js";
import {
  extractBuyBoxItemId,
  itemPrice,
  type MarketplaceItemSummary,
} from "./item-helpers.js";
import { fetchCatalogProduct, type CatalogProductPayload } from "./product-helpers.js";
import { searchItems, getSellerInfo } from "./actions.js";
import {
  dedupeListingsBySeller,
  extractListingSellerId,
  extractSitesSearchListings,
  parseDomainDiscoveryTop,
  scoreSellerReputation,
  titleMatchesProductQuery,
  tokenizeProductQuery,
  type SitesSearchListing,
} from "./buyer-seller-ranking.js";
import type {
  AskSellerQuestionParams,
  CompareProductsParams,
  FindOffersForProductQueryParams,
  GetCategoryAttributesParams,
  GetClaimParams,
  GetClaimReturnsParams,
  GetDomainDiscoveryParams,
  GetItemQuestionsParams,
  GetItemReviewsParams,
  GetItemSaleTermsParams,
  GetItemShippingOptionsParams,
  GetItemsBulkParams,
  GetMeParams,
  GetMyOrdersParams,
  GetOfficialStoreParams,
  GetOrderDiscountsParams,
  GetOrderFeedbackParams,
  GetOrderParams,
  GetOrderShipmentsParams,
  GetProductBuyboxParams,
  GetProductListingsParams,
  GetQuestionParams,
  GetSellerResponseTimeParams,
  GetShipmentParams,
  RankSellersForQueryParams,
  SearchBuyableListingsParams,
  SearchListingsBySellerParams,
  SearchListingsParams,
  SearchMyClaimsParams,
} from "./buyer-schemas.js";

const MULTIGET_MAX = 20;

export async function getProductBuybox(
  client: MercadoLibreClient,
  params: GetProductBuyboxParams
): Promise<unknown> {
  const product = await fetchCatalogProduct(client, params.product_id);
  const buyBoxItemId = extractBuyBoxItemId(product);
  return {
    product_id: product.id,
    name: product.name,
    permalink: product.permalink,
    buy_box_winner_item_id: buyBoxItemId,
    buy_box_winner_price_range: product.buy_box_winner_price_range ?? null,
    buy_box_winner: product.buy_box_winner ?? null,
    note: buyBoxItemId
      ? "buy_box_winner already includes price/currency_id/seller_id. Use get_item with buy_box_winner_item_id only if you need more listing detail."
      : "No buy box winner for this catalog product, so it has no catalog price. Use rank_sellers_for_query for merchant discovery or find_offers_for_product_query for buy-box offers.",
  };
}

export async function getItemsBulk(
  client: MercadoLibreClient,
  params: GetItemsBulkParams
): Promise<unknown> {
  const ids = [...new Set(params.item_ids.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    throw new Error("item_ids must contain at least one id");
  }
  if (ids.length > MULTIGET_MAX) {
    throw new Error(`item_ids supports at most ${MULTIGET_MAX} ids per call`);
  }
  const items = await client.get<MarketplaceItemSummary[]>(
    "/items",
    { ids: ids.join(",") }
  );
  return {
    api: "GET /items?ids=",
    requested: ids.length,
    items,
  };
}

export async function getItemReviews(
  client: MercadoLibreClient,
  params: GetItemReviewsParams
): Promise<unknown> {
  const qp: Record<string, string> = {};
  if (params.catalog_product_id) {
    qp.catalog_product_id = params.catalog_product_id;
  }
  return client.get(
    `/reviews/item/${encodeURIComponent(params.item_id)}`,
    Object.keys(qp).length > 0 ? qp : undefined
  );
}

export async function getItemShippingOptions(
  client: MercadoLibreClient,
  params: GetItemShippingOptionsParams
): Promise<unknown> {
  const qp: Record<string, string> = {};
  if (params.zip_code) {
    qp.zip_code = params.zip_code;
  }
  return client.get(
    `/items/${encodeURIComponent(params.item_id)}/shipping_options`,
    Object.keys(qp).length > 0 ? qp : undefined
  );
}

export async function getCategoryAttributes(
  client: MercadoLibreClient,
  params: GetCategoryAttributesParams
): Promise<unknown> {
  return client.get(`/categories/${encodeURIComponent(params.category_id)}/attributes`);
}

export async function getDomainDiscovery(
  client: MercadoLibreClient,
  params: GetDomainDiscoveryParams
): Promise<unknown> {
  const siteId = params.site_id ?? "MLA";
  const qp: Record<string, string> = {
    q: params.query,
    limit: String(Math.min(params.limit ?? 8, 20)),
  };
  return client.get(
    `/sites/${encodeURIComponent(siteId)}/domain_discovery/search`,
    qp
  );
}

export async function searchListingsBySeller(
  client: MercadoLibreClient,
  params: SearchListingsBySellerParams
): Promise<unknown> {
  const limit = Math.min(params.limit ?? 20, 50);
  const qp: Record<string, string> = {
    status: "active",
    limit: String(limit),
  };
  if (params.offset !== undefined) {
    qp.offset = String(params.offset);
  }

  const itemsSearch = await client.get<{ results?: string[]; paging?: unknown }>(
    `/users/${encodeURIComponent(String(params.seller_id))}/items/search`,
    qp
  );
  const itemIds = itemsSearch.results ?? [];
  if (itemIds.length === 0) {
    return {
      search_api: "users/items/search",
      seller_id: params.seller_id,
      site_id: params.site_id ?? "MLA",
      item_ids: [],
      listings: [],
    };
  }

  const listings: MarketplaceItemSummary[] = [];
  for (let offset = 0; offset < itemIds.length; offset += MULTIGET_MAX) {
    const chunk = itemIds.slice(offset, offset + MULTIGET_MAX);
    const batch = await client.get<MarketplaceItemSummary[]>("/items", {
      ids: chunk.join(","),
    });
    if (Array.isArray(batch)) {
      listings.push(...batch);
    }
  }

  return {
    search_api: "users/items/search",
    seller_id: params.seller_id,
    site_id: params.site_id ?? "MLA",
    paging: itemsSearch.paging ?? null,
    listings,
  };
}

export async function getOfficialStore(
  client: MercadoLibreClient,
  params: GetOfficialStoreParams
): Promise<unknown> {
  return client.get(`/stores/${encodeURIComponent(String(params.store_id))}`);
}

export async function getProductListings(
  client: MercadoLibreClient,
  params: GetProductListingsParams
): Promise<unknown> {
  const qp: Record<string, string> = {
    limit: String(Math.min(params.limit ?? 20, 50)),
  };
  if (params.offset !== undefined) {
    qp.offset = String(params.offset);
  }
  const result = await client.get(
    `/products/${encodeURIComponent(params.product_id)}/items`,
    qp
  );
  return {
    api: "GET /products/{id}/items",
    deprecation_note:
      "DECOMMISSIONED by Mercado Libre on 2025-10-01 — this endpoint no longer returns competing listings and will be empty. For a catalog price use buy_box_winner (get_product_buybox); for merchant discovery use rank_sellers_for_query.",
    product_id: params.product_id,
    result,
  };
}

export async function getSellerResponseTime(
  client: MercadoLibreClient,
  params: GetSellerResponseTimeParams
): Promise<unknown> {
  return client.get(
    `/users/${encodeURIComponent(String(params.seller_id))}/questions/response_time`
  );
}

export async function getItemQuestions(
  client: MercadoLibreClient,
  params: GetItemQuestionsParams
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

export async function askSellerQuestion(
  client: MercadoLibreClient,
  params: AskSellerQuestionParams
): Promise<unknown> {
  if (params.text.length > 2000) {
    throw new Error("Question text must be at most 2000 characters");
  }
  return client.post("/questions", {
    text: params.text,
    item_id: params.item_id,
  });
}

export async function getQuestion(
  client: MercadoLibreClient,
  params: GetQuestionParams
): Promise<unknown> {
  return client.get(`/questions/${encodeURIComponent(String(params.question_id))}`, {
    api_version: "4",
  });
}

export async function getItemSaleTerms(
  client: MercadoLibreClient,
  params: GetItemSaleTermsParams
): Promise<unknown> {
  const item = await client.get<MarketplaceItemSummary>(
    `/items/${encodeURIComponent(params.item_id)}`
  );
  return {
    item_id: item.id,
    price: item.price,
    currency_id: item.currency_id,
    original_price: item.original_price,
    sale_terms: item.sale_terms ?? null,
    installments: item.installments ?? null,
    warranty: extractWarranty(item.sale_terms),
  };
}

function extractWarranty(saleTerms: unknown): unknown {
  if (!Array.isArray(saleTerms)) {
    return null;
  }
  return saleTerms.find((term) => {
    if (term && typeof term === "object" && "id" in term) {
      const id = (term as { id?: string }).id;
      return id === "WARRANTY_TYPE" || id === "WARRANTY_TIME";
    }
    return false;
  }) ?? null;
}

export async function getMe(
  client: MercadoLibreClient,
  _params?: GetMeParams
): Promise<unknown> {
  return client.get("/users/me");
}

export async function getMyOrders(
  client: MercadoLibreClient,
  params: GetMyOrdersParams
): Promise<unknown> {
  let buyerId = params.buyer_id;
  if (buyerId === undefined) {
    const me = await client.get<{ id: number }>("/users/me");
    buyerId = me.id;
  }
  const qp: Record<string, string> = {
    buyer: String(buyerId),
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
  const result = await client.get("/orders/search", qp);
  return {
    buyer_id: buyerId,
    api: "GET /orders/search?buyer=",
    result,
  };
}

export async function getOrder(
  client: MercadoLibreClient,
  params: GetOrderParams
): Promise<unknown> {
  return client.get(`/orders/${encodeURIComponent(String(params.order_id))}`);
}

export async function getOrderShipments(
  client: MercadoLibreClient,
  params: GetOrderShipmentsParams
): Promise<unknown> {
  return client.get(`/orders/${encodeURIComponent(String(params.order_id))}/shipments`);
}

export async function getShipment(
  client: MercadoLibreClient,
  params: GetShipmentParams
): Promise<unknown> {
  return client.get(`/shipments/${encodeURIComponent(String(params.shipment_id))}`);
}

export async function getOrderDiscounts(
  client: MercadoLibreClient,
  params: GetOrderDiscountsParams
): Promise<unknown> {
  return client.get(`/orders/${encodeURIComponent(String(params.order_id))}/discounts`);
}

export async function getOrderFeedback(
  client: MercadoLibreClient,
  params: GetOrderFeedbackParams
): Promise<unknown> {
  return client.get(`/orders/${encodeURIComponent(String(params.order_id))}/feedback`);
}

export async function searchMyClaims(
  client: MercadoLibreClient,
  params: SearchMyClaimsParams
): Promise<unknown> {
  const qp: Record<string, string> = {
    limit: String(Math.min(params.limit ?? 20, 50)),
  };
  if (params.offset !== undefined) {
    qp.offset = String(params.offset);
  }
  if (params.stage) {
    qp.stage = params.stage;
  }
  if (params.status) {
    qp.status = params.status;
  }
  if (params.order_id !== undefined) {
    qp.order_id = String(params.order_id);
  }
  return client.get("/post-purchase/v1/claims/search", qp);
}

export async function getClaim(
  client: MercadoLibreClient,
  params: GetClaimParams
): Promise<unknown> {
  return client.get(`/post-purchase/v1/claims/${encodeURIComponent(String(params.claim_id))}`);
}

export async function getClaimReturns(
  client: MercadoLibreClient,
  params: GetClaimReturnsParams
): Promise<unknown> {
  return client.get(
    `/post-purchase/v2/claims/${encodeURIComponent(String(params.claim_id))}/returns`
  );
}

export async function compareProducts(
  client: MercadoLibreClient,
  params: CompareProductsParams
): Promise<unknown> {
  const listingIds: string[] = [...(params.item_ids ?? [])];

  if (params.product_ids) {
    for (const productId of params.product_ids) {
      const product = await fetchCatalogProduct(client, productId);
      const itemId = extractBuyBoxItemId(product);
      if (itemId) {
        listingIds.push(itemId);
      }
    }
  }

  const uniqueIds = [...new Set(listingIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length < 2) {
    throw new Error("Provide at least two item_ids or product_ids with buy box winners");
  }
  if (uniqueIds.length > 5) {
    throw new Error("compare_products supports at most 5 listings");
  }

  const bulk = await getItemsBulk(client, { item_ids: uniqueIds });
  const bulkItems = (bulk as { items: MarketplaceItemSummary[] }).items;

  const comparisons = [];
  for (const item of bulkItems) {
    const entry: Record<string, unknown> = {
      item_id: item.id,
      title: item.title,
      price: item.price,
      currency_id: item.currency_id,
      condition: item.condition,
      seller_id: item.seller_id,
      permalink: item.permalink,
      free_shipping: item.shipping?.free_shipping ?? null,
    };

    if (params.include_reviews) {
      try {
        entry.reviews = await getItemReviews(client, {
          item_id: item.id,
          catalog_product_id:
            typeof item.catalog_product_id === "string" ? item.catalog_product_id : undefined,
        });
      } catch (error) {
        entry.reviews_error = error instanceof Error ? error.message : String(error);
      }
    }

    if (params.include_shipping) {
      try {
        entry.shipping_options = await getItemShippingOptions(client, {
          item_id: item.id,
          zip_code: params.zip_code,
        });
      } catch (error) {
        entry.shipping_error = error instanceof Error ? error.message : String(error);
      }
    }

    comparisons.push(entry);
  }

  return {
    compared_count: comparisons.length,
    comparisons,
    note: "Use LLM or skill to rank options; this tool only aggregates API data.",
  };
}

export async function findOffersForProductQuery(
  client: MercadoLibreClient,
  params: FindOffersForProductQueryParams
): Promise<unknown> {
  const siteId = params.site_id ?? "MLA";
  const catalogLimit = Math.min(params.catalog_limit ?? 15, 30);

  const searchResult = await searchItems(client, {
    query: params.query,
    site_id: siteId,
    category: params.domain_id,
    limit: catalogLimit,
  });

  const catalogResults = (searchResult as { results: Array<{ id: string; name?: string }> }).results;
  const offers: Array<Record<string, unknown>> = [];
  const catalogWithoutPrice: Array<Record<string, unknown>> = [];
  const skipped: Array<{ product_id: string; reason: string }> = [];

  for (const catalog of catalogResults) {
    let product: CatalogProductPayload;
    try {
      product = await fetchCatalogProduct(client, catalog.id);
    } catch {
      skipped.push({ product_id: catalog.id, reason: "product_fetch_failed" });
      continue;
    }

    const itemId = extractBuyBoxItemId(product);
    if (!itemId) {
      catalogWithoutPrice.push({
        catalog_product_id: catalog.id,
        catalog_name: catalog.name ?? product.name,
        permalink: product.permalink ?? null,
        buy_box_winner_price_range: product.buy_box_winner_price_range ?? null,
        note:
          "No buy-box winner for this catalog product — ML exposes no seller/price via catalog API. Use rank_sellers_for_query for merchant discovery or share the permalink with the user.",
      });
      skipped.push({ product_id: catalog.id, reason: "no_buy_box_winner" });
      continue;
    }

    let item: MarketplaceItemSummary;
    try {
      item = await client.get<MarketplaceItemSummary>(`/items/${encodeURIComponent(itemId)}`);
    } catch {
      skipped.push({ product_id: catalog.id, reason: "listing_fetch_failed" });
      continue;
    }

    const price = itemPrice(item);
    if (params.price_max !== undefined && price !== null && price > params.price_max) {
      continue;
    }
    if (params.price_min !== undefined && price !== null && price < params.price_min) {
      continue;
    }

    const row: Record<string, unknown> = {
      catalog_product_id: catalog.id,
      catalog_name: catalog.name ?? product.name,
      listing_id: item.id,
      title: item.title,
      price,
      currency_id: item.currency_id,
      condition: item.condition,
      seller_id: item.seller_id,
      permalink: item.permalink,
      free_shipping: item.shipping?.free_shipping ?? null,
    };

    if (params.include_seller_ratings !== false && typeof item.seller_id === "number") {
      try {
        const seller = await client.get<Record<string, unknown>>(
          `/users/${encodeURIComponent(String(item.seller_id))}`
        );
        row.seller = {
          id: item.seller_id,
          nickname: seller.nickname,
          seller_reputation: seller.seller_reputation ?? null,
          power_seller_status: seller.power_seller_status ?? null,
        };
      } catch {
        row.seller = { id: item.seller_id, error: "seller_fetch_failed" };
      }
    }

    offers.push(row);
  }

  return {
    strategy: "product_query_catalog_then_buy_box",
    intent:
      "Offers for the product the user asked to buy — resolved via catalog keyword search, not category-wide bestseller lists.",
    limitation:
      "Only catalog products with an active buy-box winner return price + seller. Products in catalog_without_price have specs/permalinks but no API price until ML assigns a buy box.",
    site_id: siteId,
    query: params.query,
    price_min: params.price_min ?? null,
    price_max: params.price_max ?? null,
    offer_count: offers.length,
    catalog_without_price_count: catalogWithoutPrice.length,
    skipped_count: skipped.length,
    offers,
    catalog_without_price: catalogWithoutPrice,
    skipped,
  };
}

export async function searchBuyableListings(
  client: MercadoLibreClient,
  params: SearchBuyableListingsParams
): Promise<unknown> {
  const result = await findOffersForProductQuery(client, params);
  const payload = result as Record<string, unknown>;
  return {
    ...payload,
    strategy: "catalog_search_then_buy_box",
    limitation:
      "Legacy alias of find_offers_for_product_query. Prefer find_offers_for_product_query for product-scoped offers.",
    matched_count: payload.offer_count ?? 0,
    listings: payload.offers ?? [],
  };
}

async function collectSellersFromCatalogBuyBoxes(
  client: MercadoLibreClient,
  params: {
    query: string;
    site_id: string;
    domain_id?: string;
    catalog_limit: number;
    price_min?: number;
    price_max?: number;
  }
): Promise<SitesSearchListing[]> {
  const searchResult = await searchItems(client, {
    query: params.query,
    site_id: params.site_id,
    category: params.domain_id,
    limit: params.catalog_limit,
  });
  const catalogResults = (searchResult as { results: Array<{ id: string; name?: string }> })
    .results;
  const listings: SitesSearchListing[] = [];

  for (const catalog of catalogResults) {
    let product: CatalogProductPayload;
    try {
      product = await fetchCatalogProduct(client, catalog.id);
    } catch {
      continue;
    }
    const itemId = extractBuyBoxItemId(product);
    if (!itemId) {
      continue;
    }
    try {
      const item = await client.get<MarketplaceItemSummary>(`/items/${encodeURIComponent(itemId)}`);
      const price = itemPrice(item);
      if (params.price_max !== undefined && price !== null && price > params.price_max) {
        continue;
      }
      if (params.price_min !== undefined && price !== null && price < params.price_min) {
        continue;
      }
      listings.push({
        id: item.id,
        title: item.title ?? catalog.name,
        price: price ?? undefined,
        currency_id: item.currency_id,
        seller_id: item.seller_id,
        permalink: item.permalink,
        condition: item.condition,
        shipping: item.shipping,
      });
    } catch {
      continue;
    }
  }

  return listings;
}

async function collectSellersFromCategoryListings(
  client: MercadoLibreClient,
  params: { site_id: string; category_id: string; limit: number }
): Promise<SitesSearchListing[]> {
  try {
    const result = await client.get(`/sites/${encodeURIComponent(params.site_id)}/search`, {
      category: params.category_id,
      limit: String(params.limit),
    });
    return extractSitesSearchListings({ result });
  } catch (error) {
    if (error instanceof MercadoLibreError && error.status === 403) {
      return [];
    }
    throw error;
  }
}

async function fetchSellerInventoryMatchingQuery(
  client: MercadoLibreClient,
  params: {
    seller_id: number;
    query: string;
    limit: number;
    price_min?: number;
    price_max?: number;
  }
): Promise<MarketplaceItemSummary[]> {
  const itemsSearch = await client.get<{ results?: string[] }>(
    `/users/${encodeURIComponent(String(params.seller_id))}/items/search`,
    { status: "active", limit: String(Math.min(params.limit, 50)) }
  );
  const itemIds = itemsSearch.results ?? [];
  if (itemIds.length === 0) {
    return [];
  }

  const tokens = tokenizeProductQuery(params.query);
  const matched: MarketplaceItemSummary[] = [];

  for (let offset = 0; offset < itemIds.length; offset += MULTIGET_MAX) {
    const chunk = itemIds.slice(offset, offset + MULTIGET_MAX);
    const batch = await client.get<MarketplaceItemSummary[]>("/items", {
      ids: chunk.join(","),
    });
    if (!Array.isArray(batch)) {
      continue;
    }
    for (const item of batch) {
      const title = item.title ?? "";
      if (!titleMatchesProductQuery(title, tokens)) {
        continue;
      }
      const price = itemPrice(item);
      if (params.price_max !== undefined && price !== null && price > params.price_max) {
        continue;
      }
      if (params.price_min !== undefined && price !== null && price < params.price_min) {
        continue;
      }
      matched.push(item);
    }
  }

  matched.sort((a, b) => {
    const priceA = itemPrice(a) ?? Number.POSITIVE_INFINITY;
    const priceB = itemPrice(b) ?? Number.POSITIVE_INFINITY;
    return priceA - priceB;
  });

  return matched;
}

export async function rankSellersForQuery(
  client: MercadoLibreClient,
  params: RankSellersForQueryParams
): Promise<unknown> {
  const siteId = params.site_id ?? "MLA";
  const topSellers = Math.min(params.top_sellers ?? 3, 10);
  const catalogLimit = Math.min(params.catalog_limit ?? 20, 30);
  const categoryLimit = Math.min(params.limit ?? 50, 50);
  const listingsPerSeller = Math.min(params.listings_per_seller ?? 50, 50);

  let domainId = params.domain_id ?? null;
  let categoryId: string | null = null;
  let categoryName: string | null = null;

  if (!domainId) {
    const discovery = await getDomainDiscovery(client, {
      query: params.query,
      site_id: siteId,
      limit: 5,
    });
    const parsed = parseDomainDiscoveryTop(discovery);
    domainId = parsed.domain_id;
    categoryId = parsed.category_id;
    categoryName = parsed.category_name;
  }

  const catalogListings = await collectSellersFromCatalogBuyBoxes(client, {
    query: params.query,
    site_id: siteId,
    domain_id: domainId ?? undefined,
    catalog_limit: catalogLimit,
    price_min: params.price_min,
    price_max: params.price_max,
  });

  let categoryListings: SitesSearchListing[] = [];
  if (categoryId) {
    categoryListings = await collectSellersFromCategoryListings(client, {
      site_id: siteId,
      category_id: categoryId,
      limit: categoryLimit,
    });
  }

  const mergedListings = dedupeListingsBySeller([...catalogListings, ...categoryListings]);

  const ranked: Array<Record<string, unknown>> = [];
  for (const listing of mergedListings) {
    const sellerId = extractListingSellerId(listing);
    if (sellerId === null) {
      continue;
    }

    const entry: Record<string, unknown> = {
      seller_id: sellerId,
      example_listing: {
        listing_id: listing.id,
        title: listing.title,
        price: listing.price ?? null,
        currency_id: listing.currency_id ?? null,
        permalink: listing.permalink ?? null,
        free_shipping: listing.shipping?.free_shipping ?? null,
      },
    };

    if (params.include_seller_ratings !== false) {
      try {
        const seller = (await getSellerInfo(client, { seller_id: sellerId })) as Record<
          string,
          unknown
        >;
        entry.seller = {
          nickname: seller.nickname,
          seller_reputation: seller.seller_reputation ?? null,
          power_seller_status: seller.power_seller_status ?? null,
        };
        entry.reputation_score = scoreSellerReputation(seller);
      } catch {
        entry.seller = { error: "seller_fetch_failed" };
        entry.reputation_score = 0;
      }
    } else {
      entry.reputation_score = 0;
    }

    ranked.push(entry);
  }

  ranked.sort((a, b) => {
    const scoreDelta = (b.reputation_score as number) - (a.reputation_score as number);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    const priceA =
      typeof (a.example_listing as Record<string, unknown>).price === "number"
        ? ((a.example_listing as Record<string, unknown>).price as number)
        : Number.POSITIVE_INFINITY;
    const priceB =
      typeof (b.example_listing as Record<string, unknown>).price === "number"
        ? ((b.example_listing as Record<string, unknown>).price as number)
        : Number.POSITIVE_INFINITY;
    return priceA - priceB;
  });

  const top = ranked.slice(0, topSellers);
  const sellersWithInventory: Array<Record<string, unknown>> = [];

  for (const sellerEntry of top) {
    const sellerId = sellerEntry.seller_id as number;
    const inventory = await fetchSellerInventoryMatchingQuery(client, {
      seller_id: sellerId,
      query: params.query,
      limit: listingsPerSeller,
      price_min: params.price_min,
      price_max: params.price_max,
    });
    sellersWithInventory.push({
      ...sellerEntry,
      listings: inventory.map((item) => ({
        listing_id: item.id,
        title: item.title,
        price: itemPrice(item),
        currency_id: item.currency_id,
        condition: item.condition,
        permalink: item.permalink,
        free_shipping: item.shipping?.free_shipping ?? null,
      })),
      listing_count: inventory.length,
    });
  }

  return {
    strategy: "domain_catalog_category_sellers",
    intent:
      "Top merchants for a product query via catalog domain discovery, buy-box/category seller discovery, reputation ranking, then each seller's active inventory filtered by query.",
    apis_used: [
      "GET /sites/{site}/domain_discovery/search",
      "GET /products/search",
      "GET /products/{id} + buy_box_winner (when present)",
      "GET /sites/{site}/search?category= (best-effort when category known)",
      "GET /users/{seller_id}/items/search",
      "GET /items?ids=",
    ],
    query: params.query,
    site_id: siteId,
    domain_id: domainId,
    category_id: categoryId,
    category_name: categoryName,
    catalog_buy_box_listings: catalogListings.length,
    category_listings: categoryListings.length,
    unique_sellers_found: ranked.length,
    top_sellers: sellersWithInventory,
    note:
      "Does not use deprecated GET /sites/{site}/search?q=. When unique_sellers_found is 0, call find_offers_for_product_query for catalog permalinks or ask ML to enable listing search.",
    fallback_when_empty: {
      tool: "find_offers_for_product_query",
      arguments: {
        query: params.query,
        site_id: siteId,
        domain_id: domainId ?? undefined,
      },
    },
  };
}

export async function searchListings(
  client: MercadoLibreClient,
  params: SearchListingsParams
): Promise<unknown> {
  void client;
  return {
    search_api: "sites/search?q=",
    deprecated: true,
    removed: true,
    blocked: true,
    status: 403,
    site_id: params.site_id ?? "MLA",
    query: params.query,
    explanation:
      "GET /sites/{site}/search?q= is not documented as the supported buyer path and returns 403 for this app. Use rank_sellers_for_query instead.",
    alternative: {
      tool: "rank_sellers_for_query",
      arguments: {
        query: params.query,
        site_id: params.site_id ?? "MLA",
        top_sellers: 3,
        price_min: params.price_min,
        price_max: params.price_max,
      },
    },
  };
}

import { MercadoLibreClient } from "./client.js";
import {
  catalogProductDescription,
  fetchCatalogProduct,
  isItemNotFoundError,
} from "./product-helpers.js";
import type { ScraperProvider } from "./apify-scraper.js";
import type {
  SearchItemsParams,
  GetProductParams,
  GetItemDescriptionParams,
  GetCategoriesParams,
  GetCategoryParams,
  GetSellerInfoParams,
  GetTrendsParams,
  GetCurrencyConversionParams,
} from "./schemas.js";

/**
 * Keyword search via Mercado Libre Products Search API.
 * Replaces legacy GET /sites/{site}/search?q= which returns 403 for many apps.
 * @see https://developers.mercadolibre.com.ar/en_us/news/products-search
 */
export async function searchItems(
  client: MercadoLibreClient,
  params: SearchItemsParams,
  scraper?: ScraperProvider
): Promise<unknown> {
  const siteId = params.site_id ?? "MLA";
  const limit = Math.min(params.limit ?? 10, 50);
  const qp: Record<string, string> = {
    site_id: siteId,
    status: "active",
    q: params.query,
  };
  if (params.category) {
    qp.domain_id = params.category;
  }
  qp.limit = String(limit);
  if (params.offset !== undefined) {
    qp.offset = String(params.offset);
  }
  const response = await client.get<ProductsSearchResponse>("/products/search", qp);
  const base = {
    search_api: "products/search",
    result_type: "catalog_product",
    note:
      "Result ids are catalog product ids. Use get_product or get_item with that id (get_item auto-falls back to catalog). price_min/price_max are not supported on this API.",
    keywords: response.keywords,
    paging: response.paging,
    results: response.results ?? [],
  };

  if (params.include_web_prices && scraper?.enabled) {
    const webOffers = await scraper.scrapeSearch(params.query, { site_id: siteId, limit });
    return {
      ...base,
      web_offers_note:
        "web_offers are live prices scraped from the Mercado Libre website (price_source: web), since /products/search returns catalog ids without prices.",
      web_offers: webOffers.map((o) => ({ ...o, price_source: "web" })),
    };
  }

  return base;
}

interface ProductsSearchResponse {
  keywords?: string;
  paging?: {
    total: number;
    limit: number;
    offset: number;
  };
  results?: Array<{
    id: string;
    status?: string;
    domain_id?: string;
    name?: string;
    [key: string]: unknown;
  }>;
}

export async function getProduct(
  client: MercadoLibreClient,
  params: GetProductParams
): Promise<unknown> {
  const product = await fetchCatalogProduct(client, params.product_id);
  return {
    resource_type: "catalog_product",
    api: "GET /products/{id}",
    product,
  };
}

export async function getItemDescription(
  client: MercadoLibreClient,
  params: GetItemDescriptionParams
): Promise<unknown> {
  const id = params.item_id;
  try {
    const description = await client.get(
      `/items/${encodeURIComponent(id)}/description`
    );
    return {
      resource_type: "marketplace_item_description",
      api: "GET /items/{id}/description",
      description,
    };
  } catch (error) {
    if (!isItemNotFoundError(error)) {
      throw error;
    }
    const product = await fetchCatalogProduct(client, id);
    const body = catalogProductDescription(product);
    return {
      resource_type: "catalog_product_description",
      api: "GET /products/{id} (short_description)",
      resolved_from: "item_id",
      note: "Catalog products have no /items/.../description; using short_description from product datasheet.",
      ...body,
    };
  }
}

export async function getCategories(
  client: MercadoLibreClient,
  params?: GetCategoriesParams
): Promise<unknown> {
  const siteId = params?.site_id ?? "MLA";
  return client.get(`/sites/${encodeURIComponent(siteId)}/categories`);
}

export async function getCategory(
  client: MercadoLibreClient,
  params: GetCategoryParams
): Promise<unknown> {
  return client.get(`/categories/${encodeURIComponent(params.category_id)}`);
}

export async function getSellerInfo(
  client: MercadoLibreClient,
  params: GetSellerInfoParams,
  scraper?: ScraperProvider
): Promise<unknown> {
  const seller = await client.get<Record<string, unknown>>(
    `/users/${encodeURIComponent(String(params.seller_id))}`
  );

  if (params.include_catalog && scraper?.enabled) {
    const storefrontUrl =
      typeof seller.permalink === "string" && seller.permalink.trim() !== ""
        ? seller.permalink
        : null;
    if (storefrontUrl) {
      const storefront = await scraper.scrapeSeller(storefrontUrl, {
        site_id: params.site_id,
      });
      if (storefront) {
        return { ...seller, web_storefront: { ...storefront, price_source: "web" } };
      }
    }
  }

  return seller;
}

/** Resolve a site id from an explicit value or an ML id prefix (MLA27172667 → MLA). */
export function siteForId(siteId: string | undefined, id?: string): string {
  if (siteId) return siteId;
  if (id && id.length >= 3) return id.slice(0, 3).toUpperCase();
  return "MLA";
}

export async function getTrends(
  client: MercadoLibreClient,
  params?: GetTrendsParams
): Promise<unknown> {
  const siteId = params?.site_id ?? "MLA";
  return client.get(`/trends/${encodeURIComponent(siteId)}`);
}

export async function getCurrencyConversion(
  client: MercadoLibreClient,
  params: GetCurrencyConversionParams
): Promise<unknown> {
  const result = await client.get<{ ratio: number }>(
    `/currency_conversions/search`,
    { from: params.from, to: params.to }
  );
  const amount = params.amount ?? 1;
  return {
    from: params.from,
    to: params.to,
    rate: result.ratio,
    amount,
    converted: Number((amount * result.ratio).toFixed(4)),
  };
}

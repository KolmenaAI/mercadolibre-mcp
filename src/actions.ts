import { MercadoLibreClient } from "./client.js";
import {
  catalogProductDescription,
  fetchCatalogProduct,
  isItemNotFoundError,
} from "./product-helpers.js";
import type {
  SearchItemsParams,
  GetItemParams,
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
  params: SearchItemsParams
): Promise<unknown> {
  const siteId = params.site_id ?? "MLA";
  const qp: Record<string, string> = {
    site_id: siteId,
    status: "active",
    q: params.query,
  };
  if (params.category) {
    qp.domain_id = params.category;
  }
  qp.limit = String(Math.min(params.limit ?? 10, 50));
  if (params.offset !== undefined) {
    qp.offset = String(params.offset);
  }
  const response = await client.get<ProductsSearchResponse>("/products/search", qp);
  return {
    search_api: "products/search",
    result_type: "catalog_product",
    note:
      "Result ids are catalog product ids. Use get_product or get_item with that id (get_item auto-falls back to catalog). price_min/price_max are not supported on this API.",
    keywords: response.keywords,
    paging: response.paging,
    results: response.results ?? [],
  };
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

export async function getItem(
  client: MercadoLibreClient,
  params: GetItemParams
): Promise<unknown> {
  const id = params.item_id;
  try {
    const item = await client.get(`/items/${encodeURIComponent(id)}`);
    return {
      resource_type: "marketplace_item",
      api: "GET /items/{id}",
      item,
    };
  } catch (error) {
    if (!isItemNotFoundError(error)) {
      throw error;
    }
    const product = await fetchCatalogProduct(client, id);
    return {
      resource_type: "catalog_product",
      api: "GET /products/{id}",
      resolved_from: "item_id",
      note:
        "No marketplace listing for this id; returned catalog product from search_items. Use permalink for buyer URL. For seller price/stock use marketplace item ids when available.",
      product,
    };
  }
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
  params: GetSellerInfoParams
): Promise<unknown> {
  return client.get(`/users/${encodeURIComponent(String(params.seller_id))}`);
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

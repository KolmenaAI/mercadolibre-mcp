import { MercadoLibreClient } from "./client.js";
import type {
  SearchItemsParams,
  GetItemParams,
  GetItemDescriptionParams,
  GetCategoriesParams,
  GetCategoryParams,
  GetSellerInfoParams,
  GetTrendsParams,
  GetCurrencyConversionParams,
} from "./schemas.js";

export async function searchItems(
  client: MercadoLibreClient,
  params: SearchItemsParams
): Promise<unknown> {
  const siteId = params.site_id ?? "MLA";
  const qp: Record<string, string> = { q: params.query };
  if (params.category) qp.category = params.category;
  if (params.price_min !== undefined) qp.price_min = String(params.price_min);
  if (params.price_max !== undefined) qp.price_max = String(params.price_max);
  qp.limit = String(Math.min(params.limit ?? 10, 50));
  if (params.offset !== undefined) qp.offset = String(params.offset);
  return client.get(`/sites/${encodeURIComponent(siteId)}/search`, qp);
}

export async function getItem(
  client: MercadoLibreClient,
  params: GetItemParams
): Promise<unknown> {
  return client.get(`/items/${encodeURIComponent(params.item_id)}`);
}

export async function getItemDescription(
  client: MercadoLibreClient,
  params: GetItemDescriptionParams
): Promise<unknown> {
  return client.get(`/items/${encodeURIComponent(params.item_id)}/description`);
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

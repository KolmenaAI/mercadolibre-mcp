import { MercadoLibreClient } from "./client.js";
import { MercadoLibreError } from "./errors.js";

export interface CatalogProductPayload {
  id: string;
  name?: string;
  family_name?: string;
  status?: string;
  domain_id?: string;
  permalink?: string;
  short_description?: {
    type?: string;
    content?: string;
  };
  main_features?: unknown;
  attributes?: unknown;
  pictures?: unknown;
  pickers?: unknown;
  [key: string]: unknown;
}

export async function fetchCatalogProduct(
  client: MercadoLibreClient,
  productId: string
): Promise<CatalogProductPayload> {
  return client.get<CatalogProductPayload>(`/products/${encodeURIComponent(productId)}`);
}

export function catalogProductDescription(product: CatalogProductPayload): {
  product_id: string;
  plain_text: string;
  short_description: CatalogProductPayload["short_description"];
  main_features: unknown;
} {
  const content = product.short_description?.content ?? "";
  return {
    product_id: product.id,
    plain_text: typeof content === "string" ? content : "",
    short_description: product.short_description,
    main_features: product.main_features ?? null,
  };
}

export function isItemNotFoundError(error: unknown): boolean {
  return error instanceof MercadoLibreError && error.isNotFound && error.path.startsWith("/items/");
}

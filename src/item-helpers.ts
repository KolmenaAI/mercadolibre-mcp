import type { CatalogProductPayload } from "./product-helpers.js";

export interface MarketplaceItemSummary {
  id: string;
  title?: string;
  price?: number;
  currency_id?: string;
  condition?: string;
  seller_id?: number;
  permalink?: string;
  available_quantity?: number;
  sold_quantity?: number;
  listing_type_id?: string;
  shipping?: {
    free_shipping?: boolean;
    mode?: string;
    logistic_type?: string;
  };
  sale_terms?: unknown;
  installments?: unknown;
  original_price?: number | null;
  catalog_product_id?: string | null;
  [key: string]: unknown;
}

export function extractBuyBoxItemId(product: CatalogProductPayload): string | null {
  const winner = product.buy_box_winner;
  if (typeof winner === "string" && winner.length > 0) {
    return winner;
  }
  if (winner && typeof winner === "object") {
    const record = winner as Record<string, unknown>;
    if (typeof record.item_id === "string") {
      return record.item_id;
    }
    if (typeof record.id === "string") {
      return record.id;
    }
  }
  return null;
}

export function itemPrice(item: MarketplaceItemSummary): number | null {
  if (typeof item.price === "number") {
    return item.price;
  }
  return null;
}

export function chunkIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

export function uniqueSellerIds(items: MarketplaceItemSummary[]): number[] {
  const ids = new Set<number>();
  for (const item of items) {
    if (typeof item.seller_id === "number") {
      ids.add(item.seller_id);
    }
  }
  return [...ids];
}

import type { MarketplaceItemSummary } from "./item-helpers.js";

export interface SitesSearchListing {
  id: string;
  title?: string;
  price?: number;
  currency_id?: string;
  seller_id?: number;
  permalink?: string;
  condition?: string;
  shipping?: MarketplaceItemSummary["shipping"];
  [key: string]: unknown;
}

export function extractSitesSearchListings(searchPayload: unknown): SitesSearchListing[] {
  if (!searchPayload || typeof searchPayload !== "object") {
    return [];
  }
  const root = searchPayload as Record<string, unknown>;
  const nested = root.result;
  const container =
    nested && typeof nested === "object" ? (nested as Record<string, unknown>) : root;
  const results = container.results;
  if (!Array.isArray(results)) {
    return [];
  }
  return results.filter(
    (entry): entry is SitesSearchListing =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as SitesSearchListing).id === "string"
  );
}

export function extractListingSellerId(listing: SitesSearchListing): number | null {
  if (typeof listing.seller_id === "number") {
    return listing.seller_id;
  }
  const seller = listing.seller;
  if (seller && typeof seller === "object") {
    const sellerId = (seller as Record<string, unknown>).id;
    if (typeof sellerId === "number") {
      return sellerId;
    }
  }
  return null;
}

export function dedupeListingsBySeller(listings: SitesSearchListing[]): SitesSearchListing[] {
  const bestBySeller = new Map<number, SitesSearchListing>();
  for (const listing of listings) {
    const sellerId = extractListingSellerId(listing);
    if (sellerId === null) {
      continue;
    }
    const existing = bestBySeller.get(sellerId);
    if (!existing) {
      bestBySeller.set(sellerId, listing);
      continue;
    }
    const existingPrice = typeof existing.price === "number" ? existing.price : Number.POSITIVE_INFINITY;
    const listingPrice = typeof listing.price === "number" ? listing.price : Number.POSITIVE_INFINITY;
    if (listingPrice < existingPrice) {
      bestBySeller.set(sellerId, listing);
    }
  }
  return [...bestBySeller.values()];
}

const REPUTATION_LEVEL_SCORE: Record<string, number> = {
  "5_green": 50,
  "4_light_green": 40,
  "3_yellow": 25,
  "2_orange": 10,
  "1_red": 0,
};

const POWER_SELLER_SCORE: Record<string, number> = {
  platinum: 20,
  gold: 15,
  silver: 10,
};

export function scoreSellerReputation(seller: Record<string, unknown>): number {
  let score = 0;
  const reputation = seller.seller_reputation;
  if (reputation && typeof reputation === "object") {
    const rep = reputation as Record<string, unknown>;
    const levelId = rep.level_id;
    if (typeof levelId === "string" && levelId in REPUTATION_LEVEL_SCORE) {
      score += REPUTATION_LEVEL_SCORE[levelId];
    }
    const transactions = rep.transactions;
    if (transactions && typeof transactions === "object") {
      const completed = (transactions as Record<string, unknown>).completed;
      if (typeof completed === "number") {
        score += Math.min(completed / 100, 20);
      }
    }
  }
  const powerSeller = seller.power_seller_status;
  if (typeof powerSeller === "string" && powerSeller in POWER_SELLER_SCORE) {
    score += POWER_SELLER_SCORE[powerSeller];
  }
  return score;
}

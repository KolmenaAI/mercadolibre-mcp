import { MercadoLibreClient } from "./client.js";
import { MercadoLibreError } from "./errors.js";
import type { MarketplaceItemSummary } from "./item-helpers.js";

export interface MeProfile {
  id: number;
  nickname?: string;
  site_id?: string;
  email?: string;
  seller_reputation?: unknown;
  transactions?: unknown;
  [key: string]: unknown;
}

export async function getMeProfile(client: MercadoLibreClient): Promise<MeProfile> {
  return client.get<MeProfile>("/users/me");
}

export async function resolveSellerId(
  client: MercadoLibreClient,
  sellerId?: number
): Promise<number> {
  if (sellerId !== undefined) {
    return sellerId;
  }
  const me = await getMeProfile(client);
  return me.id;
}

export async function assertMyItem(
  client: MercadoLibreClient,
  itemId: string,
  sellerId: number
): Promise<MarketplaceItemSummary> {
  const item = await client.get<MarketplaceItemSummary>(
    `/items/${encodeURIComponent(itemId.trim())}`
  );
  if (item.seller_id !== sellerId) {
    throw new MercadoLibreError(
      "GET",
      `/items/${itemId}`,
      403,
      JSON.stringify({
        message: "Item does not belong to the authenticated seller account",
        item_seller_id: item.seller_id,
        expected_seller_id: sellerId,
      })
    );
  }
  return item;
}

export interface MultigetEntry {
  code: number;
  body: MarketplaceItemSummary;
}

/** Normalize GET /items?ids= response (array of items or multiget envelopes). */
export function normalizeMultigetItems(raw: unknown): MarketplaceItemSummary[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const items: MarketplaceItemSummary[] = [];
  for (const entry of raw) {
    if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      if (record.code !== undefined && record.body && typeof record.body === "object") {
        if (record.code === 200) {
          items.push(record.body as MarketplaceItemSummary);
        }
      } else if (typeof record.id === "string") {
        items.push(entry as MarketplaceItemSummary);
      }
    }
  }
  return items;
}

export function defaultVisitsDateRange(): { date_from: string; date_to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    date_from: from.toISOString().slice(0, 10),
    date_to: to.toISOString().slice(0, 10),
  };
}

/** Mercado Libre promotions API: YYYY-MM-DDTHH:mm:ss with no timezone suffix. */
const PROMOTION_LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

function promotionDateOnlyToIso(year: number, month: number, day: number): string {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Invalid calendar date: ${year}-${month}-${day}`);
  }
  const probe = new Date(year, month - 1, day);
  if (
    probe.getFullYear() !== year ||
    probe.getMonth() !== month - 1 ||
    probe.getDate() !== day
  ) {
    throw new Error(`Invalid calendar date: ${year}-${month}-${day}`);
  }
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** Accept YYYY-MM-DD or DD-MM-YYYY (also / or . separators). Returns ISO date part only. */
export function parsePromotionDateInput(
  value: string,
  field: "start_date" | "finish_date"
): string | null {
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) {
    return promotionDateOnlyToIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  const dmy = /^(\d{2})[-/.](\d{2})[-/.](\d{4})$/.exec(trimmed);
  if (dmy) {
    return promotionDateOnlyToIso(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  }
  if (/^\d{2}[-/.]\d{2}[-/.]\d{4}T/.test(trimmed)) {
    throw new Error(
      `${field}: use a date only (28-05-2026 or 2026-05-28); time is set automatically`
    );
  }
  return null;
}

function applyPromotionDayBoundary(isoDate: string, field: "start_date" | "finish_date"): string {
  return field === "finish_date" ? `${isoDate}T23:59:59` : `${isoDate}T00:00:00`;
}

export function normalizePromotionLocalDate(
  value: unknown,
  field: "start_date" | "finish_date"
): string {
  if (typeof value === "number") {
    throw new Error(
      `${field} must be a date string like 2026-05-28 or 28-05-2026 (not a Unix timestamp)`
    );
  }
  if (typeof value !== "string") {
    throw new Error(
      `${field} is required (YYYY-MM-DD or DD-MM-YYYY; time is added automatically for the API)`
    );
  }

  let normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${field} cannot be empty`);
  }

  const dateOnly = parsePromotionDateInput(normalized, field);
  if (dateOnly) {
    return applyPromotionDayBoundary(dateOnly, field);
  }

  if (normalized.endsWith("Z")) {
    normalized = normalized.slice(0, -1);
  }

  normalized = normalized.replace(/([+-]\d{2}:\d{2})$/, "");

  if (normalized.includes(".")) {
    normalized = normalized.split(".")[0] ?? normalized;
  }

  const datePart = normalized.includes("T") ? (normalized.split("T")[0] ?? normalized) : normalized;
  const timePart = normalized.includes("T") ? normalized.split("T")[1] : undefined;
  const isoFromDatePart = parsePromotionDateInput(datePart, field);
  if (isoFromDatePart && timePart === undefined) {
    return applyPromotionDayBoundary(isoFromDatePart, field);
  }
  if (isoFromDatePart && timePart !== undefined) {
    const timeMatch = /^(\d{2}):(\d{2}):(\d{2})$/.exec(timePart);
    if (timeMatch) {
      normalized = `${isoFromDatePart}T${timePart}`;
    }
  }

  if (!PROMOTION_LOCAL_DATETIME_RE.test(normalized)) {
    throw new Error(
      `${field}: use YYYY-MM-DD or DD-MM-YYYY (e.g. 2026-05-28 or 28-05-2026). ` +
        `Optional full time YYYY-MM-DDTHH:mm:ss without Z. Got: ${value}`
    );
  }

  return normalized;
}

export function isTestUserProfile(me: MeProfile): boolean {
  const tags = me.tags;
  return Array.isArray(tags) && tags.some((tag) => tag === "test_user");
}

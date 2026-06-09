import type {
  MercadoLibreCreateItemBody,
  MercadoLibreListingAttribute,
  MercadoLibreListingPictureRef,
} from "./listing-types.js";
import type {
  SellerCreateListingParams,
  SellerValidateListingParams,
} from "./seller-schemas.js";

const DEFAULT_BUYING_MODE = "buy_it_now";
const DEFAULT_LISTING_TYPE = "gold_special";
const DEFAULT_CONDITION = "new";
const DEFAULT_QUANTITY = 1;

export function normalizeListingAttributes(
  attributes: SellerCreateListingParams["attributes"]
): MercadoLibreListingAttribute[] | undefined {
  if (!attributes || attributes.length === 0) {
    return undefined;
  }
  return attributes.map((attr) => {
    const row: MercadoLibreListingAttribute = { id: attr.id };
    if (attr.value_id !== undefined) {
      row.value_id = attr.value_id;
    }
    if (attr.value_name !== undefined) {
      row.value_name = attr.value_name;
    }
    return row;
  });
}

export function buildListingPictures(
  pictureSources?: string[],
  pictureIds?: string[]
): MercadoLibreListingPictureRef[] | undefined {
  const pictures: MercadoLibreListingPictureRef[] = [];
  if (pictureIds) {
    for (const id of pictureIds) {
      const trimmed = id.trim();
      if (trimmed) {
        pictures.push({ id: trimmed });
      }
    }
  }
  if (pictureSources) {
    for (const source of pictureSources) {
      const trimmed = source.trim();
      if (trimmed) {
        pictures.push({ source: trimmed });
      }
    }
  }
  return pictures.length > 0 ? pictures : undefined;
}

/** Existing picture ids on an item (from GET /items/{id}.pictures). */
export function extractItemPictureRefs(
  item: Record<string, unknown>
): MercadoLibreListingPictureRef[] {
  const raw = item.pictures;
  if (!Array.isArray(raw)) {
    return [];
  }
  const refs: MercadoLibreListingPictureRef[] = [];
  for (const row of raw) {
    if (row === null || typeof row !== "object") {
      continue;
    }
    const pic = row as Record<string, unknown>;
    if (typeof pic.id === "string" && pic.id.trim() !== "") {
      refs.push({ id: pic.id.trim() });
    }
  }
  return refs;
}

/** Append new picture ids/sources to existing refs (dedupe by id). */
export function mergeListingPictures(
  existing: MercadoLibreListingPictureRef[],
  pictureSources?: string[],
  pictureIds?: string[]
): MercadoLibreListingPictureRef[] {
  const merged: MercadoLibreListingPictureRef[] = [...existing];
  const seenIds = new Set(
    existing.map((pic) => pic.id).filter((id): id is string => typeof id === "string")
  );

  if (pictureIds) {
    for (const id of pictureIds) {
      const trimmed = id.trim();
      if (trimmed !== "" && !seenIds.has(trimmed)) {
        merged.push({ id: trimmed });
        seenIds.add(trimmed);
      }
    }
  }
  if (pictureSources) {
    for (const source of pictureSources) {
      const trimmed = source.trim();
      if (trimmed !== "") {
        merged.push({ source: trimmed });
      }
    }
  }
  return merged;
}

export function buildCreateItemBody(
  params: SellerCreateListingParams | SellerValidateListingParams
): MercadoLibreCreateItemBody {
  const pictures = buildListingPictures(params.picture_sources, params.picture_ids);
  const attributes = normalizeListingAttributes(params.attributes);
  const saleTerms = normalizeListingAttributes(params.sale_terms);

  const body: MercadoLibreCreateItemBody = {
    title: params.title.trim(),
    category_id: params.category_id.trim(),
    price: params.price,
    currency_id: params.currency_id.trim().toUpperCase(),
    available_quantity: params.available_quantity ?? DEFAULT_QUANTITY,
    buying_mode: params.buying_mode ?? DEFAULT_BUYING_MODE,
    listing_type_id: params.listing_type_id ?? DEFAULT_LISTING_TYPE,
    condition: params.condition ?? DEFAULT_CONDITION,
  };

  if (params.description !== undefined && params.description.trim() !== "") {
    body.description = params.description.trim();
  }
  if (pictures) {
    body.pictures = pictures;
  }
  if (attributes) {
    body.attributes = attributes;
  }
  if (saleTerms) {
    body.sale_terms = saleTerms;
  }

  return body;
}

export interface MercadoLibreValidationCause {
  department?: string;
  cause_id?: number;
  type?: string;
  code?: string;
  references?: string[];
  message?: string;
}

export interface ParsedListingValidation {
  valid: boolean;
  http_status: number;
  errors: MercadoLibreValidationCause[];
  warnings: MercadoLibreValidationCause[];
  summary: string;
}

export function parseListingValidationResponse(
  status: number,
  body: unknown
): ParsedListingValidation {
  if (status === 204) {
    return {
      valid: true,
      http_status: 204,
      errors: [],
      warnings: [],
      summary: "Validation passed (204).",
    };
  }

  const record =
    body !== null && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const rawCauses = record.cause;
  const causes: MercadoLibreValidationCause[] = Array.isArray(rawCauses)
    ? rawCauses.filter(
        (row): row is MercadoLibreValidationCause =>
          row !== null && typeof row === "object" && !Array.isArray(row)
      )
    : [];

  const errors = causes.filter((row) => row.type === "error");
  const warnings = causes.filter((row) => row.type === "warning");
  const valid = errors.length === 0;

  const lines: string[] = [];
  if (errors.length > 0) {
    lines.push(`${errors.length} blocking error(s):`);
    for (const row of errors) {
      lines.push(`- [${row.code ?? "error"}] ${row.message ?? "unknown"}`);
    }
  }
  if (warnings.length > 0) {
    lines.push(`${warnings.length} warning(s) (may still publish):`);
    for (const row of warnings) {
      lines.push(`- [${row.code ?? "warning"}] ${row.message ?? "unknown"}`);
    }
  }
  if (lines.length === 0 && typeof record.message === "string") {
    lines.push(record.message);
  }

  return {
    valid,
    http_status: status,
    errors,
    warnings,
    summary: lines.join("\n"),
  };
}

export interface CategoryAttributeDefinition {
  id: string;
  name?: string;
  value_type?: string;
  tags?: Record<string, boolean>;
  values?: Array<{ id?: string; name?: string }>;
  hint?: string;
}

export function summarizeCategoryListingRequirements(
  categoryId: string,
  attributes: CategoryAttributeDefinition[]
): {
  category_id: string;
  required_for_listing: CategoryAttributeDefinition[];
  catalog_recommended: CategoryAttributeDefinition[];
  listing_checklist: string[];
} {
  const requiredForListing = attributes.filter(
    (attr) =>
      attr.tags?.required === true ||
      attr.tags?.catalog_required === true ||
      attr.tags?.conditional_required === true
  );

  const catalogRecommended = attributes.filter(
    (attr) =>
      !requiredForListing.some((req) => req.id === attr.id) &&
      (attr.tags?.catalog_required === true || attr.id === "GTIN" || attr.id === "RAM")
  );

  const requiredIds = requiredForListing.map((attr) => attr.id).join(", ") || "(none tagged)";

  return {
    category_id: categoryId,
    required_for_listing: requiredForListing.map((attr) => ({
      ...attr,
      hint: attributeFillHint(attr),
    })),
    catalog_recommended: catalogRecommended.slice(0, 15).map((attr) => ({
      ...attr,
      hint: attributeFillHint(attr),
    })),
    listing_checklist: [
      "1. seller_get_me → site_id and currency (MLA → ARS unless seller confirms USD).",
      "2. get_domain_discovery { query, site_id } → pick category_id.",
      `3. seller_get_listing_requirements { category_id } → fill every required attribute (${requiredIds}).`,
      "4. At least one picture: seller_upload_listing_picture → picture_ids, and/or picture_sources (public HTTPS URL).",
      "5. listing_type_id defaults to gold_special — pictures are mandatory for that type.",
      "6. seller_validate_listing with the full payload → fix all type:error causes before create.",
      "7. seller_create_listing — same JSON as validate, only after seller approval.",
    ],
  };
}

function attributeFillHint(attr: CategoryAttributeDefinition): string {
  const values = attr.values ?? [];
  if (values.length > 0) {
    const sample = values
      .slice(0, 3)
      .map((v) => `${v.id ?? "?"}=${v.name ?? "?"}`)
      .join(", ");
    return `Use value_id + value_name from allowed values (e.g. ${sample}).`;
  }
  if (attr.value_type === "boolean") {
    return 'Use value_id "242085" (Sí) or "242084" (No) with matching value_name.';
  }
  if (attr.id === "GTIN") {
    return "EAN/UPC string, or use EMPTY_GTIN_REASON if no barcode (category rules apply).";
  }
  return "Use value_name (free text) or value_id when the API lists values.";
}

export function guessImageFilename(imageUrl: string, contentType: string | null): string {
  try {
    const pathname = new URL(imageUrl).pathname;
    const base = pathname.split("/").pop();
    if (base && base.includes(".")) {
      return base;
    }
  } catch {
    // ignore invalid URL for filename guess
  }
  if (contentType?.includes("png")) {
    return "listing.png";
  }
  if (contentType?.includes("webp")) {
    return "listing.webp";
  }
  if (contentType?.includes("gif")) {
    return "listing.gif";
  }
  return "listing.jpg";
}

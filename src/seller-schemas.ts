export interface SellerListMyItemsParams {
  seller_id?: number;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface SellerGetMyItemParams {
  item_id: string;
  seller_id?: number;
}

export interface SellerGetMyItemsBulkParams {
  item_ids: string[];
  seller_id?: number;
}

export interface SellerGetMyItemDescriptionParams {
  item_id: string;
  seller_id?: number;
}

export interface SellerSearchOrdersParams {
  seller_id?: number;
  status?: string;
  sort?: string;
  limit?: number;
  offset?: number;
  q?: string;
}

export interface SellerGetOrderParams {
  order_id: number;
  seller_id?: number;
}

export interface SellerGetOrderShipmentsParams {
  order_id: number;
}

export interface SellerGetShipmentParams {
  shipment_id: number;
}

export interface SellerGetStoreSnapshotParams {
  seller_id?: number;
  orders_limit?: number;
  low_stock_threshold?: number;
}

export interface SellerInventoryReportParams {
  seller_id?: number;
  low_stock_threshold?: number;
  dead_stock_days?: number;
  item_scan_limit?: number;
}

export interface SellerGetListingHealthParams {
  item_id: string;
  seller_id?: number;
}

export interface SellerGetItemVisitsParams {
  item_id: string;
  date_from?: string;
  date_to?: string;
  seller_id?: number;
}

export interface SellerListUnansweredQuestionsParams {
  seller_id?: number;
  limit?: number;
  offset?: number;
}

export interface SellerListMyItemQuestionsParams {
  item_id: string;
  limit?: number;
  offset?: number;
}

export interface SellerGetQuestionParams {
  question_id: number;
}

export interface SellerAnswerQuestionParams {
  question_id: number;
  text: string;
}

export interface SellerAuditListingsParams {
  seller_id?: number;
  item_scan_limit?: number;
}

export interface SellerListPromotionsParams {
  seller_id?: number;
  status?: string;
  limit?: number;
}

export interface SellerGetPromotionParams {
  promotion_id: string;
  promotion_type?: string;
}

export interface SellerGetItemPriceToWinParams {
  item_id: string;
  seller_id?: number;
}

export interface SellerListPerformanceRankingsParams {
  seller_id?: number;
  item_scan_limit?: number;
  sort_by?: "visits" | "sold_quantity" | "available_quantity";
}

export interface SellerListOrdersByStatusParams {
  seller_id?: number;
  status: string;
  limit?: number;
  offset?: number;
}

export interface SellerFindShippingExceptionsParams {
  seller_id?: number;
  orders_limit?: number;
}

export interface SellerListPendingShipmentsParams {
  seller_id?: number;
  limit?: number;
}

export interface SellerListMessagePacksParams {
  seller_id?: number;
  limit?: number;
}

export interface SellerGetPackMessagesParams {
  pack_id: string;
  seller_id?: number;
}

export interface SellerItemVariationSummary {
  id: number;
  user_product_id?: string;
  available_quantity?: number;
  price?: number;
}

export interface SellerUpdateMyItemParams {
  item_id: string;
  price?: number;
  available_quantity?: number;
  status?: string;
  /** Required when the item has 2+ variations; auto-selected when there is only one */
  variation_id?: number;
  seller_id?: number;
}

export interface SellerUpdateMyItemDescriptionParams {
  item_id: string;
  plain_text: string;
  seller_id?: number;
}

export interface SellerAddListingPicturesParams {
  item_id: string;
  /** New picture ids from seller_upload_listing_picture (appended to existing by default). */
  picture_ids?: string[];
  /** Optional public HTTPS URLs added as { source } (appended to existing by default). */
  picture_sources?: string[];
  /** When true, replace the full pictures array instead of appending. */
  replace_pictures?: boolean;
  seller_id?: number;
}

export interface SellerCreateCatalogListingParams {
  /** Traditional marketplace item to opt in from. */
  item_id: string;
  /** Catalog product id (e.g. MLA27172665 from get_product or item.catalog_product_id). */
  catalog_product_id: string;
  /** Required when item_id has multiple variations — one catalog listing per variation. */
  variation_id?: number;
  seller_id?: number;
}

export interface SellerGetOrderDiscountsParams {
  order_id: number;
}

export interface SellerSearchClaimsParams {
  seller_id?: number;
  status?: string;
  stage?: string;
  order_id?: number;
  limit?: number;
  offset?: number;
}

export interface SellerGetClaimParams {
  claim_id: number;
}

export interface SellerGetClaimReturnsParams {
  claim_id: number;
}

export interface SellerSubmitClaimActionParams {
  claim_id: number;
  action: string;
  payload?: Record<string, string | number | boolean>;
}

export interface SellerListFeedbackParams {
  seller_id?: number;
  limit?: number;
  offset?: number;
}

export interface SellerReplyFeedbackParams {
  feedback_id: number;
  reply: string;
}

export interface SellerCreatePromotionDraftParams {
  seller_id?: number;
  name: string;
  /** e.g. SELLER_CAMPAIGN (default) or SELLER_COUPON_CAMPAIGN */
  promotion_type?: string;
  /** e.g. FLEXIBLE_PERCENTAGE for SELLER_CAMPAIGN; FIXED_AMOUNT / FIXED_PERCENTAGE for coupons */
  sub_type?: string;
  /** YYYY-MM-DD or DD-MM-YYYY; expanded to API local datetime automatically */
  start_date?: string;
  /** YYYY-MM-DD or DD-MM-YYYY; expanded to API local datetime automatically */
  finish_date?: string;
  /** Adds version=test for test_user accounts (default: auto-detect from /users/me) */
  use_test_promotions?: boolean;
  raw_body?: Record<string, unknown>;
}

export interface SellerListingAttributeInput {
  id: string;
  value_id?: string;
  value_name?: string;
}

export interface SellerGetListingRequirementsParams {
  category_id: string;
}

export interface SellerValidateListingParams {
  title: string;
  category_id: string;
  price: number;
  currency_id: string;
  available_quantity?: number;
  buying_mode?: string;
  listing_type_id?: string;
  condition?: string;
  description?: string;
  picture_sources?: string[];
  picture_ids?: string[];
  attributes?: SellerListingAttributeInput[];
  sale_terms?: SellerListingAttributeInput[];
}

export interface SellerCreateListingParams extends SellerValidateListingParams {
  /** If set, PUT /items/{id}/description after create (when description not in POST body). */
  plain_text_description?: string;
}

export interface SellerUploadListingPictureParams {
  /** Public HTTP(S) URL of the image to download and upload to Mercado Libre. */
  image_url: string;
}

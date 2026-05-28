export interface GetProductBuyboxParams {
  product_id: string;
}

export interface GetItemsBulkParams {
  item_ids: string[];
}

export interface GetItemReviewsParams {
  item_id: string;
  catalog_product_id?: string;
}

export interface GetItemShippingOptionsParams {
  item_id: string;
  zip_code?: string;
}

export interface GetCategoryAttributesParams {
  category_id: string;
}

export interface GetDomainDiscoveryParams {
  query: string;
  site_id?: string;
  limit?: number;
}

export interface SearchListingsBySellerParams {
  seller_id: number;
  site_id?: string;
  limit?: number;
  offset?: number;
}

export interface GetOfficialStoreParams {
  store_id: number;
}

export interface GetProductListingsParams {
  product_id: string;
  limit?: number;
  offset?: number;
}

export interface GetSellerResponseTimeParams {
  seller_id: number;
}

export interface GetItemQuestionsParams {
  item_id: string;
  limit?: number;
  offset?: number;
}

export interface AskSellerQuestionParams {
  item_id: string;
  text: string;
}

export interface GetQuestionParams {
  question_id: number;
}

export interface GetItemSaleTermsParams {
  item_id: string;
}

export interface GetMeParams {
  // token-only
}

export interface GetMyOrdersParams {
  buyer_id?: number;
  status?: string;
  limit?: number;
  offset?: number;
  q?: string;
}

export interface GetOrderParams {
  order_id: number;
}

export interface GetOrderShipmentsParams {
  order_id: number;
}

export interface GetShipmentParams {
  shipment_id: number;
}

export interface GetOrderDiscountsParams {
  order_id: number;
}

export interface GetOrderFeedbackParams {
  order_id: number;
}

export interface SearchMyClaimsParams {
  stage?: string;
  status?: string;
  order_id?: number;
  limit?: number;
  offset?: number;
}

export interface GetClaimParams {
  claim_id: number;
}

export interface GetClaimReturnsParams {
  claim_id: number;
}

export interface CompareProductsParams {
  item_ids?: string[];
  product_ids?: string[];
  include_reviews?: boolean;
  include_shipping?: boolean;
  zip_code?: string;
}

export interface SearchBuyableListingsParams {
  query: string;
  site_id?: string;
  domain_id?: string;
  price_max?: number;
  price_min?: number;
  catalog_limit?: number;
  include_seller_ratings?: boolean;
}

export interface SearchListingsParams {
  query: string;
  site_id?: string;
  price_max?: number;
  price_min?: number;
  limit?: number;
  offset?: number;
}

export interface SearchItemsParams {
  query: string;
  site_id?: string;
  category?: string;
  price_min?: number;
  price_max?: number;
  limit?: number;
  offset?: number;
}

export interface GetItemParams {
  /** Marketplace listing id (MLA…) or catalog product id from search_items — auto-resolves on 404. */
  item_id: string;
}

export interface GetProductParams {
  product_id: string;
}

export interface GetItemDescriptionParams {
  item_id: string;
}

export interface GetCategoriesParams {
  site_id?: string;
}

export interface GetCategoryParams {
  category_id: string;
}

export interface GetSellerInfoParams {
  seller_id: number;
}

export interface GetTrendsParams {
  site_id?: string;
}

export interface GetCurrencyConversionParams {
  from: string;
  to: string;
  amount?: number;
}

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
  item_id: string;
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

export interface SearchItemsParams {
  query: string;
  site_id?: string;
  category?: string;
  price_min?: number;
  price_max?: number;
  limit?: number;
  offset?: number;
  /**
   * Also attach live web offers (title + price + seller) scraped from ML
   * search, since /products/search returns price-less catalog ids. Returned
   * under `web_offers` when a scraper token is configured.
   */
  include_web_prices?: boolean;
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
  /** Site id (e.g. MLA) for the storefront-catalog scrape country. Defaults MLA. */
  site_id?: string;
  /**
   * Also scrape the seller storefront for their live catalog + reputation
   * (returned under `web_storefront`). Best-effort; default false.
   */
  include_catalog?: boolean;
}

export interface GetTrendsParams {
  site_id?: string;
}

export interface GetCurrencyConversionParams {
  from: string;
  to: string;
  amount?: number;
}

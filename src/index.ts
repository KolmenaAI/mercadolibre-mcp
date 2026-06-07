import { MercadoLibreClient } from "./client.js";
import {
  searchItems,
  getProduct,
  getItem,
  getItemDescription,
  getCategories,
  getCategory,
  getSellerInfo,
  getTrends,
  getCurrencyConversion,
} from "./actions.js";
import {
  getProductBuybox,
  getItemsBulk,
  getItemReviews,
  getItemShippingOptions,
  getCategoryAttributes,
  getDomainDiscovery,
  searchListingsBySeller,
  getOfficialStore,
  getProductListings,
  getSellerResponseTime,
  getItemQuestions,
  askSellerQuestion,
  getQuestion,
  getItemSaleTerms,
  getMe,
  getMyOrders,
  getOrder,
  getOrderShipments,
  getShipment,
  getOrderDiscounts,
  getOrderFeedback,
  searchMyClaims,
  getClaim,
  getClaimReturns,
  compareProducts,
  findOffersForProductQuery,
  rankSellersForQuery,
  searchBuyableListings,
  searchListings,
} from "./buyer-actions.js";
import {
  sellerGetMe,
  sellerListMyItems,
  sellerGetMyItem,
  sellerGetMyItemsBulk,
  sellerGetMyItemDescription,
  sellerSearchOrders,
  sellerGetOrder,
  sellerGetOrderShipments,
  sellerGetShipment,
  sellerGetOrderDiscounts,
  sellerGetStoreSnapshot,
  sellerInventoryReport,
  sellerGetListingHealth,
  sellerGetItemVisits,
  sellerListUnansweredQuestions,
  sellerListMyItemQuestions,
  sellerGetQuestion,
  sellerAnswerQuestion,
  sellerAuditListings,
  sellerListPromotions,
  sellerGetPromotion,
  sellerGetItemPriceToWin,
  sellerListPerformanceRankings,
  sellerListOrdersByStatus,
  sellerFindShippingExceptions,
  sellerListPendingShipments,
  sellerListMessagePacks,
  sellerGetPackMessages,
  sellerUpdateMyItem,
  sellerUpdateMyItemDescription,
  sellerSearchClaims,
  sellerGetClaim,
  sellerGetClaimReturns,
  sellerSubmitClaimAction,
  sellerListFeedback,
  sellerReplyFeedback,
  sellerCreatePromotionDraft,
  sellerUploadListingPicture,
  sellerGetListingRequirements,
  sellerValidateListing,
  sellerCreateListing,
} from "./seller-actions.js";
import type {
  SearchItemsParams,
  GetItemParams,
  GetProductParams,
  GetItemDescriptionParams,
  GetCategoriesParams,
  GetCategoryParams,
  GetSellerInfoParams,
  GetTrendsParams,
  GetCurrencyConversionParams,
} from "./schemas.js";
import type {
  GetProductBuyboxParams,
  GetItemsBulkParams,
  GetItemReviewsParams,
  GetItemShippingOptionsParams,
  GetCategoryAttributesParams,
  GetDomainDiscoveryParams,
  SearchListingsBySellerParams,
  GetOfficialStoreParams,
  GetProductListingsParams,
  GetSellerResponseTimeParams,
  GetItemQuestionsParams,
  AskSellerQuestionParams,
  GetQuestionParams,
  GetItemSaleTermsParams,
  GetMyOrdersParams,
  GetOrderParams,
  GetOrderShipmentsParams,
  GetShipmentParams,
  GetOrderDiscountsParams,
  GetOrderFeedbackParams,
  SearchMyClaimsParams,
  GetClaimParams,
  GetClaimReturnsParams,
  CompareProductsParams,
  FindOffersForProductQueryParams,
  RankSellersForQueryParams,
  SearchBuyableListingsParams,
  SearchListingsParams,
} from "./buyer-schemas.js";
import type {
  SellerListMyItemsParams,
  SellerGetMyItemParams,
  SellerGetMyItemsBulkParams,
  SellerGetMyItemDescriptionParams,
  SellerSearchOrdersParams,
  SellerGetOrderParams,
  SellerGetOrderShipmentsParams,
  SellerGetShipmentParams,
  SellerGetOrderDiscountsParams,
  SellerGetStoreSnapshotParams,
  SellerInventoryReportParams,
  SellerGetListingHealthParams,
  SellerGetItemVisitsParams,
  SellerListUnansweredQuestionsParams,
  SellerListMyItemQuestionsParams,
  SellerGetQuestionParams,
  SellerAnswerQuestionParams,
  SellerAuditListingsParams,
  SellerListPromotionsParams,
  SellerGetPromotionParams,
  SellerGetItemPriceToWinParams,
  SellerListPerformanceRankingsParams,
  SellerListOrdersByStatusParams,
  SellerFindShippingExceptionsParams,
  SellerListPendingShipmentsParams,
  SellerListMessagePacksParams,
  SellerGetPackMessagesParams,
  SellerUpdateMyItemParams,
  SellerUpdateMyItemDescriptionParams,
  SellerSearchClaimsParams,
  SellerGetClaimParams,
  SellerGetClaimReturnsParams,
  SellerSubmitClaimActionParams,
  SellerListFeedbackParams,
  SellerReplyFeedbackParams,
  SellerCreatePromotionDraftParams,
  SellerUploadListingPictureParams,
  SellerGetListingRequirementsParams,
  SellerValidateListingParams,
  SellerCreateListingParams,
} from "./seller-schemas.js";

export function createMercadoLibreTools(accessToken?: string) {
  const client = new MercadoLibreClient(accessToken);

  return {
    tools: {
      search_items: (params: SearchItemsParams) => searchItems(client, params),
      find_offers_for_product_query: (params: FindOffersForProductQueryParams) =>
        findOffersForProductQuery(client, params),
      rank_sellers_for_query: (params: RankSellersForQueryParams) =>
        rankSellersForQuery(client, params),
      search_buyable_listings: (params: SearchBuyableListingsParams) =>
        searchBuyableListings(client, params),
      search_listings: (params: SearchListingsParams) => searchListings(client, params),
      search_listings_by_seller: (params: SearchListingsBySellerParams) =>
        searchListingsBySeller(client, params),
      get_product: (params: GetProductParams) => getProduct(client, params),
      get_product_buybox: (params: GetProductBuyboxParams) => getProductBuybox(client, params),
      get_product_listings: (params: GetProductListingsParams) =>
        getProductListings(client, params),
      get_item: (params: GetItemParams) => getItem(client, params),
      get_items_bulk: (params: GetItemsBulkParams) => getItemsBulk(client, params),
      compare_products: (params: CompareProductsParams) => compareProducts(client, params),
      get_item_description: (params: GetItemDescriptionParams) =>
        getItemDescription(client, params),
      get_item_reviews: (params: GetItemReviewsParams) => getItemReviews(client, params),
      get_item_shipping_options: (params: GetItemShippingOptionsParams) =>
        getItemShippingOptions(client, params),
      get_item_sale_terms: (params: GetItemSaleTermsParams) => getItemSaleTerms(client, params),
      get_categories: (params?: GetCategoriesParams) => getCategories(client, params),
      get_category: (params: GetCategoryParams) => getCategory(client, params),
      get_category_attributes: (params: GetCategoryAttributesParams) =>
        getCategoryAttributes(client, params),
      get_domain_discovery: (params: GetDomainDiscoveryParams) =>
        getDomainDiscovery(client, params),
      get_seller_info: (params: GetSellerInfoParams) => getSellerInfo(client, params),
      get_seller_response_time: (params: GetSellerResponseTimeParams) =>
        getSellerResponseTime(client, params),
      get_official_store: (params: GetOfficialStoreParams) => getOfficialStore(client, params),
      get_item_questions: (params: GetItemQuestionsParams) => getItemQuestions(client, params),
      ask_seller_question: (params: AskSellerQuestionParams) => askSellerQuestion(client, params),
      get_question: (params: GetQuestionParams) => getQuestion(client, params),
      get_trends: (params?: GetTrendsParams) => getTrends(client, params),
      get_currency_conversion: (params: GetCurrencyConversionParams) =>
        getCurrencyConversion(client, params),
      get_me: () => getMe(client),
      get_my_orders: (params: GetMyOrdersParams) => getMyOrders(client, params),
      get_order: (params: GetOrderParams) => getOrder(client, params),
      get_order_shipments: (params: GetOrderShipmentsParams) =>
        getOrderShipments(client, params),
      get_shipment: (params: GetShipmentParams) => getShipment(client, params),
      get_order_discounts: (params: GetOrderDiscountsParams) =>
        getOrderDiscounts(client, params),
      get_order_feedback: (params: GetOrderFeedbackParams) =>
        getOrderFeedback(client, params),
      search_my_claims: (params: SearchMyClaimsParams) => searchMyClaims(client, params),
      get_claim: (params: GetClaimParams) => getClaim(client, params),
      get_claim_returns: (params: GetClaimReturnsParams) => getClaimReturns(client, params),
      seller_get_me: () => sellerGetMe(client),
      seller_list_my_items: (params: SellerListMyItemsParams) =>
        sellerListMyItems(client, params),
      seller_get_my_item: (params: SellerGetMyItemParams) =>
        sellerGetMyItem(client, params),
      seller_get_my_items_bulk: (params: SellerGetMyItemsBulkParams) =>
        sellerGetMyItemsBulk(client, params),
      seller_get_my_item_description: (params: SellerGetMyItemDescriptionParams) =>
        sellerGetMyItemDescription(client, params),
      seller_search_orders: (params: SellerSearchOrdersParams) =>
        sellerSearchOrders(client, params),
      seller_get_order: (params: SellerGetOrderParams) => sellerGetOrder(client, params),
      seller_get_order_shipments: (params: SellerGetOrderShipmentsParams) =>
        sellerGetOrderShipments(client, params),
      seller_get_shipment: (params: SellerGetShipmentParams) =>
        sellerGetShipment(client, params),
      seller_get_order_discounts: (params: SellerGetOrderDiscountsParams) =>
        sellerGetOrderDiscounts(client, params),
      seller_get_store_snapshot: (params: SellerGetStoreSnapshotParams) =>
        sellerGetStoreSnapshot(client, params),
      seller_inventory_report: (params: SellerInventoryReportParams) =>
        sellerInventoryReport(client, params),
      seller_get_listing_health: (params: SellerGetListingHealthParams) =>
        sellerGetListingHealth(client, params),
      seller_get_item_visits: (params: SellerGetItemVisitsParams) =>
        sellerGetItemVisits(client, params),
      seller_list_unanswered_questions: (params: SellerListUnansweredQuestionsParams) =>
        sellerListUnansweredQuestions(client, params),
      seller_list_my_item_questions: (params: SellerListMyItemQuestionsParams) =>
        sellerListMyItemQuestions(client, params),
      seller_get_question: (params: SellerGetQuestionParams) =>
        sellerGetQuestion(client, params),
      seller_answer_question: (params: SellerAnswerQuestionParams) =>
        sellerAnswerQuestion(client, params),
      seller_audit_listings: (params: SellerAuditListingsParams) =>
        sellerAuditListings(client, params),
      seller_list_promotions: (params: SellerListPromotionsParams) =>
        sellerListPromotions(client, params),
      seller_get_promotion: (params: SellerGetPromotionParams) =>
        sellerGetPromotion(client, params),
      seller_get_item_price_to_win: (params: SellerGetItemPriceToWinParams) =>
        sellerGetItemPriceToWin(client, params),
      seller_list_performance_rankings: (params: SellerListPerformanceRankingsParams) =>
        sellerListPerformanceRankings(client, params),
      seller_list_orders_by_status: (params: SellerListOrdersByStatusParams) =>
        sellerListOrdersByStatus(client, params),
      seller_find_shipping_exceptions: (params: SellerFindShippingExceptionsParams) =>
        sellerFindShippingExceptions(client, params),
      seller_list_pending_shipments: (params: SellerListPendingShipmentsParams) =>
        sellerListPendingShipments(client, params),
      seller_list_message_packs: (params: SellerListMessagePacksParams) =>
        sellerListMessagePacks(client, params),
      seller_get_pack_messages: (params: SellerGetPackMessagesParams) =>
        sellerGetPackMessages(client, params),
      seller_update_my_item: (params: SellerUpdateMyItemParams) =>
        sellerUpdateMyItem(client, params),
      seller_update_my_item_description: (params: SellerUpdateMyItemDescriptionParams) =>
        sellerUpdateMyItemDescription(client, params),
      seller_search_claims: (params: SellerSearchClaimsParams) =>
        sellerSearchClaims(client, params),
      seller_get_claim: (params: SellerGetClaimParams) => sellerGetClaim(client, params),
      seller_get_claim_returns: (params: SellerGetClaimReturnsParams) =>
        sellerGetClaimReturns(client, params),
      seller_submit_claim_action: (params: SellerSubmitClaimActionParams) =>
        sellerSubmitClaimAction(client, params),
      seller_list_feedback: (params: SellerListFeedbackParams) =>
        sellerListFeedback(client, params),
      seller_reply_feedback: (params: SellerReplyFeedbackParams) =>
        sellerReplyFeedback(client, params),
      seller_create_promotion_draft: (params: SellerCreatePromotionDraftParams) =>
        sellerCreatePromotionDraft(client, params),
      seller_upload_listing_picture: (params: SellerUploadListingPictureParams) =>
        sellerUploadListingPicture(client, params),
      seller_get_listing_requirements: (params: SellerGetListingRequirementsParams) =>
        sellerGetListingRequirements(client, params),
      seller_validate_listing: (params: SellerValidateListingParams) =>
        sellerValidateListing(client, params),
      seller_create_listing: (params: SellerCreateListingParams) =>
        sellerCreateListing(client, params),
    },
  };
}

export { MercadoLibreClient } from "./client.js";
export { MercadoLibreError } from "./errors.js";
export * from "./actions.js";
export * from "./buyer-actions.js";
export * from "./seller-actions.js";
export type * from "./schemas.js";
export type * from "./buyer-schemas.js";
export type * from "./seller-schemas.js";

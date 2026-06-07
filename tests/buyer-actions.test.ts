import { describe, it, expect, vi, beforeEach } from "vitest";
import { MercadoLibreClient } from "../src/client.js";
import {
  getProductBuybox,
  getItemsBulk,
  getItemReviews,
  findOffersForProductQuery,
  searchBuyableListings,
  rankSellersForQuery,
  searchListings,
  compareProducts,
  askSellerQuestion,
  getMyOrders,
  searchMyClaims,
} from "../src/buyer-actions.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("buyer-actions", () => {
  let client: MercadoLibreClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new MercadoLibreClient("TOKEN");
  });

  describe("getProductBuybox", () => {
    it("extracts buy box item id from product", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          id: "MLA55016525",
          name: "iPhone",
          buy_box_winner: { item_id: "MLA903218023" },
          buy_box_winner_price_range: { min: 100, max: 120 },
        })
      );

      const result = await getProductBuybox(client, { product_id: "MLA55016525" });
      expect(result).toMatchObject({
        product_id: "MLA55016525",
        buy_box_winner_item_id: "MLA903218023",
      });
    });
  });

  describe("getItemsBulk", () => {
    it("calls multiget with comma-separated ids", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse([
          { id: "MLA1", price: 100 },
          { id: "MLA2", price: 200 },
        ])
      );

      const result = await getItemsBulk(client, { item_ids: ["MLA1", "MLA2"] });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/items?ids=MLA1%2CMLA2");
      expect((result as { items: unknown[] }).items).toHaveLength(2);
    });

    it("rejects more than 20 ids", async () => {
      const ids = Array.from({ length: 21 }, (_, i) => `MLA${i}`);
      await expect(getItemsBulk(client, { item_ids: ids })).rejects.toThrow(/20/);
    });
  });

  describe("getItemReviews", () => {
    it("fetches reviews with optional catalog_product_id", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ rating_average: 4.8, reviews: [] }));

      await getItemReviews(client, {
        item_id: "MLA123",
        catalog_product_id: "MLA999",
      });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/reviews/item/MLA123");
      expect(url).toContain("catalog_product_id=MLA999");
    });
  });

  describe("findOffersForProductQuery", () => {
    it("returns catalog_without_price when buy box is missing", async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({
            results: [{ id: "MLA26385767", name: "MacBook Air" }],
            paging: { total: 1, limit: 10, offset: 0 },
          })
        )
        .mockResolvedValueOnce(
          jsonResponse({
            id: "MLA26385767",
            name: "MacBook Air",
            buy_box_winner: null,
            permalink: "https://www.mercadolibre.com.ar/macbook-air",
          })
        );

      const result = await findOffersForProductQuery(client, {
        query: "MacBook Air",
      });

      expect(result).toMatchObject({
        strategy: "product_query_catalog_then_buy_box",
        offer_count: 0,
        catalog_without_price_count: 1,
        catalog_without_price: [
          expect.objectContaining({
            catalog_product_id: "MLA26385767",
            permalink: "https://www.mercadolibre.com.ar/macbook-air",
          }),
        ],
      });
    });

    it("returns offers when buy box exists", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ results: [{ id: "MLA55016525", name: "Phone" }] }))
        .mockResolvedValueOnce(jsonResponse({ id: "MLA55016525", buy_box_winner: "MLA903218023" }))
        .mockResolvedValueOnce(
          jsonResponse({
            id: "MLA903218023",
            title: "Phone listing",
            price: 50000,
            seller_id: 111,
          })
        )
        .mockResolvedValueOnce(
          jsonResponse({
            id: 111,
            nickname: "seller1",
            seller_reputation: { level_id: "5_green" },
          })
        );

      const result = await findOffersForProductQuery(client, { query: "iphone" });

      expect(result).toMatchObject({
        offer_count: 1,
        offers: [
          expect.objectContaining({
            listing_id: "MLA903218023",
            price: 50000,
            seller: expect.objectContaining({ nickname: "seller1" }),
          }),
        ],
      });
    });
  });

  describe("searchBuyableListings", () => {
    it("chains catalog search, product, item, and seller", async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({
            results: [{ id: "MLA55016525", name: "Phone" }],
            paging: { total: 1, limit: 10, offset: 0 },
          })
        )
        .mockResolvedValueOnce(
          jsonResponse({
            id: "MLA55016525",
            buy_box_winner: "MLA903218023",
          })
        )
        .mockResolvedValueOnce(
          jsonResponse({
            id: "MLA903218023",
            title: "Phone listing",
            price: 50000,
            seller_id: 111,
          })
        )
        .mockResolvedValueOnce(
          jsonResponse({
            id: 111,
            nickname: "seller1",
            seller_reputation: { level_id: "5_green" },
          })
        );

      const result = await searchBuyableListings(client, {
        query: "iphone",
        price_max: 100000,
      });

      expect(result).toMatchObject({
        strategy: "catalog_search_then_buy_box",
        matched_count: 1,
        listings: [
          expect.objectContaining({
            listing_id: "MLA903218023",
            price: 50000,
            seller: expect.objectContaining({ nickname: "seller1" }),
          }),
        ],
      });
    });

    it("filters out listings above price_max", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ results: [{ id: "MLA1" }] }))
        .mockResolvedValueOnce(jsonResponse({ id: "MLA1", buy_box_winner: "MLA2" }))
        .mockResolvedValueOnce(jsonResponse({ id: "MLA2", price: 999999 }));

      const result = await searchBuyableListings(client, {
        query: "tv",
        price_max: 1000,
        include_seller_ratings: false,
      });

      expect((result as { matched_count: number }).matched_count).toBe(0);
    });
  });

  describe("searchListings", () => {
    it("returns fallback hint on 403", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("Forbidden", { status: 403, headers: { "Content-Type": "text/plain" } })
      );

      const result = await searchListings(client, {
        query: "laptop",
        price_max: 500000,
      });

      expect(result).toMatchObject({
        blocked: true,
        status: 403,
        fallback: expect.stringContaining("find_offers_for_product_query"),
      });
    });
  });

  describe("rankSellersForQuery", () => {
    it("returns fallback when sites search is blocked", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("Forbidden", { status: 403, headers: { "Content-Type": "text/plain" } })
      );

      const result = await rankSellersForQuery(client, {
        query: "MacBook Air",
        top_sellers: 3,
      });

      expect(result).toMatchObject({
        strategy: "sites_search_blocked",
        blocked: true,
        fallback: expect.objectContaining({
          tool: "find_offers_for_product_query",
        }),
      });
    });

    it("dedupes sellers and ranks by reputation", async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({
            results: [
              { id: "MLA1", title: "Mac A", price: 1000000, seller_id: 111 },
              { id: "MLA2", title: "Mac B", price: 900000, seller_id: 222 },
              { id: "MLA3", title: "Mac C", price: 950000, seller_id: 111 },
            ],
          })
        )
        .mockResolvedValueOnce(
          jsonResponse({
            id: 111,
            nickname: "seller_green",
            seller_reputation: { level_id: "5_green" },
          })
        )
        .mockResolvedValueOnce(
          jsonResponse({
            id: 222,
            nickname: "seller_yellow",
            seller_reputation: { level_id: "3_yellow" },
          })
        );

      const result = await rankSellersForQuery(client, {
        query: "MacBook Air",
        top_sellers: 2,
      });

      expect(result).toMatchObject({
        strategy: "listings_search_dedupe_sellers",
        unique_sellers_found: 2,
        top_sellers: [
          expect.objectContaining({
            seller_id: 111,
            seller: expect.objectContaining({ nickname: "seller_green" }),
          }),
          expect.objectContaining({
            seller_id: 222,
          }),
        ],
      });
    });
  });

  describe("compareProducts", () => {
    it("compares at least two items", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse([
          { id: "MLA1", title: "A", price: 10 },
          { id: "MLA2", title: "B", price: 20 },
        ])
      );

      const result = await compareProducts(client, {
        item_ids: ["MLA1", "MLA2"],
      });

      expect((result as { compared_count: number }).compared_count).toBe(2);
    });
  });

  describe("askSellerQuestion", () => {
    it("posts question with item_id and text", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 99 }));

      await askSellerQuestion(client, {
        item_id: "MLA123",
        text: "Is warranty official?",
      });

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({
        text: "Is warranty official?",
        item_id: "MLA123",
      });
    });
  });

  describe("getMyOrders", () => {
    it("resolves buyer from /users/me when omitted", async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ id: 89660613 }))
        .mockResolvedValueOnce(jsonResponse({ results: [] }));

      await getMyOrders(client, {});

      const ordersUrl = mockFetch.mock.calls[1][0] as string;
      expect(ordersUrl).toContain("buyer=89660613");
    });
  });

  describe("searchMyClaims", () => {
    it("calls post-purchase claims search", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));

      await searchMyClaims(client, { status: "opened" });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/post-purchase/v1/claims/search");
      expect(url).toContain("status=opened");
    });
  });
});

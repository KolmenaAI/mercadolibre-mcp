import { describe, it, expect, vi, beforeEach } from "vitest";
import { MercadoLibreClient } from "../src/client.js";
import {
  searchItems,
  getProduct,
  getItemDescription,
  getCategories,
  getCategory,
  getSellerInfo,
  getTrends,
  getCurrencyConversion,
} from "../src/actions.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("actions", () => {
  let client: MercadoLibreClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new MercadoLibreClient();
  });

  describe("searchItems", () => {
    it("searches via products/search with query and default site MLA", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          keywords: "iphone",
          paging: { total: 1, limit: 10, offset: 0 },
          results: [{ id: "MLA16240160", name: "iPhone" }],
        })
      );

      const result = await searchItems(client, { query: "iphone" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/products/search?"),
        expect.any(Object)
      );
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("site_id=MLA");
      expect(url).toContain("status=active");
      expect(url).toContain("q=iphone");
      expect(url).toContain("limit=10");
      expect(result).toEqual({
        search_api: "products/search",
        result_type: "catalog_product",
        note: expect.any(String),
        keywords: "iphone",
        paging: { total: 1, limit: 10, offset: 0 },
        results: [{ id: "MLA16240160", name: "iPhone" }],
      });
    });

    it("uses custom site_id", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ results: [] }));

      await searchItems(client, { query: "notebook", site_id: "MLB" });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("site_id=MLB");
      expect(url).toContain("/products/search");
    });

    it("maps category to domain_id", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ results: [] }));

      await searchItems(client, {
        query: "tv",
        category: "MLA-CELLPHONES",
      });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("domain_id=MLA-CELLPHONES");
      expect(url).not.toContain("price_min");
    });

    it("caps limit at 50", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ results: [] }));

      await searchItems(client, { query: "test", limit: 200 });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("limit=50");
    });
  });

  describe("getProduct", () => {
    it("fetches catalog product by ID", async () => {
      const product = { id: "MLA55016525", name: "iPhone 15" };
      mockFetch.mockResolvedValueOnce(jsonResponse(product));

      const result = await getProduct(client, { product_id: "MLA55016525" });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/products/MLA55016525");
      expect(result).toEqual({
        resource_type: "catalog_product",
        api: "GET /products/{id}",
        product,
      });
    });
  });

  describe("getItemDescription", () => {
    it("fetches marketplace item description", async () => {
      const desc = { plain_text: "A great product" };
      mockFetch.mockResolvedValueOnce(jsonResponse(desc));

      const result = await getItemDescription(client, { item_id: "MLA123" });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/items/MLA123/description");
      expect(result).toEqual({
        resource_type: "marketplace_item_description",
        api: "GET /items/{id}/description",
        description: desc,
      });
    });

    it("falls back to catalog short_description when listing description missing", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: "Description of item with id MLA55016525 not found",
            error: "not_found",
            status: 404,
          }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      );
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          id: "MLA55016525",
          short_description: { type: "plaintext", content: "Product datasheet text" },
        })
      );

      const result = await getItemDescription(client, { item_id: "MLA55016525" });

      expect(result).toMatchObject({
        resource_type: "catalog_product_description",
        product_id: "MLA55016525",
        plain_text: "Product datasheet text",
      });
    });
  });

  describe("getCategories", () => {
    it("lists categories for default site MLA", async () => {
      const cats = [{ id: "MLA1055", name: "Electrónica" }];
      mockFetch.mockResolvedValueOnce(jsonResponse(cats));

      const result = await getCategories(client);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/sites/MLA/categories");
      expect(result).toEqual(cats);
    });

    it("lists categories for custom site", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      await getCategories(client, { site_id: "MLM" });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/sites/MLM/categories");
    });
  });

  describe("getCategory", () => {
    it("fetches category details", async () => {
      const cat = { id: "MLA1055", name: "Electrónica", path_from_root: [] };
      mockFetch.mockResolvedValueOnce(jsonResponse(cat));

      const result = await getCategory(client, { category_id: "MLA1055" });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/categories/MLA1055");
      expect(result).toEqual(cat);
    });
  });

  describe("getSellerInfo", () => {
    it("fetches seller profile", async () => {
      const seller = { id: 12345, nickname: "SELLER_TEST", reputation: {} };
      mockFetch.mockResolvedValueOnce(jsonResponse(seller));

      const result = await getSellerInfo(client, { seller_id: 12345 });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/users/12345");
      expect(result).toEqual(seller);
    });
  });

  describe("getTrends", () => {
    it("fetches trends for default site", async () => {
      const trends = [{ keyword: "iphone 15" }, { keyword: "ps5" }];
      mockFetch.mockResolvedValueOnce(jsonResponse(trends));

      const result = await getTrends(client);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/trends/MLA");
      expect(result).toEqual(trends);
    });

    it("fetches trends for custom site", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      await getTrends(client, { site_id: "MLB" });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/trends/MLB");
    });
  });

  describe("getCurrencyConversion", () => {
    it("converts with rate and computes amount", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ratio: 1250.5 }));

      const result = await getCurrencyConversion(client, {
        from: "USD",
        to: "ARS",
        amount: 100,
      }) as { converted: number; rate: number; from: string; to: string; amount: number };

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/currency_conversions/search");
      expect(url).toContain("from=USD");
      expect(url).toContain("to=ARS");
      expect(result.rate).toBe(1250.5);
      expect(result.converted).toBe(125050);
      expect(result.amount).toBe(100);
    });

    it("defaults amount to 1", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ratio: 1250.5 }));

      const result = await getCurrencyConversion(client, {
        from: "USD",
        to: "ARS",
      }) as { amount: number; converted: number };

      expect(result.amount).toBe(1);
      expect(result.converted).toBe(1250.5);
    });
  });
});

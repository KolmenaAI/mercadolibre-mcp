import { describe, it, expect, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createMercadoLibreTools", () => {
  it("creates all tool functions including buyer suite", async () => {
    const { createMercadoLibreTools } = await import("../src/index.js");
    const { tools } = createMercadoLibreTools();

    expect(typeof tools.search_items).toBe("function");
    expect(typeof tools.find_offers_for_product_query).toBe("function");
    expect(typeof tools.get_product_buybox).toBe("function");
    expect(typeof tools.get_listing_offer).toBe("function");
    expect(typeof tools.rank_sellers_for_query).toBe("function");
    expect(typeof tools.get_my_orders).toBe("function");
    expect(typeof tools.search_my_claims).toBe("function");
    expect(typeof tools.seller_get_me).toBe("function");
    expect(typeof tools.seller_get_store_snapshot).toBe("function");
    // Removed tools are no longer in the map.
    expect(tools.get_item).toBeUndefined();
    expect(tools.get_items_bulk).toBeUndefined();
    expect(tools.compare_products).toBeUndefined();
    expect(tools.search_buyable_listings).toBeUndefined();
    expect(Object.keys(tools).length).toBeGreaterThanOrEqual(57);
  });

  it("tools call the API correctly", async () => {
    const { createMercadoLibreTools } = await import("../src/index.js");
    const { tools } = createMercadoLibreTools("TEST_TOKEN");

    mockFetch.mockResolvedValueOnce(jsonResponse({ results: [], paging: { total: 0, limit: 10, offset: 0 } }));
    await tools.search_items({ query: "test" });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/products/search"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer TEST_TOKEN" }),
      })
    );

    mockFetch.mockResolvedValueOnce(jsonResponse({ plain_text: "desc" }));
    await tools.get_item_description({ item_id: "MLA1" });

    mockFetch.mockResolvedValueOnce(jsonResponse([]));
    await tools.get_categories();

    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "MLA1055" }));
    await tools.get_category({ category_id: "MLA1055" });

    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1 }));
    await tools.get_seller_info({ seller_id: 1 });

    mockFetch.mockResolvedValueOnce(jsonResponse([]));
    await tools.get_trends();

    mockFetch.mockResolvedValueOnce(jsonResponse({ ratio: 1000 }));
    await tools.get_currency_conversion({ from: "USD", to: "ARS" });
  });
});

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
  it("creates all 8 tool functions", async () => {
    const { createMercadoLibreTools } = await import("../src/index.js");
    const { tools } = createMercadoLibreTools();

    expect(typeof tools.search_items).toBe("function");
    expect(typeof tools.get_item).toBe("function");
    expect(typeof tools.get_item_description).toBe("function");
    expect(typeof tools.get_categories).toBe("function");
    expect(typeof tools.get_category).toBe("function");
    expect(typeof tools.get_seller_info).toBe("function");
    expect(typeof tools.get_trends).toBe("function");
    expect(typeof tools.get_currency_conversion).toBe("function");
  });

  it("tools call the API correctly", async () => {
    const { createMercadoLibreTools } = await import("../src/index.js");
    const { tools } = createMercadoLibreTools("TEST_TOKEN");

    mockFetch.mockResolvedValueOnce(jsonResponse({ results: [] }));
    await tools.search_items({ query: "test" });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/sites/MLA/search"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer TEST_TOKEN" }),
      })
    );

    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "MLA1" }));
    await tools.get_item({ item_id: "MLA1" });

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

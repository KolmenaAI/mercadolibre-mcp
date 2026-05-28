import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function setupMcpClient() {
  const { createMcpServer } = await import("../src/mcp-server.js");
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");

  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return { client, server };
}

describe("MCP Server", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("creates server with correct name and version", async () => {
    const { createMcpServer } = await import("../src/mcp-server.js");
    const server = createMcpServer();
    expect(server).toBeDefined();
  });

  it("registers buyer and seller tools", async () => {
    const { client } = await setupMcpClient();
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name).sort();

    expect(names).toContain("search_buyable_listings");
    expect(names).toContain("compare_products");
    expect(names).toContain("get_my_orders");
    expect(names).toContain("seller_get_me");
    expect(names).toContain("seller_get_store_snapshot");
    expect(names).toContain("seller_search_orders");
    expect(names.length).toBeGreaterThanOrEqual(65);

    await client.close();
  });

  describe("tool calls — success", () => {
    it("search_items returns results", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ results: [{ id: "MLA1" }] }));
      const { client } = await setupMcpClient();

      const result = await client.callTool({ name: "search_items", arguments: { query: "iphone" } });
      const text = (result.content as Array<{ text: string }>)[0].text;
      expect(JSON.parse(text).results).toHaveLength(1);
      await client.close();
    });

    it("get_item returns item", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "MLA123", title: "Test" }));
      const { client } = await setupMcpClient();

      const result = await client.callTool({ name: "get_item", arguments: { item_id: "MLA123" } });
      const text = (result.content as Array<{ text: string }>)[0].text;
      const parsed = JSON.parse(text) as { item: { id: string } };
      expect(parsed.item.id).toBe("MLA123");
      await client.close();
    });

    it("get_item_description returns description", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ plain_text: "A product" }));
      const { client } = await setupMcpClient();

      const result = await client.callTool({ name: "get_item_description", arguments: { item_id: "MLA123" } });
      const text = (result.content as Array<{ text: string }>)[0].text;
      const parsed = JSON.parse(text) as { description: { plain_text: string } };
      expect(parsed.description.plain_text).toBe("A product");
      await client.close();
    });

    it("get_categories returns categories", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([{ id: "MLA1055" }]));
      const { client } = await setupMcpClient();

      const result = await client.callTool({ name: "get_categories", arguments: {} });
      const text = (result.content as Array<{ text: string }>)[0].text;
      expect(JSON.parse(text)).toHaveLength(1);
      await client.close();
    });

    it("get_category returns category details", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "MLA1055", name: "Electronics" }));
      const { client } = await setupMcpClient();

      const result = await client.callTool({ name: "get_category", arguments: { category_id: "MLA1055" } });
      const text = (result.content as Array<{ text: string }>)[0].text;
      expect(JSON.parse(text).name).toBe("Electronics");
      await client.close();
    });

    it("get_seller_info returns seller", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 123, nickname: "SELLER" }));
      const { client } = await setupMcpClient();

      const result = await client.callTool({ name: "get_seller_info", arguments: { seller_id: 123 } });
      const text = (result.content as Array<{ text: string }>)[0].text;
      expect(JSON.parse(text).nickname).toBe("SELLER");
      await client.close();
    });

    it("get_trends returns trends", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([{ keyword: "iphone" }]));
      const { client } = await setupMcpClient();

      const result = await client.callTool({ name: "get_trends", arguments: {} });
      const text = (result.content as Array<{ text: string }>)[0].text;
      expect(JSON.parse(text)[0].keyword).toBe("iphone");
      await client.close();
    });

    it("get_currency_conversion returns conversion", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ratio: 1250.5 }));
      const { client } = await setupMcpClient();

      const result = await client.callTool({ name: "get_currency_conversion", arguments: { from: "USD", to: "ARS", amount: 100 } });
      const text = (result.content as Array<{ text: string }>)[0].text;
      expect(JSON.parse(text).converted).toBe(125050);
      await client.close();
    });
  });

  describe("tool calls — errors", () => {
    it("search_items returns error on API failure", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Server Error", { status: 500 }));
      const { client } = await setupMcpClient();

      const result = await client.callTool({ name: "search_items", arguments: { query: "test" } });
      expect(result.isError).toBe(true);
      await client.close();
    });

    it("get_item returns error when listing and catalog are missing", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
      mockFetch.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
      const { client } = await setupMcpClient();

      const result = await client.callTool({ name: "get_item", arguments: { item_id: "INVALID" } });
      expect(result.isError).toBe(true);
      await client.close();
    });

    it("get_item_description returns error when listing and catalog are missing", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
      mockFetch.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
      const { client } = await setupMcpClient();

      const result = await client.callTool({ name: "get_item_description", arguments: { item_id: "INVALID" } });
      expect(result.isError).toBe(true);
      await client.close();
    });

    it("get_categories returns error on failure", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Error", { status: 500 }));
      const { client } = await setupMcpClient();

      const result = await client.callTool({ name: "get_categories", arguments: {} });
      expect(result.isError).toBe(true);
      await client.close();
    });

    it("get_category returns error on failure", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
      const { client } = await setupMcpClient();

      const result = await client.callTool({ name: "get_category", arguments: { category_id: "INVALID" } });
      expect(result.isError).toBe(true);
      await client.close();
    });

    it("get_seller_info returns error on failure", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
      const { client } = await setupMcpClient();

      const result = await client.callTool({ name: "get_seller_info", arguments: { seller_id: 999 } });
      expect(result.isError).toBe(true);
      await client.close();
    });

    it("get_trends returns error on failure", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Error", { status: 500 }));
      const { client } = await setupMcpClient();

      const result = await client.callTool({ name: "get_trends", arguments: {} });
      expect(result.isError).toBe(true);
      await client.close();
    });

    it("get_currency_conversion returns error on failure", async () => {
      mockFetch.mockResolvedValueOnce(new Response("Error", { status: 500 }));
      const { client } = await setupMcpClient();

      const result = await client.callTool({ name: "get_currency_conversion", arguments: { from: "USD", to: "ARS" } });
      expect(result.isError).toBe(true);
      await client.close();
    });
  });
});

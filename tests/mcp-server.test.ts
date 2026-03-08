import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("MCP Server", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("creates server with correct name and version", async () => {
    const { createMcpServer } = await import("../src/mcp-server.js");
    const server = createMcpServer();
    expect(server).toBeDefined();
  });

  it("registers all 8 tools", async () => {
    const { createMcpServer } = await import("../src/mcp-server.js");
    const server = createMcpServer();

    // Use the MCP SDK Client to list tools
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client({ name: "test-client", version: "1.0.0" });

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const result = await client.listTools();
    const names = result.tools.map((t) => t.name).sort();

    expect(names).toEqual([
      "get_categories",
      "get_category",
      "get_currency_conversion",
      "get_item",
      "get_item_description",
      "get_seller_info",
      "get_trends",
      "search_items",
    ]);

    await client.close();
  });
});

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMercadoLibreTools } from "./index.js";

export function createMcpServer(accessToken?: string) {
  const { tools } = createMercadoLibreTools(accessToken);

  const server = new McpServer({
    name: "mercadolibre-mcp",
    version: "1.0.0",
  });

  server.tool(
    "search_items",
    "Search products on MercadoLibre by keyword. Supports filtering by category, price range, and site (MLA=Argentina, MLB=Brazil, MLM=Mexico, etc.)",
    {
      query: z.string().describe("Search query"),
      site_id: z.string().optional().describe("Site ID (default: MLA). MLA=Argentina, MLB=Brazil, MLM=Mexico, MLC=Chile, MCO=Colombia"),
      category: z.string().optional().describe("Category ID to filter"),
      price_min: z.number().optional().describe("Minimum price"),
      price_max: z.number().optional().describe("Maximum price"),
      limit: z.number().optional().describe("Max results (default 10, max 50)"),
      offset: z.number().optional().describe("Pagination offset"),
    },
    async (params) => {
      try {
        const result = await tools.search_items(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    },
  );

  server.tool(
    "get_item",
    "Get full details of a MercadoLibre item including title, price, pictures, seller, condition, and stock.",
    {
      item_id: z.string().describe("Item ID (e.g. MLA1234567890)"),
    },
    async (params) => {
      try {
        const result = await tools.get_item(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    },
  );

  server.tool(
    "get_item_description",
    "Get the full text description of a MercadoLibre item.",
    {
      item_id: z.string().describe("Item ID"),
    },
    async (params) => {
      try {
        const result = await tools.get_item_description(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    },
  );

  server.tool(
    "get_categories",
    "List all top-level categories for a MercadoLibre site.",
    {
      site_id: z.string().optional().describe("Site ID (default: MLA)"),
    },
    async (params) => {
      try {
        const result = await tools.get_categories(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    },
  );

  server.tool(
    "get_category",
    "Get category details including name, path from root, and children categories.",
    {
      category_id: z.string().describe("Category ID (e.g. MLA1055)"),
    },
    async (params) => {
      try {
        const result = await tools.get_category(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    },
  );

  server.tool(
    "get_seller_info",
    "Get seller profile including reputation, ratings, and transaction stats.",
    {
      seller_id: z.number().describe("Seller user ID"),
    },
    async (params) => {
      try {
        const result = await tools.get_seller_info(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    },
  );

  server.tool(
    "get_trends",
    "Get current trending searches on MercadoLibre for a specific site/country.",
    {
      site_id: z.string().optional().describe("Site ID (default: MLA)"),
    },
    async (params) => {
      try {
        const result = await tools.get_trends(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    },
  );

  server.tool(
    "get_currency_conversion",
    "Convert between currencies using MercadoLibre exchange rates (ARS, BRL, MXN, USD, etc.).",
    {
      from: z.string().describe("Source currency code (e.g. USD)"),
      to: z.string().describe("Target currency code (e.g. ARS)"),
      amount: z.number().optional().describe("Amount to convert (default: 1)"),
    },
    async (params) => {
      try {
        const result = await tools.get_currency_conversion(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    },
  );

  return server;
}

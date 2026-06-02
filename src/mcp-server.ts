import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMercadoLibreTools } from "./index.js";
import { registerMercadoLibreTools } from "./mcp-tools.js";
import { registerSellerMercadoLibreTools } from "./mcp-seller-tools.js";

export function createMcpServer(accessToken?: string) {
  const { tools, setAccessToken } = createMercadoLibreTools(accessToken);

  const server = new McpServer({
    name: "mercadolibre-mcp",
    version: "1.4.0",
  });

  registerMercadoLibreTools(server, tools, setAccessToken);
  registerSellerMercadoLibreTools(server, tools);

  return server;
}

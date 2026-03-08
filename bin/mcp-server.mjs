#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "../dist/mcp-server.js";

const server = createMcpServer(process.env.MERCADOLIBRE_ACCESS_TOKEN);
const transport = new StdioServerTransport();
await server.connect(transport);

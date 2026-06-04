/**
 * Entry-point logic for @kolmena-ai/meli-mcp.
 *
 * Invoked by bin/mcp-server.mjs (which is a 3-line shim that adds the
 * `#!/usr/bin/env node` shebang; tsc strips shebangs, so it has to live
 * in a hand-written JS file). All substantive logic lives here so it's
 * type-checked.
 *
 * Two transports, selected by a single CLI flag:
 *
 *   stdio (default) — Claude Desktop, Cursor, Windsurf, MCP Inspector, npx
 *     node bin/mcp-server.mjs
 *
 *   http — Bifrost / self-hosted Streamable HTTP. Serves POST /meli/mcp on
 *     $PORT (default 8000). Each request's `Authorization: Bearer <token>`
 *     header reaches tool callbacks via MCP `requestInfo` and is scoped per
 *     request through AsyncLocalStorage in MercadoLibreClient (see
 *     client.ts:runWithRequestAccessToken).
 *     node bin/mcp-server.mjs --transport http
 *
 * The Docker image bakes `--transport http` into its ENTRYPOINT; the npm
 * binary symlinks (`mercadolibre-mcp`, `meli-mcp`) invoke this script
 * without the flag, defaulting to stdio for Claude Desktop / npx use.
 *
 * Token resolution inside a tool call:
 *   1. `Authorization: Bearer <token>` from the inbound request (HTTP only)
 *   2. fallback to MERCADOLIBRE_ACCESS_TOKEN env var (service-account / cron)
 *   3. else no Authorization header is sent — calls that require auth 403.
 */
import http from "node:http";
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./mcp-server.js";

// Bifrost has this path baked into its MCP client config.
const HTTP_PATH = "/meli/mcp";

export async function main(): Promise<void> {
  const staticToken = process.env.MERCADOLIBRE_ACCESS_TOKEN;

  const { values: cliArgs } = parseArgs({
    options: { transport: { type: "string", default: "stdio" } },
    strict: false, // tolerate unknown args (e.g., when invoked under npx wrappers)
  });
  const transportKind = cliArgs.transport;

  if (transportKind === "stdio") {
    const server = createMcpServer(staticToken);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    return;
  }

  if (transportKind === "http") {
    await runHttp(staticToken);
    return;
  }

  console.error(`Unknown transport: ${String(transportKind)}. Use --transport stdio|http.`);
  process.exit(1);
}

async function runHttp(staticToken: string | undefined): Promise<void> {
  const port = Number(process.env.PORT ?? 8000);

  const server = createMcpServer(staticToken);
  // Stateless mode (sessionIdGenerator: undefined) — every request is
  // self-contained. Per-user auth is carried by the inbound Authorization
  // header, not by an MCP session.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);

  const httpServer = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/healthz") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain");
      res.end("ok");
      return;
    }

    if (req.url === HTTP_PATH) {
      try {
        await transport.handleRequest(req, res);
      } catch (err) {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          const message = err instanceof Error ? err.message : String(err);
          res.end(JSON.stringify({ error: message }));
        }
      }
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  httpServer.listen(port, () => {
    console.log(`mercadolibre-mcp listening on :${port}${HTTP_PATH} (streamable-http)`);
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    console.log(`received ${signal}, draining`);
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

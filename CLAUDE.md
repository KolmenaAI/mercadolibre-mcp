# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Kolmena fork of `@dan1d/mercadolibre-mcp`, published as `@kolmena-ai/meli-mcp`. An MCP server exposing **76 tools** (36 buyer + 40 seller) over the MercadoLibre REST API. Single binary `mercadolibre-mcp` / `meli-mcp` runs on stdio; deployed in production behind `mcp-proxy` (streamable-http on :8000) — see `HANDOFF.md`.

Upstream remote is `upstream` → `https://github.com/dan1d/mercadolibre-mcp.git`. Local dev and sync flow are in `FORK.md`.

## Commands

```bash
pnpm build                 # tsc → dist/ (required before running bin/ or inspector)
pnpm test                  # vitest run
pnpm test:coverage         # vitest run --coverage (v8)
pnpm exec vitest run tests/seller-actions.test.ts              # single test file
pnpm exec vitest run -t "name of test"                         # by test name
pnpm exec tsc --noEmit     # type-check only (CI runs this in addition to build)

pnpm start                 # node bin/mcp-server.mjs (stdio MCP — requires build first)
pnpm inspector             # MCP Inspector UI, no auth
MERCADOLIBRE_ACCESS_TOKEN='APP_USR-...' pnpm inspector:auth     # Inspector with token
pnpm smoke                 # scripts/smoke-all-tools.sh — CLI smoke of every tool via inspector --cli
```

Package manager is **pnpm 11.4.0** (pinned via the `packageManager` field). Install via `brew install pnpm` or `npm i -g pnpm`. CI (`.github/workflows/ci.yml`) runs `pnpm install --frozen-lockfile && pnpm test && pnpm build && pnpm exec tsc --noEmit` on Node 24. Node engine is pinned to `>=24` since Node 18 (EOL April 2025) and Node 20 (EOL April 2026) are no longer supported.

## Auth

Most tools require `MERCADOLIBRE_ACCESS_TOKEN` (OAuth `APP_USR-...`). It is read once at process start from `process.env` in `bin/mcp-server.mjs` and passed to `createMcpServer`. There is no refresh-token logic inside the MCP — that lives upstream of this process (see `HANDOFF.md` "Not in scope").

## Architecture

**Two-layer design.** A pure TypeScript SDK in `src/` that anyone can `import` (entry: `src/index.ts`), wrapped by a thin MCP server adapter (`src/mcp-server.ts` + `bin/mcp-server.mjs`).

```
bin/mcp-server.mjs           # stdio entry — reads env, calls createMcpServer
└── src/mcp-server.ts        # McpServer, registers buyer + seller tool groups
    ├── src/mcp-tools.ts             # buyer tool registrations (zod schema → handler)
    ├── src/mcp-seller-tools.ts      # seller tool registrations
    └── src/index.ts          # createMercadoLibreTools(token) → { tools: {...} }
        ├── src/client.ts             # MercadoLibreClient (fetch wrapper, 30s timeout, Bearer auth)
        ├── src/actions.ts            # 9 original buyer actions (search/get_product/...)
        ├── src/buyer-actions.ts      # 27 extended buyer actions
        ├── src/seller-actions.ts     # 40 seller actions (seller_*)
        ├── src/{schemas,buyer-schemas,seller-schemas}.ts   # zod schemas + Params types
        ├── src/{product,item,seller,seller-listing}-helpers.ts
        └── src/errors.ts             # MercadoLibreError with isUnauthorized/isNotFound/isRateLimited
```

`src/listing-types.ts` defines a JSON-value type used by `client.postJson`/`postValidate`/`postMultipart` so listing-creation bodies stay strongly typed.

### Adding a new tool

The flow has four touchpoints — miss one and the tool is invisible or untyped:

1. **Schema** — add `*Params` type and zod schema in the relevant `*-schemas.ts`.
2. **Action** — add the implementation in `actions.ts` / `buyer-actions.ts` / `seller-actions.ts`. Take `(client: MercadoLibreClient, params)` and return `Promise<unknown>`.
3. **Factory** — wire it into `createMercadoLibreTools` in `src/index.ts` under the right `tools.foo: (params) => fooAction(client, params)` line.
4. **MCP registration** — call `server.tool(name, description, zodShape, handler)` in `src/mcp-tools.ts` (buyer) or `src/mcp-seller-tools.ts` (seller). Always wrap the handler with the local `toolResult()` helper so thrown errors become `{ isError: true }` MCP responses instead of crashing the transport.

### Client conventions

`MercadoLibreClient` is intentionally small. All methods go through `request()` except three special POST shapes:
- `postJson` — strongly typed JSON body via `MercadoLibreJsonObject` (used for listing creation).
- `postValidate` — for `/items/validate` style endpoints that return 204 on success and a 400-with-errors body on failure. Returns a `ListingValidationResult` discriminated union instead of throwing.
- `postMultipart` — for `/pictures/items/upload` (60s timeout). Does **not** set `Content-Type` so the runtime sets the multipart boundary.

All other failures throw `MercadoLibreError` (method, path, status, raw body). Use its `isNotFound` / `isUnauthorized` / `isRateLimited` getters to branch — the codebase prefers narrowing on these over status-code checks.

### Seller ownership invariant

Any seller tool that mutates or reads private item data routes through `assertMyItem` (`src/seller-helpers.ts`), which fetches `/items/{id}` and rejects with a synthetic 403 `MercadoLibreError` if `seller_id` doesn't match the authenticated user. Don't bypass this — write new seller tools through `assertMyItem` (single id) or `resolveSellerId` + filtering (lists).

### Catalog vs listing id gotcha

`search_items` calls `/products/search` and returns **catalog product ids**, not marketplace listing ids — `/items/{id}` will 404 on them. `get_item` and `get_item_description` auto-fall back to `/products/{id}` when they see `isItemNotFoundError` (`product-helpers.ts`). When adding tools that consume "an item id from search," preserve this fallback or document the constraint in the tool description.

### Search workarounds

ML blocks `/sites/{site}/search?q=` for many apps (403). The fork's answer:
- `search_items` → `/products/search` (catalog, token required, returns catalog ids).
- `search_buyable_listings` → composite: catalog search → `get_product_buybox` → price filter → optional seller reputation. This is the supported path for "listings under $X."
- `search_listings` → still tries the legacy endpoint and returns a fallback hint pointing at `search_buyable_listings`.

## TypeScript module setup

`tsconfig.json` is `module: Node16` / ESM with `rootDir: src`, `outDir: dist`, and `declaration: true` (we publish types). Source uses ESM-style `import "./foo.js"` even for `.ts` files — keep that convention or Node16 resolution breaks. Tests live in `tests/` and are **excluded** from `tsconfig.json`; vitest type-checks them via its own pipeline.

`vitest.config.ts` only scopes coverage to `src/**` (excluding `bin/**`). There's no global setup file; tests mock the client directly per-suite.

## Deployment

Production runs `mcp-proxy` (PID 1) → `node bin/mcp-server.mjs` (child, stdio) on port 8000 as `streamable-http`. Token comes from a Kubernetes secret. Image build uses pnpm: install with the lockfile, `pnpm build`, then `pnpm deploy --legacy --prod /prod` to produce a self-contained tree (only prod deps, no symlinks back to the pnpm store). Full details and the mcp-proxy config in `HANDOFF.md`; example proxy config in `config/mcp-proxy.example.json`.

## Reference docs in repo

- `README.md` — buyer workflow, supported sites, programmatic usage.
- `BUYER-API-ROADMAP.md` / `SELLER-API-ROADMAP.md` — tool inventories with API mappings.
- `TESTING.md` — MCP Inspector setup and per-tool payload examples.
- `HANDOFF.md` — deployment steps (Kubernetes / Harbor / Fleet) for the `mcp-meli` service.
- `FORK.md` — upstream sync flow, package rename, what changed vs `@dan1d/...@1.0.2`.
- `CHANGELOG.md` — version-by-version diff of tool additions.

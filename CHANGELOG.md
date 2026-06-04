# Changelog — @kolmena-ai/meli-mcp

## 1.6.2

Replaces the `MELI_AUTH_TRACE` debug flag with **always-on structured error logs** — one JSON line per failed tool call on stderr with `level: "error"` (ClickStack / OTel collectors map to `SeverityText=ERROR`).

Each error carries the inbound auth context (token source / prefix / fingerprint), the inbound MCP headers with sensitive ones redacted (`Authorization`, `Cookie`, `Proxy-Authorization`, `X-Amz-Security-Token`), and the MercadoLibre method / path / status / response headers / response body. `traceparent` survives redaction so pod logs can be joined with Bifrost / OTel traces.

Verbose by design for the per-user OAuth rollout — silent on success, structured JSON on failure. stdout stays clean for the MCP JSON-RPC wire stream (stdio transport safety).

## 1.6.1

`MELI_AUTH_TRACE=1` no longer mutates tool-result payloads — the `[AUTH_TRACE] inbound_source=… outbound_last=…` line is now emitted to stdout only, instead of being prepended to `content[0].text` of every response. This makes the debug flag safe to leave enabled in production: response shape is identical whether the flag is on or off.

### Fixes

- `src/mcp-tools.ts:43-66` and `src/mcp-seller-tools.ts:77-108` — extract the trace summary into a `logTraceSummary()` helper that calls `console.log` directly. The success and error branches of `toolResult()` no longer concatenate a `[AUTH_TRACE] …` prefix into the returned text. Tools that always emit JSON `result` payloads now produce strict JSON regardless of `MELI_AUTH_TRACE`.
- Internal trace events (`[MELI_AUTH_TRACE] tool_result prefix=… fp=…`, `[MELI_AUTH_TRACE] effective_token_selected …`) are unchanged — they were already stdout-only.

### Operational impact

`kubectl logs` is the single channel for auth tracing now. Clients parsing `result.content[0].text` as JSON (or as a strict tool-result type) will no longer break under the debug flag.

## 1.6.0

Per-user OAuth release — the MCP server now speaks Streamable HTTP natively and propagates `Authorization: Bearer` headers from each inbound request into the underlying MercadoLibre API call.

### Breaking

- **Container ENTRYPOINT changed from `mcp-proxy` to `node bin/mcp-server.mjs`.** The TBXark/mcp-proxy stdio→HTTP bridge has been removed from the image; the server speaks Streamable HTTP directly. Bifrost's existing client config (URL `…:8000/meli/mcp`) is unchanged. Anyone overriding `/etc/mcp-proxy/config.json` at runtime should remove that mount — the file no longer exists.
- **Removed `config/mcp-proxy.docker.json` and `config/mcp-proxy.example.json`** from the repo.
- **Dropped the `bridge-builder` (Go / TBXark/mcp-proxy) stage from the Dockerfile.** Build is now single Node stage plus a runtime stage.

### Auth — per-user OAuth via Bifrost

- New transport: **Streamable HTTP** (`@modelcontextprotocol/sdk/server/streamableHttp.js`) on `:$PORT/meli/mcp` (defaults `:8000/meli/mcp`). Stateless mode (`sessionIdGenerator: undefined`) — each HTTP request is self-contained. The MCP endpoint path is a hardcoded constant since Bifrost has it baked into its client config.
- `bin/mcp-server.mjs` now accepts `--transport stdio|http`; the published `mercadolibre-mcp` / `meli-mcp` binaries default to stdio for npx use (Claude Desktop, Cursor, Inspector). The Docker image bakes `--transport http` into its ENTRYPOINT so production runs HTTP without code change.
- Inbound `Authorization: Bearer <token>` is read in each MCP tool handler from `extra.requestInfo.headers.authorization` (only populated when the transport is HTTP), then scoped per-request via `AsyncLocalStorage` so concurrent users' tokens never cross-contaminate.
- Falls back to `MERCADOLIBRE_ACCESS_TOKEN` env var when no inbound bearer is present (preserves the service-account / cron use case).
- Optional debug instrumentation: set `MELI_AUTH_TRACE=1` to surface redacted token-source / fingerprint in tool responses and stdout for end-to-end verification.

### Why this matters

TBXark/mcp-proxy does not forward inbound HTTP headers to the wrapped stdio MCP server (see [TBXark/mcp-proxy#45](https://github.com/TBXark/mcp-proxy/issues/45) — closed without merging the `ForwardHeaders` patch). With the proxy in the path, Bifrost's per-user `Authorization: Bearer` headers were silently dropped, and every user effectively shared whichever static token the Deployment had been provisioned with. Speaking Streamable HTTP directly closes that gap: `requestInfo.headers.authorization` is populated by the SDK from the inbound HTTP request, end of story.

### Bifrost compatibility

Bifrost's MCP client config (`auth_type: per_user_oauth`, `oauth_config_id: …`) works unchanged. The same URL `http://mcp-meli.<ns>.svc.cluster.local:8000/meli/mcp` still answers — just from `node` instead of `mcp-proxy`. Use the regional `auth.mercadolibre.com.<region>/authorization` endpoint and the global `api.mercadolibre.com/oauth/token` endpoint. MercadoLibre OAuth supports refresh-token rotation (single-use) and PKCE S256 (opt-in at the app level); enabling PKCE on the registered MercadoLibre app is recommended.

### Operational notes

- **Healthcheck**: HTTP transport exposes `GET /healthz` (200 / `ok`) for K8s probes. The previous `tcpSocket: 8000` probes still work.
- **Graceful shutdown**: `SIGTERM` triggers `http.Server.close()` with a 10s drain timeout before `process.exit`.
- **Per-tool-call cost**: AsyncLocalStorage scope-wrap is negligible (~µs). Per-request token resolution is O(1) header parse.

## 1.4.0

Toolchain modernization release — Node 24 + pnpm 11, major dependency bumps, and zero open vulnerabilities. Behavior of the 77 MCP tools is unchanged.

### Breaking

- **Node.js `>=24`** (was `>=18`). Node 18 (EOL April 2025) and Node 20 (EOL April 2026) are no longer supported. CI runs on Node 24; the Docker base image is `node:24.16.0-alpine3.23`.
- **`zod` upgraded from 3.x to 4.x.** Exported parameter types (e.g. `SearchItemsParams`, `SellerCreateListingParams`) are now inferred via zod 4, which changes a few subtle behaviors at the validation layer. Programmatic consumers should bump their own `zod` to `^4` to share a single resolved version.
- **`mcp-proxy.docker.json`**: the embedded server config now sets `panicIfInvalid: true` — the proxy refuses to start when the MCP server config is invalid instead of running in a degraded state. Operators who relied on the proxy starting anyway should validate their config first.

### Security

- **0 known vulnerabilities** (`pnpm audit` / `npm audit` clean).
- Fixed 14 advisories that were open against 1.3.0 — 2 high (`fast-uri`, `path-to-regexp`) and 12 moderate (`hono`, `qs`, `ip-address`, `esbuild`, `postcss`, `brace-expansion`, etc.). All traced to two roots: an out-of-date MCP SDK (1.27.1 → 1.29.0) and an out-of-date test stack (vitest 1.6.1 → 4.1.7).
- Adopted **pnpm 11's tightened defaults** for supply-chain safety: `minimumReleaseAge: 1440` (24h quarantine on freshly published versions), `strictDepBuilds: true` (lifecycle scripts refused unless allowlisted), `blockExoticSubdeps: true` (blocks transitive git/file refs).

### Toolchain (dev / CI)

- **Migrated from npm to pnpm 11.4.0**, pinned via `"packageManager": "pnpm@11.4.0"` in `package.json`.
- `package-lock.json` replaced by `pnpm-lock.yaml`. The new lockfile records cross-platform optional dependencies correctly, fixing a latent class of Docker-build failures where `npm ci` rejected the host-generated lockfile on Linux due to missing `@emnapi/core` etc.
- Single-package `pnpm-workspace.yaml` added so `pnpm deploy --legacy --prod /prod` can produce a self-contained runtime tree.
- **CI workflow** rewritten: `pnpm/action-setup@v4` + `actions/setup-node@v4` with `cache: pnpm`; runs `pnpm install --frozen-lockfile && pnpm test && pnpm build && pnpm exec tsc --noEmit` on Node 24.
- **Dependency bumps**:
  - `@modelcontextprotocol/sdk` 1.27.1 → 1.29.0
  - `typescript` 5.4 → 6.0.3 (major)
  - `vitest` + `@vitest/coverage-v8` 1.6.1 → 4.1.7 (three major versions)

### Runtime / Docker

- **Dockerfile rewrite** around pnpm:
  - Stage 1 installs pnpm via `npm install -g pnpm@11.4.0` (no corepack reliance — corepack is `experimental` in current Node and on track to be removed from core).
  - BuildKit cache mounts on the pnpm store make repeat builds near-instant.
  - `pnpm deploy --legacy --filter=@kolmena-ai/meli-mcp --prod /prod` produces a self-contained prod tree with no symlinks back to the pnpm store.
  - Stage 3 is a straight `COPY --from=build /prod /app` — no second install in the runtime stage.
- **`.dockerignore` added** — filters `node_modules`, `dist`, `coverage`, `.git`, `.idea`, `tests`, `.env*`. Stops host artifacts from leaking into the build context.
- Final image size unchanged (~184 MB, Node base layer dominates).

### Fixes

- `src/mcp-seller-tools.ts:411` — `seller_submit_claim_action` `payload` schema updated from `z.record(valueSchema)` (zod 3) to `z.record(z.string(), valueSchema)` (zod 4 requires explicit key schema).
- Restored `zod` to `dependencies` after it was briefly moved to `devDependencies` — `src/mcp-tools.ts` imports it at runtime and `pnpm deploy --prod` would otherwise ship a broken package.

## 1.3.0

First release under the `@kolmena-ai/` scope. Fork of [`@dan1d/mercadolibre-mcp@1.0.2`](https://www.npmjs.com/package/@dan1d/mercadolibre-mcp) (8 buyer tools) expanded to **77 tools** (36 buyer + 41 seller).

### Buyer

- **Catalog search rewrite** — `search_items` now hits `GET /products/search` (token-bound) instead of the upstream `GET /sites/{site}/search?q=` which started returning 403 for many apps. Response is wrapped with `search_api` / `result_type: catalog_product` so callers can tell which API answered.
- **Catalog fallback** — `get_item` and `get_item_description` fall back to `GET /products/{id}` when `/items/{id}` returns 404, so catalog ids returned by `search_items` (e.g. `MLA55016525`) work without an extra round trip.
- **`get_product`** — explicit `GET /products/{id}` for catalog datasheets.
- **Buyer suite (27 new tools)** — compare, reviews, shipping, Q&A, orders, shipments, claims, domain discovery, official stores, seller response time, etc.
- **`search_buyable_listings`** — composite workaround for the blocked legacy search: catalog → buy box → price filter → optional seller reputation. Use this for "listings under $X with seller ratings" workflows.
- **`search_listings`** — still tries the legacy endpoint; on 403 returns a structured fallback hint pointing at `search_buyable_listings`.
- **`compare_products`** — bulk compare with optional reviews and shipping.
- Most buyer / post-purchase calls now require `MERCADOLIBRE_ACCESS_TOKEN`.

### Seller (new in this fork)

- **41 `seller_*` tools** — store snapshot, listings audit, inventory, orders, shipments, Q&A, promotions, messages, claims, feedback. Full mapping in [SELLER-API-ROADMAP.md](./SELLER-API-ROADMAP.md).
- **Listing creation** — `seller_get_listing_requirements`, `seller_upload_listing_picture`, `seller_validate_listing`, `seller_create_listing`.
- **Ownership checks** on `seller_get_my_item`, `seller_get_order`, and bulk variants — synthetic 403 if the token doesn't match `seller_id`.

### Client / infrastructure

- **`MercadoLibreClient`** gains `postJson`, `postValidate` (204 / 400 discriminated union for `/items/validate`), `postMultipart` (picture upload), and HTTP `PUT` for listing updates.
- Package renamed to `@kolmena-ai/meli-mcp`; binaries `mercadolibre-mcp` and `meli-mcp` share the same entrypoint.
- Local dev: `pnpm inspector` / `inspector:auth` for MCP Inspector, `pnpm smoke` for CLI smoke of every tool, see [TESTING.md](./TESTING.md).
- Kolmena backend: `meli-buyer` + `meli-seller` skills consume this MCP via `CALL_MCP_TOOL`; the old `meli-api` skill is deprecated.

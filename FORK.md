# Kolmena fork

This directory is a fork of [@dan1d/mercadolibre-mcp](https://github.com/dan1d/mercadolibre-mcp) (npm `@dan1d/mercadolibre-mcp@1.0.2`), vendored for Kolmena buyer/seller agents.

| Item | Value |
|------|--------|
| Upstream remote | `upstream` → `https://github.com/dan1d/mercadolibre-mcp.git` |
| Package name | `@kolmena-ai/meli-mcp` |
| Shipped binary | `mercadolibre-mcp` and `meli-mcp` (same entrypoint) |

## Done in this fork

- [x] **36 buyer tools** — see [BUYER-API-ROADMAP.md](./BUYER-API-ROADMAP.md)
- [x] **37 seller tools** (`seller_*`) — see [SELLER-API-ROADMAP.md](./SELLER-API-ROADMAP.md)
- [x] `search_buyable_listings`, catalog search, post-purchase buyer suite
- [x] `meli-buyer` + `meli-seller` skills in kolmena-backend (MCP via `CALL_MCP_TOOL`; `meli-api` deprecated)
- [x] Local test docs: [TESTING.md](./TESTING.md), `pnpm inspector`, `pnpm smoke`
- [x] Deploy notes: [HANDOFF.md](./HANDOFF.md)

## Planned next

- [ ] OAuth refresh-token support inside MCP (today: static access token in env/secret)
- [ ] Harbor image + Fleet PR in `cb-cluster` (ops)

## Sync from upstream

```bash
git fetch upstream
git merge upstream/main   # or cherry-pick specific commits
pnpm install && pnpm build && pnpm test
```

## Local dev

```bash
pnpm install
pnpm build
MERCADOLIBRE_ACCESS_TOKEN=APP_USR-... pnpm start   # stdio MCP
```

For HTTP (Bifrost / mcp-proxy), use the config in `config/mcp-proxy.example.json`.

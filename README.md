# @kolmena-ai/meli-mcp

> **Kolmena fork** of [dan1d/mercadolibre-mcp](https://github.com/dan1d/mercadolibre-mcp). See [FORK.md](./FORK.md) for upstream sync and local dev.

**MercadoLibre marketplace for AI agents.**

[![npm version](https://img.shields.io/npm/v/@dan1d/mercadolibre-mcp)](https://www.npmjs.com/package/@dan1d/mercadolibre-mcp)
[![tests](https://img.shields.io/github/actions/workflow/status/dan1d/mercadolibre-mcp/ci.yml?label=tests)](https://github.com/dan1d/mercadolibre-mcp/actions)
[![npm downloads](https://img.shields.io/npm/dm/@dan1d/mercadolibre-mcp)](https://www.npmjs.com/package/@dan1d/mercadolibre-mcp)
[![license](https://img.shields.io/npm/l/@dan1d/mercadolibre-mcp)](./LICENSE)

MCP server that connects AI agents to [MercadoLibre](https://www.mercadolibre.com), the largest e-commerce marketplace in Latin America (150M+ users). Search catalog products, get product details, browse categories, track trends, and convert currencies across Argentina, Brazil, Mexico, Chile, Colombia, and more.

**Kolmena docs:** [TESTING.md](./TESTING.md) · [BUYER-API-ROADMAP.md](./BUYER-API-ROADMAP.md) · [HANDOFF.md](./HANDOFF.md) · [CHANGELOG.md](./CHANGELOG.md)

---

## Kolmena buyer workflow

Most calls need `MERCADOLIBRE_ACCESS_TOKEN` (OAuth `APP_USR-...`).

1. **`search_items`** — keyword search → `results[].id` are **catalog product ids**
2. **`get_product`** — full datasheet for that id (recommended)
3. **`get_item`** / **`get_item_description`** — same id works (auto-fallback to catalog if not a listing)
4. Use **`product.permalink`** from the response as the buyer link

Ids from search are **not** marketplace listing ids; `/items/MLA55016525` alone will 404 without fallback.

```bash
npm install && npm run build
export MERCADOLIBRE_ACCESS_TOKEN='APP_USR-...'
npm run inspector:auth   # MCP Inspector UI
```

---

## Quick Start (upstream / npx)

Upstream `@dan1d/mercadolibre-mcp` used public `/sites/.../search`; this fork uses `/products/search` and requires a token for search.

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mercadolibre": {
      "command": "npx",
      "args": ["-y", "@dan1d/mercadolibre-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add mercadolibre -- npx -y @dan1d/mercadolibre-mcp
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "mercadolibre": {
      "command": "npx",
      "args": ["-y", "@dan1d/mercadolibre-mcp"]
    }
  }
}
```

### Windsurf

```json
{
  "mcpServers": {
    "mercadolibre": {
      "command": "npx",
      "args": ["-y", "@dan1d/mercadolibre-mcp"]
    }
  }
}
```

### With authentication (optional)

For endpoints that require auth (future premium features), add your access token:

```json
{
  "mcpServers": {
    "mercadolibre": {
      "command": "npx",
      "args": ["-y", "@dan1d/mercadolibre-mcp"],
      "env": {
        "MERCADOLIBRE_ACCESS_TOKEN": "APP_USR-..."
      }
    }
  }
}
```

> Once configured, ask your AI assistant things like: *"Search for iPhone 15 on MercadoLibre"* or *"What are the trending searches in Argentina?"* or *"Show me details for item MLA1234567890"*

---

## Available Tools (Kolmena fork)

| Tool | Description |
|------|-------------|
| `search_items` | Catalog keyword search via `/products/search` (token required). Returns catalog product ids. |
| `get_product` | Catalog product details via `/products/{id}` — use after `search_items`. |
| `get_item` | Marketplace listing `/items/{id}`, or catalog product if id came from search (fallback). |
| `get_item_description` | Listing description, or catalog `short_description` on fallback. |
| `get_categories` | Top-level categories for a site (token may be required). |
| `get_category` | Category tree node by id. |
| `get_seller_info` | Seller profile by numeric seller id (from a **listing**, not catalog search). |
| `get_trends` | Trending searches for a site. |
| `get_currency_conversion` | FX conversion (token required). |

---

## Supported Sites

| Site ID | Country |
|---------|---------|
| `MLA` | Argentina |
| `MLB` | Brazil |
| `MLM` | Mexico |
| `MLC` | Chile |
| `MCO` | Colombia |
| `MLU` | Uruguay |
| `MPE` | Peru |
| `MEC` | Ecuador |
| `MCR` | Costa Rica |
| `MPA` | Panama |
| `MLV` | Venezuela |
| `MRD` | Dominican Republic |
| `MHN` | Honduras |
| `MBO` | Bolivia |
| `MNI` | Nicaragua |
| `MPY` | Paraguay |
| `MSV` | El Salvador |
| `MGT` | Guatemala |

---

## Example Prompts

- "Search for iPhone 15 on MercadoLibre Argentina"
- "Show me details for catalog product MLA55016525"
- "What's the description for the first search result?"
- "What are the trending searches in Brazil?"
- "List all categories on MercadoLibre Mexico"
- "Show me the reputation of seller 123456789"
- "Convert 100 USD to ARS"

---

## Programmatic Usage

```bash
npm install @dan1d/mercadolibre-mcp
```

```typescript
import { createMercadoLibreTools } from "@dan1d/mercadolibre-mcp";

const ml = createMercadoLibreTools();

// Search products
const results = await ml.tools.search_items({
  query: "iPhone 15",
  site_id: "MLA",
  price_max: 2000000,
  limit: 5,
});

// Get item details
const item = await ml.tools.get_item({ item_id: "MLA1405857684" });

// Get trending searches in Argentina
const trends = await ml.tools.get_trends({ site_id: "MLA" });

// Browse categories
const categories = await ml.tools.get_categories({ site_id: "MLA" });

// Get seller reputation
const seller = await ml.tools.get_seller_info({ seller_id: 123456789 });

// Convert currencies
const conversion = await ml.tools.get_currency_conversion({
  from: "USD",
  to: "BRL",
  amount: 100,
});
```

---

## Part of the LATAM MCP Toolkit

| Server | What it does |
|--------|-------------|
| [CobroYa](https://github.com/dan1d/mercadopago-tool) | Mercado Pago payments — create links, search payments, refunds |
| **MercadoLibre MCP** | MercadoLibre marketplace — search products, categories, trends |
| [DolarAPI MCP](https://github.com/dan1d/dolar-mcp) | Argentine exchange rates — blue, oficial, CCL, crypto, conversion |

---

## License

[MIT](./LICENSE) -- by [dan1d](https://dan1d.dev/)

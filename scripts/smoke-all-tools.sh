#!/usr/bin/env bash
# Smoke-test all MCP tools via MCP Inspector CLI (no browser).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

pnpm build --silent

INSPECTOR=(npx --yes @modelcontextprotocol/inspector --cli node bin/mcp-server.mjs)

if [[ -n "${MERCADOLIBRE_ACCESS_TOKEN:-}" ]]; then
  INSPECTOR=(npx --yes @modelcontextprotocol/inspector -e "MERCADOLIBRE_ACCESS_TOKEN=${MERCADOLIBRE_ACCESS_TOKEN}" --cli node bin/mcp-server.mjs)
else
  echo "Warning: MERCADOLIBRE_ACCESS_TOKEN unset — search_items and some tools may fail." >&2
fi

run_tool() {
  local name="$1"
  shift
  echo ""
  echo "========== ${name} =========="
  "${INSPECTOR[@]}" --method tools/call --tool-name "$name" "$@" 2>&1 | head -c 4000
  echo ""
}

echo "Listing tools..."
TOOL_COUNT=$("${INSPECTOR[@]}" --method tools/list 2>&1 | grep -c '"name":' || true)
echo "Tools registered: ${TOOL_COUNT} (expected 36)"
echo "..."

run_tool get_categories --tool-arg 'site_id=MLA'
run_tool get_trends --tool-arg 'site_id=MLA'
run_tool get_currency_conversion --tool-arg 'from=USD' --tool-arg 'to=ARS' --tool-arg 'amount=10'
run_tool get_category --tool-arg 'category_id=MLA1055'
run_tool search_items --tool-arg 'query=iPhone 15' --tool-arg 'site_id=MLA' --tool-arg 'limit=2'
run_tool find_offers_for_product_query --tool-arg 'query=iPhone 15' --tool-arg 'site_id=MLA' --tool-arg 'catalog_limit=2' --tool-arg 'price_max=99999999'
run_tool get_listing_offer --tool-arg 'listing=MLA1804763057' --tool-arg 'site_id=MLA'

# Catalog id from search — replace with a real id from your search_items output if needed
CATALOG_ID="${SMOKE_CATALOG_ID:-MLA55016525}"
run_tool get_product --tool-arg "product_id=${CATALOG_ID}"
run_tool get_product_buybox --tool-arg "product_id=${CATALOG_ID}"
run_tool get_item_description --tool-arg "item_id=${CATALOG_ID}"

run_tool get_seller_info --tool-arg 'seller_id=123456789'

echo ""
echo "Done. Set MERCADOLIBRE_ACCESS_TOKEN and SMOKE_CATALOG_ID=<id from search> for best results."

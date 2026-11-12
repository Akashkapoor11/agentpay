# Sponsor and platform integrations

Only describe an integration as used in Devpost when it is configured and visible in the submitted build.

## PayPal Developer Platform

- Sandbox Orders API v2 creates the payment order server-side.
- PayPal JavaScript SDK v6 gives the buyer the approval flow.
- The backend re-fetches the order before capture and checks order identity, amount, currency, exact line items, signed cart commitment and deterministic policy.
- PayPal client secret and access token remain backend-only.

## PayPal remote MCP (optional)

`backend/lib/paypal-mcp.js` creates an OpenAI Responses API remote MCP tool only when `PAYPAL_MCP_ENABLED=true`. The allowlist is read-only: `list_products` and `show_product_details`. It does not allow order creation, capture, refunds or other mutations. AgentPay's own server-side Orders v2 routes remain the only checkout path. Verify a real MCP call before describing it as used.

## AG Grid / AG Studio

AG Grid 36.3 powers the catalogue, external market-observation and decision-evidence tables; AG Charts 14.3 is pinned alongside it for AG Studio 3.1 compatibility. AG Studio core and React wrapper are both pinned to 3.1.0. AG Studio is embedded with approved catalogue rows, event history, purchase-control metrics and Channel3 observation data. Its AI module uses a custom adapter to the backend `/api/analytics/agent` route, which calls the OpenAI Responses API server-side. The analytics system prompt is read-only and the adapter rejects externally provided tools. Verify the current AG Studio license/runtime and real dashboard interactions in the deployed build before selecting the sponsor prize.

## Channel3

When `CHANNEL3_API_KEY` is configured, the `search_catalog` function attempts Channel3 before looking up the local execution allowlist. Responses are normalized to include stable product/offer IDs, product name, retailer domain, optional price/currency, availability status and a retrieval timestamp. Short-lived affiliate URLs are deliberately not persisted or served later. Missing price and stock stay unknown; displayed prices are timestamped observations, not live quotes. External offers are context only: no automatic SKU/merchant mapping authorizes checkout. Show a real response in the demo before claiming Channel3 use.

## Render Workflows

After PayPal capture, the backend starts the `agentpay-workflow/reconcile-payment` task with an idempotency key based on the capture ID. The authenticated callback validates the mandate/order/run identity and matches capture ID, amount and currency against stored PostgreSQL records. The reconciliation row and `RECONCILED` hash-linked audit event are written atomically. Deploy and test the actual Workflow service before claiming the Render sponsor prize.

## APIMatic Context Plugin

APIMatic is a development-time Context Plugin, not a runtime dependency. Follow `APIMATIC_CONTEXT_PLUGIN.md` and retain evidence of genuine use against PayPal integration work before setting `APIMATIC_CONTEXT_USED=true` or selecting its prize.

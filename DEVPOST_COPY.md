# AgentPay — Proof-Backed Procurement for AI Commerce

**Tagline:** AI can prepare the purchase. Only verified intent can move money.

## Inspiration

As AI agents move from recommending products to preparing and executing purchases, businesses need a reliable way to preserve the buyer's original authority. A natural-language request such as “buy six chairs under $1,500 and deliver within four days” should not become open-ended permission to spend. AgentPay explores a different model: every AI-prepared purchase must carry a signed, exact cart commitment and pass deterministic server-side checks before PayPal can move money.

## What it does

AgentPay is an AI-assisted procurement prototype. A buyer describes a business purchase in natural language. The OpenAI Responses API extracts the intent and uses strict server-side tools to search and score offers from an explicitly synthetic checkout catalogue. When configured, Channel3 adds external product observations for market context. AgentPay then creates an Ed25519-signed purchase mandate that binds the original request digest, spending ceiling, delivery limit, scope, expiry and SHA-256 cart commitment.

Before payment, the backend rebuilds the cart from the approved catalogue, normalizes money as integer cents, verifies the signature and commitment, and evaluates the mandate. The buyer then approves a PayPal Sandbox order. Before capture, the backend fetches the PayPal order again and verifies its identity, amount, currency and exact item list, then re-runs the policy. The Purchase Proof receipt connects the original intent and signed mandate to the resulting PayPal order, capture and hash-linked decision events.

## What is novel

The differentiator is not another AI shopping chatbot or a standalone payment guard. AgentPay connects external product context, an exact signed purchase commitment and post-payment evidence in one visible workflow. The agent can recommend a purchase, but it cannot change the cart after authorization or override the server's payment rules. A tampered cart is rejected by the actual order-creation endpoint before PayPal order creation.

## Key features

1. Natural-language procurement intent extraction with OpenAI Responses API function tools (GPT-6 Astra is the configured default model).
2. Optional Channel3 product discovery with source attribution, retrieved time, reported currency and unknown-safe availability.
3. Ed25519 mandate signing, SHA-256 buyer-intent digest and SHA-256 cart commitment over SKU, quantity, integer-cent unit price and currency.
4. Deterministic backend policy for spending ceiling, item quantity, category, merchant scope and catalogue delivery estimate.
5. PayPal Sandbox Orders API v2 create, PayPal JavaScript SDK v6 buyer approval and server-side capture.
6. Tamper rejection before PayPal order creation, with an append-only hash-linked decision record.
7. Purchase Proof JSON receipt containing mandate, market evidence, policy, PayPal IDs and reconciliation status.
8. AG Grid evidence views and an AG Studio read-only analytics assistant backed by a server-side OpenAI adapter.
9. Optional idempotent Render Workflow reconciliation after a verified capture.

## Built with

Next.js 16.4.6, React 19.3.1, Node.js 22, OpenAI Responses API (GPT-6 Astra configured default), PayPal Sandbox Orders API v2, PayPal JavaScript SDK v6 / React SDK 10.6.1, PostgreSQL, `pg`, Ed25519, SHA-256, AG Grid 36.3, AG Charts 14.3, AG Studio 3.1, Docker and npm workspaces. Optional source integrations include Channel3 API, read-only PayPal remote MCP (disabled by default) and Render Workflows; only integrations actually exercised in the submitted demo should be selected as sponsor tools. Automated verification uses Node.js assertion-based smoke tests, a repository-wide source syntax scan and a Postman API collection.

Optional PayPal remote MCP support is included behind `PAYPAL_MCP_ENABLED=true` with a read-only tool allowlist (`list_products`, `show_product_details`); it should only be claimed in the submission if a live MCP tool call is demonstrated. APIMatic is not claimed unless the entrant genuinely uses its Context Plugin and records that use.

## Data and prototype limitations

The local PayPal checkout catalogue is synthetic demo data. It does not represent live merchant quotes, inventory, sustainability certifications or delivery promises. Channel3 data is presented as timestamped external observations only; short-lived affiliate URLs are not persisted and observations are not automatically mapped to PayPal checkout SKUs. PayPal transactions are Sandbox-only. AgentPay is not an official PayPal product and does not claim official AP2 compliance or certification.

## How to run

See `README.md` and `backend/docs/START_HERE.md` for Node.js 22, PostgreSQL, PayPal Sandbox, OpenAI and optional sponsor integration setup. A successful installation, production build, live Sandbox transaction and hosted demo must be verified in the entrant's deployment environment before submitting. The public hackathon prototype has no end-user authentication or tenant isolation and is not intended for real customer or confidential purchasing data.

## Demo

The under-three-minute demo should show the AI procurement flow, actual Channel3 observations if configured, the signed mandate, a changed cart blocked by the actual PayPal order endpoint, a real PayPal Sandbox approval/capture, and the Purchase Proof receipt.

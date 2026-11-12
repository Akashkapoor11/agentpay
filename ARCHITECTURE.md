# AgentPay 2.0 architecture

## Product boundary

AgentPay is an independent PayPal Sandbox hackathon prototype. Its core function is to preserve a buyer's bounded purchase intent across AI planning, cart selection, payment authorization and post-payment evidence. It does not claim official PayPal AP2 compliance, production fraud detection or verified third-party merchant ratings.

## Runtime architecture

```text
┌──────────────────────────────────────────────────────────────┐
│ Next.js / React buyer experience                             │
│ Request · market observations · policy · checkout · proof   │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTPS
┌──────────────────────────────▼───────────────────────────────┐
│ Next.js backend                                               │
│                                                              │
│  OpenAI Responses API (GPT-6 Astra default)                   │
│    ├─ search_catalog (server-controlled demo allowlist)       │
│    ├─ score_offer (transparent constraint-fit heuristic)      │
│    └─ PayPal MCP (optional, read-only allowed tools)          │
│                                                              │
│  Channel3 API (optional external search observations)         │
│  Mandate issuer (Ed25519 signature + SHA-256 intent digest)   │
│  Cart canonicalizer (SKU, quantity, cents, currency)           │
│  Policy firewall (budget, scope, quantity, delivery)          │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│ PostgreSQL                                                    │
│ agent runs · mandates · orders · captures                     │
│ append-only hash-linked decisions · audit heads               │
│ idempotent workflow reconciliation                             │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│ PayPal Sandbox                                                │
│ Orders v2 create → buyer approval via JS SDK v6 → capture     │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│ Purchase Proof + optional Render Workflow                     │
│ verified capture · exact amount/currency · reconciliation     │
└──────────────────────────────────────────────────────────────┘
```

## Security and money movement

1. The buyer's original request is hashed with SHA-256 and included in the signed mandate.
2. The cart commitment is canonicalized as sorted SKU, quantity, integer-cent price and ISO currency records, then hashed with SHA-256.
3. The private Ed25519 signing key is server-only. The browser submits the mandate for identity matching; the backend loads the stored mandate and verifies its signature and expiry.
4. The backend ignores browser-supplied prices and reconstructs items from `backend/lib/catalog.js`. The local catalogue is explicitly synthetic and is the only checkout allowlist in this demo.
5. Budget, delivery, quantity, category and allowed-merchant constraints are checked server-side before PayPal order creation.
6. Before capture, the backend retrieves the PayPal order again and checks the stored mandate, order identity, one-unit shape, amount, currency, exact SKU/quantity/unit-price list and signed cart commitment. It then re-runs the policy.
7. The PayPal capture request uses a deterministic short `PayPal-Request-Id`. Payment records reject a second, conflicting capture ID for the same order.
8. Decision events have a database trigger that rejects UPDATE/DELETE and are hash-linked within a mandate scope. Purchase Proof verifies each event hash and the stored audit head. This is tamper-evident application evidence, not protection against a privileged database owner who can alter the schema, trigger or all stored rows.
9. A Render callback authenticates with a shared secret and checks order, capture, amount and currency against PostgreSQL. A capture can be reconciled only once; the reconciliation row and audit event are written in one database transaction.

## External data trust model

- Channel3 data is untrusted third-party context. The app stores stable product/offer IDs and a timestamped observation snapshot; it does not persist short-lived affiliate URLs. Missing prices remain null, unknown availability remains `UNKNOWN`, and reported currencies are not silently defaulted to USD. The snapshot is historical evidence, not a live quote.
- Channel3 offers are not automatically mapped to demo catalogue SKUs and cannot be passed directly to PayPal checkout.
- Local demo catalogue prices, inventory and shipping estimates are illustrative. They are labelled as fixtures throughout the UI and docs.
- The OpenAI model cannot override server-side checks or set the final PayPal amount. Product text and third-party observations are treated as untrusted data, not instructions.
- Optional PayPal MCP exposes only read-only `list_products`, `show_product_details` tools. Payment create/capture remains inside AgentPay's controlled Orders v2 routes.
- The AG Studio analytics adapter is read-only and keeps the OpenAI API key on the backend.

## Data flow and API surface

| API | Responsibility |
|---|---|
| `POST /api/agent` | Validate request size, run AI/fallback planner, create mandate, persist trace |
| `POST /api/paypal/create-order` | Load/verify mandate, rebuild catalogue cart, compare commitment, re-check policy, create order |
| `POST /api/paypal/capture-order` | Fetch current PayPal order, verify full details, re-check policy, capture and persist |
| `GET /api/proof` | Return redacted transaction proof and audit verification |
| `POST /api/analytics/agent` | Read-only AG Studio → OpenAI Responses adapter |
| `POST /api/workflow/reconcile` | Authenticated idempotent reconciliation callback |
| `GET /api/health` | Readiness/configuration status |

## Data model

- `agent_runs`: request text, AI mode and result payload.
- `mandates`: signed mandate envelope, fingerprint, lifecycle status and expiry.
- `agent_decisions`: append-only-by-trigger event metadata, previous hash, event hash and canonical event payload; privileged database owners remain outside this trust boundary.
- `audit_heads`: current head hash for each mandate event stream.
- `payment_orders`: canonical amount, currency, cart, policy and PayPal order reference.
- `payment_captures`: unique PayPal capture per order.
- `workflow_reconciliations`: one reconciliation row per PayPal capture.

## Known non-production boundaries

- PayPal Sandbox only; do not switch to live money for a hackathon demonstration.
- Synthetic local catalogue, no live merchant inventory or fulfilment commitments.
- No production identity, employee access-control, merchant onboarding, tax, shipping or refund workflows. The public hackathon API also has no end-user authentication or tenant isolation.
- Optional integrations require the corresponding secrets, access, deployment and end-to-end tests.

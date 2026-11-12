# AgentPay 2.0 - Proof-Backed Procurement for AI Commerce

**AI can prepare the purchase. Only verified intent can move money.**

AgentPay is an independent hackathon prototype for controlled, agent-driven business purchasing. A buyer describes a procurement request in natural language. The AI extracts a bounded intent, retrieves external product observations through Channel3 when configured, and proposes items from a separate, explicitly synthetic checkout catalogue. The server signs the exact cart commitment, applies deterministic purchase rules, and creates a PayPal Sandbox order. The buyer approves at PayPal. The backend re-fetches the order, verifies its amount, currency and line items, then captures it. A Purchase Proof record connects the request, mandate, policy decision, PayPal order, capture and append-only evidence chain.

> **Trust boundary:** AI may recommend. The server authorizes. PayPal obtains buyer approval. The browser never receives the PayPal client secret or mandate private key.

The root `LICENSE` applies to AgentPay-authored source. Third-party packages retain their own licenses; in particular, AG Studio is commercially licensed and requires an eligible trial or license key for its full functionality. Do not redistribute vendor package code as part of this repository.

This repository is a hackathon prototype, not a production payment platform, fraud model, merchant reputation service, sustainability certification system or official PayPal AP2 implementation.

## What makes AgentPay different

1. **Intent-bound authorization.** Ed25519 signs a mandate that includes the buyer-intent digest, spending ceiling, delivery constraint, permitted scope, expiry and SHA-256 cart commitment.
2. **Exact-cart enforcement.** The commitment covers SKU, quantity, integer-cent unit price and currency. The backend rebuilds the cart from the allowlisted catalogue and blocks a changed cart before PayPal order creation.
3. **Evidence-first market context.** Channel3 results are separately labelled as timestamped external observations, with stable product/offer IDs, retrieval time and reported currency. Short-lived affiliate URLs are not persisted. They are not automatically treated as equivalent products or checkout authority.
4. **PayPal is the payment rail.** Orders API v2 creates the Sandbox order. The buyer authorizes through the PayPal JavaScript SDK v6. The server re-fetches and verifies the PayPal order before capture.
5. **Verifiable Purchase Proof.** A hash-linked, append-only decision ledger and a downloadable JSON receipt connect authorization to the PayPal capture and, when configured, Render reconciliation.
6. **Read-only AI analytics.** AG Studio is connected to a server-side OpenAI Responses adapter. Its analytics agent may analyse supplied records, but cannot approve, create, capture or modify payments.

## Important data distinctions


- `backend/lib/catalog.js` is a **synthetic demo checkout catalogue**. Its products, prices, stock counts, merchant names, tags and delivery estimates are illustrative fixtures, not live retailer quotations.
- Channel3 results are **external search observations**. Missing prices and unknown availability stay unknown. Reported prices are grouped by reported currency; no savings or like-for-like benchmark is claimed without a verified match.
- Only SKUs in the server-controlled demo catalogue can enter PayPal checkout. External Channel3 offers never become AgentPay PayPal checkout items. Channel3 prices/availability are timestamped observations, not live quotes; run a fresh Channel3 search before making any current-price statement.
- The `recycled-material-demo-tag` is a sample catalogue label only. It is not a verified environmental claim or certification.
- `budgetUtilizationPct` is the percentage of the authorised spending ceiling used. It is not a fraud, credit, merchant-trust or risk score.

## Prototype security boundary

This hackathon prototype does **not** implement end-user authentication, tenant isolation, employee roles or a production API abuse-control layer. The public `/api/agent` and `/api/analytics/agent` endpoints can incur provider usage, and the proof/ledger endpoints are addressable by a mandate UUID. CORS restricts browser origins; it is not authentication. Use only synthetic demo requests and PayPal Sandbox credentials, keep the backend private credentials server-side, and do not use real customer, employee or confidential procurement data. Do not expose this code as a production multi-tenant payment service without adding identity, authorization, persistent rate limiting, abuse controls, security review and operational monitoring.

## Repository layout

```text
agentpay/
├── frontend/                 # Next.js + React user experience
│   ├── app/                  # UI, AG Grid, AG Studio, PayPal checkout and proof
│   ├── lib/                  # frontend API URL helper
│   └── public/               # assets
├── backend/                  # Next.js API + business logic
│   ├── app/api/              # agent, PayPal, proof, analytics, workflow APIs
│   ├── lib/                  # OpenAI, PayPal, Channel3, mandate, policy, DB
│   ├── db/schema.sql         # PostgreSQL schema and safe migrations
│   ├── workflows/            # Render Workflow task
│   ├── scripts/              # key generation and deterministic smoke tests
│   ├── postman/              # API collection
│   └── docs/                 # architecture, sponsor and compliance notes
├── .github/workflows/ci.yml  # dependency install, source syntax scan, smoke tests and builds
├── render.yaml               # frontend, backend, PostgreSQL and Workflow
├── package.json              # npm workspaces
└── LICENSE                   # MIT
```

## Architecture at a glance

```text
Buyer request
   │
   ▼
Next.js / React procurement experience
   │
   ▼
OpenAI Responses API ── local strict function tools
   │                         │
   ├── PayPal MCP (optional, read-only allowlist)
   └── Channel3 API (optional external market observations)
                             │
                             ▼
               Server-controlled demo checkout catalogue
                             │
                             ▼
        Ed25519 mandate + SHA-256 exact-cart commitment
                             │
                             ▼
           Deterministic policy revalidation (strict server-side input checks)
                             │
                             ▼
       PostgreSQL order/evidence state + append-only hash chain
                             │
                             ▼
        PayPal Orders v2 → buyer approval → server capture
                             │
                             ▼
             Purchase Proof JSON + AG Grid ledger
                             │
                    Render Workflow (optional)
                             │
                             ▼
              Idempotent verified reconciliation
```

### Core API routes

| Route | Purpose |
|---|---|
| `POST /api/agent` | Run AI procurement planning, sign/persist a mandate and write the decision trace |
| `POST /api/paypal/create-order` | Verify mandate identity, canonical cart, commitment and policy before creating a Sandbox order |
| `POST /api/paypal/capture-order` | Re-fetch and validate the PayPal order, capture it server-side and persist the result |
| `GET /api/proof?mandateId=...` | Return the Purchase Proof record and audit-chain verification result |
| `POST /api/analytics/agent` | Server-side, read-only AG Studio/OpenAI analytics adapter |
| `POST /api/workflow/reconcile` | Authenticate and idempotently reconcile a persisted completed capture |
| `GET /api/health` | Report configuration and database readiness checks |

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16.4.6, React 19.3.1 |
| Data grids / analytics | AG Grid 36.3, AG Charts 14.3, AG Studio 3.1 |
| AI | OpenAI Responses API, GPT-6 Astra default, structured function calling |
| Optional PayPal agent tools | PayPal remote MCP, read-only allowlist |
| Product context | Channel3 API |
| Payments | PayPal Sandbox Orders API v2, PayPal JavaScript SDK v6 / React SDK 10.6.1 |
| Backend | Node.js 22, Next.js Route Handlers |
| Validation | Explicit runtime checks and strict OpenAI JSON Schema tool definitions |
| Data | PostgreSQL, `pg` |
| Authorization | Ed25519, SHA-256, exact-cart commitments |
| Workflows | Render Workflows SDK |
| Testing | Node.js assertion-based smoke tests, full-repository JavaScript/TypeScript/JSX syntax scan, Postman end-to-end API collection, and build commands configured in CI (the build commands still need a successful run after dependency installation) |
| Packaging / hosting | npm workspaces, Docker, Render |

The current codebase uses JavaScript for the existing application and TypeScript for the Render Workflow. It deliberately avoids a deadline-risky wholesale migration or unnecessary infrastructure such as Kubernetes, Kafka or a multi-database stack.

## Requirements

- Node.js 22 or newer and npm 10 or newer.
- A PostgreSQL database.
- PayPal Developer Sandbox app credentials.
- OpenAI API key.
- Optional: Channel3 API key, AG Studio license key, PayPal MCP access, Render API key/workflow configuration.

## Local setup

From the repository root:

```bash
npm install
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env.local
```

Generate a stable Ed25519 key pair and copy the printed Base64 values into `backend/.env.local`:

```bash
npm run keys:generate
```

Configure a PostgreSQL URL, then run:

```bash
npm run db:schema
npm run smoke
```

Start the backend and frontend in separate terminals:

```bash
npm run dev:backend
npm run dev:frontend
```

Open `http://localhost:3000`. The backend API defaults to `http://localhost:4000`.

### Mandatory backend environment

See `backend/.env.example`. At minimum set:

- `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` from a PayPal **Sandbox** app.
- `PAYPAL_ENV=sandbox`.
- `OPENAI_API_KEY` and `OPENAI_MODEL` (default: `gpt-6-astra`; set `OPENAI_ANALYTICS_MODEL` to override the AG Studio analytics model independently).
- `DATABASE_URL` and, in hosted environments, appropriate `DATABASE_SSL`.
- `MANDATE_PRIVATE_KEY_B64` and `MANDATE_PUBLIC_KEY_B64` from `npm run keys:generate`.
- `FRONTEND_ORIGIN` to the actual frontend origin.

`PAYPAL_MCP_ENABLED=false` is the safe default. Set it to `true` only when testing the optional PayPal Sandbox remote MCP connection. AgentPay restricts the MCP allowlist to read-only catalog/insight tools; PayPal order creation and capture remain in AgentPay's own server-side path.

### Frontend environment

See `frontend/.env.example`. Set `NEXT_PUBLIC_API_BASE_URL` to the backend origin and `NEXT_PUBLIC_PAYPAL_CLIENT_ID` to the Sandbox client ID. The public AG Studio license key is optional unless your AG Studio distribution requires one.

## Verification commands

```bash
npm run source-check
npm run smoke
npm run workflows:build
npm run build:backend
npm run build:frontend
# Or run all release checks in sequence
npm run verify
```

The smoke test does not call external services or move money. Import `backend/postman/AgentPay.postman_collection.json` into Postman and follow requests 01–08 in order for a live backend verification. The collection deliberately blocks a tampered SKU before creating a valid order. Open the returned `approveUrl` in a browser, approve using a PayPal Sandbox buyer, then run the capture request. The last two requests are optional Render reconciliation and an idempotency retry. Before submission, separately verify a real OpenAI run, real Channel3 search if claiming Channel3, an end-to-end PayPal Sandbox create/approve/capture, PostgreSQL persistence, and Render reconciliation if claiming Render. A passing local smoke test is not proof of those live integrations.

## PayPal Sandbox transaction test

1. Create a Sandbox app in the PayPal Developer Dashboard.
2. Put the app Client ID in the frontend public environment and Client ID/Secret in backend-only environment variables.
3. Create a Sandbox personal/buyer account in the PayPal developer dashboard.
4. Run AgentPay with an explicit budget and delivery constraint.
5. Verify the proposed cart matches the signed mandate.
6. Use PayPal's buyer approval flow.
7. Confirm that the backend stores the PayPal order ID, capture ID, amount, currency and completed status.
8. Refresh Purchase Proof and verify the hash-linked events.

Never use live PayPal credentials or real money for the hackathon demo. Never commit credentials, access tokens, private signing keys or `.env` files.

## Sponsor integration 

- **AG Grid / AG Studio:** AG Grid powers the evidence/market tables. AG Studio 3.1 is embedded with a server-side OpenAI adapter and read-only analytics intent; supporting AG Grid 36.3 and AG Charts 14.3 versions are aligned. Confirm the sponsor's current prize requirements and live UI behaviour before selecting its prize.
- **Channel3:** meaningful only when a live configured API response is shown in the product. The external results remain evidence/context, not checkout inventory.
- **Render:** the configured workflow starts after a successful capture, and its callback re-verifies the stored capture. Claim only after deployed end-to-end testing.
- **APIMatic:** development-time Context Plugin use must actually occur and be documented before selecting its sponsor prize.
- **PayPal MCP:** optional read-only remote MCP capability. It is not required for PayPal eligibility, and should only be claimed as used if a real call is shown.

## Submission documents

- `DEVPOST_COPY.md` — draft project description.
- `DEMO_SCRIPT.md` — under-three-minute demo plan.
- `SUBMISSION_CHECKLIST.md` — pre-submission verification.
- `AUDIT_REPORT.md` — source audit and validation limits.
- `FILE_BY_FILE_AUDIT.md` — complete 74-file inventory with current line counts, roles and review scope.
- `ARCHITECTURE.md` — technical architecture.
- `backend/docs/RULE_COMPLIANCE.md` — rule mapping.
- `backend/docs/JUDGE_MAP.md` — judging evidence map.

## License

MIT. See `LICENSE`.



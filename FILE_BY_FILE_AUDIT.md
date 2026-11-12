# AgentPay 2.0 — fresh file-by-file audit inventory

**Audit date:** 11 November 2026  
**Working source:** `AgentPay_2.0/`, extracted from the preserved AgentPay archive and upgraded in this review  
**Files in repository:** 74  
**JavaScript/TypeScript/JSX files in syntax scan:** 39 (generated `backend/workflows/dist` excluded)
**Combined JS/TS/JSX/CSS/SQL lines:** 3,186 (includes compiled Workflow `dist/index.js`)

## Review scope and limits

All 73 packaged files were enumerated and assigned a role. Every non-generated JavaScript/TypeScript/JSX file under `backend/` and `frontend/` was passed through the TypeScript transpile syntax scan. JSON/YAML/Postman parsing and targeted route, database, payment, signature, policy, Channel3, workflow, frontend state and documentation checks are recorded in `AUDIT_REPORT.md`. The highest-risk payment and trust-boundary paths received line-level review and regression assertions. This is not a substitute for dependency-aware typechecking, installed-dependency production builds, live PostgreSQL concurrency testing, provider-backed transactions or independent penetration testing.

## Root and release documents

| File | Lines / size | Review / role |
|---|---:|---|
| `.dockerignore` | 10 | Docker build-context exclusions for dependencies, generated output, local files and secrets. |
| `.env.example` | 4 | Root-level pointer to the frontend and backend environment templates. |
| `.github/workflows/ci.yml` | 21 | GitHub Actions pipeline for install, source scan, smoke tests, Workflow compile and Next.js builds. |
| `.gitignore` | 8 | Ignores local environment files, npm dependencies and generated build/runtime artefacts. |
| `ARCHITECTURE.md` | 95 | System architecture, trust boundaries, API responsibilities, database model and non-production limitations. |
| `AUDIT_REPORT.md` | 110 | Fresh audit findings, modifications, checks performed and external release blockers. |
| `DEMO_SCRIPT.md` | 56 | Timed under-three-minute judge demo, expected proof points and recording safeguards. |
| `DEVPOST_COPY.md` | 47 | Draft public project narrative with implemented features and truthful data/service limitations. |
| `FILE_BY_FILE_AUDIT.md` | 134 | This complete repository inventory, source counts, review scope and limits. |
| `LICENSE` | 21 | Root MIT open-source license. |
| `README.md` | 254 | Project overview, setup, architecture, tests, Sandbox workflow, hosting and prototype security limitations. |
| `SUBMISSION_CHECKLIST.md` | 73 | Release, payment, security, sponsor and Devpost readiness checklist. |
| `package.json` | 29 | Root npm workspaces, scripts, Node engine and repository metadata. |
| `render.yaml` | 86 | Render services, PostgreSQL resource, environment wiring, health check and Workflow configuration. |

## Backend API and application shell

| File | Lines / size | Review / role |
|---|---:|---|
| `backend/app/api/agent/route.js` | 50 | AI procurement request validation, agent invocation, persistence, decision events and integration status. |
| `backend/app/api/analytics/agent/route.js` | 69 | Server-side OpenAI Responses adapter for AG Studio analytics; constrains model, tools and request size. |
| `backend/app/api/health/route.js` | 17 | Readiness/configuration checks for database, Sandbox credentials, AI and mandate signing. |
| `backend/app/api/ledger/route.js` | 26 | Mandate-scoped read endpoint for persisted decision events including hash-chain fields. |
| `backend/app/api/paypal/capture-order/route.js` | 162 | PayPal order re-fetch, identity/cart/amount/policy checks, server capture and evidence persistence. |
| `backend/app/api/paypal/create-order/route.js` | 163 | Stored mandate verification, canonical catalogue cart rebuild, tamper rejection and Orders v2 creation. |
| `backend/app/api/proof/route.js` | 85 | Purchase Proof response joining intent, mandate, market evidence, order, capture, reconciliation and audit verification. |
| `backend/app/api/security/tamper-test/route.js` | 42 | Adversarial tamper-probe endpoint: verifies cart commitment mismatch without calling PayPal. |
| `backend/app/api/workflow/reconcile/route.js` | 52 | Shared-secret authenticated reconciliation callback with identity and capture amount/currency checks. |
| `backend/app/layout.js` | 8 | Backend Next.js root document and service metadata. |
| `backend/app/page.js` | 8 | Minimal backend landing page with API health pointer. |

## Backend database and business logic

| File | Lines / size | Review / role |
|---|---:|---|
| `backend/db/schema.sql` | 105 | PostgreSQL schema, indexes, audit hash columns/trigger, payment tables and reconciliation table. |
| `backend/lib/agent.js` | 382 | OpenAI Responses orchestration, strict tools, Channel3 enrichment, approved catalogue selection and deterministic fallback. |
| `backend/lib/audit.js` | 49 | Hash-chain event canonicalization and audit integrity verification. |
| `backend/lib/cart.js` | 40 | Integer-cent money helpers, canonical cart normalization and SHA-256 cart commitments. |
| `backend/lib/catalog.js` | 45 | Synthetic server-side checkout allowlist, product fixtures, constraints and product lookup. |
| `backend/lib/channel3.js` | 118 | Channel3 HTTP adapter, paginated response parsing, nested offer normalization and unknown-safe market observations. |
| `backend/lib/constraints.js` | 44 | Dependency-free buyer request parser for budgets, quantities, delivery days, categories and merchant scope. |
| `backend/lib/db.js` | 515 | PostgreSQL bootstrap, mandate/order/capture persistence, append-only evidence chain and atomic reconciliation. |
| `backend/lib/mandate.js` | 61 | Ed25519 mandate signing, fingerprint creation, expiry checks and signature verification. |
| `backend/lib/paypal-mcp.js` | 17 | Optional read-only PayPal Sandbox remote MCP tool allowlist; disabled unless explicitly configured. |
| `backend/lib/paypal-order.js` | 44 | Pure PayPal Orders v2 CAPTURE payload builder using integer-cent totals and item_total breakdown. |
| `backend/lib/paypal.js` | 32 | Sandbox-only OAuth token retrieval and PayPal REST request wrapper with timeouts. |
| `backend/lib/policy.js` | 85 | Deterministic server policy for total, currency, quantities, delivery, category and merchant constraints. |
| `backend/lib/render.js` | 18 | Render Workflow start adapter with capture-scoped idempotency key. |

## Backend scripts, Postman and Workflow

| File | Lines / size | Review / role |
|---|---:|---|
| `backend/postman/AgentPay.postman_collection.json` | 330 | Eight-request API verification collection including tamper block, manual Sandbox approval/capture, proof and optional reconciliation retry. |
| `backend/scripts/db-schema.mjs` | 18 | Loads the PostgreSQL schema using configured database credentials and closes the pool. |
| `backend/scripts/generate-mandate-keys.mjs` | 11 | Generates Ed25519 keys and prints Base64 values for server environment configuration. |
| `backend/scripts/smoke-test.mjs` | 226 | Node assertion tests for request parsing, mandate, cart, policy, PayPal payload, Channel3 parsing/mocking and audit/API guardrails. |
| `backend/scripts/source-check.mjs` | 64 | TypeScript transpile-based syntax scan for backend/frontend JS, TS and JSX source; excludes generated dist. |
| `backend/workflows/dist/index.js` | 21 | Compiled Render Workflow entrypoint checked into the repository for runtime startup. |
| `backend/workflows/index.ts` | 26 | Render Workflow reconciliation task with retry/timeout and authenticated callback request. |
| `backend/workflows/package.json` | 19 | Standalone Render Workflow package, exact Render SDK dependency and TypeScript build/start scripts. |
| `backend/workflows/tsconfig.json` | 13 | Strict NodeNext TypeScript compilation settings for the Render Workflow. |

## Backend documentation and configuration

| File | Lines / size | Review / role |
|---|---:|---|
| `backend/.env.example` | 20 | Backend-only environment variable names and placeholders; contains no credentials. |
| `backend/Dockerfile` | 9 | Node 22 backend container definition and Next.js start configuration. Build context must be repo root. |
| `backend/docs/AP2_NOTE.md` | 17 | Terminology note that avoids claiming official PayPal AP2 implementation or certification. |
| `backend/docs/APIMATIC_CONTEXT_PLUGIN.md` | 13 | Instructions for genuine APIMatic development-time Context Plugin use and evidence capture. |
| `backend/docs/JUDGE_MAP.md` | 47 | Maps visible project behaviours to judging criteria and conditional sponsor claims. |
| `backend/docs/RULE_COMPLIANCE.md` | 25 | Maps project deliverables and claims to hackathon submission rules. |
| `backend/docs/SPONSOR_INTEGRATIONS.md` | 30 | Documents actual and optional sponsor integrations and when their use can be claimed. |
| `backend/docs/START_HERE.md` | 84 | Local setup, judge walkthrough, adversarial test and Sandbox transaction instructions. |
| `backend/proxy.js` | 32 | Next.js 16 Proxy CORS origin allowlist and preflight handling; this is not user authentication. |
| `backend/next.config.mjs` | 5 | Backend Next.js configuration with strict React settings. |
| `backend/package.json` | 26 | Backend dependencies, Node version, Next scripts, smoke/key/schema commands. |

## Frontend application and assets

| File | Lines / size | Review / role |
|---|---:|---|
| `frontend/.env.example` | 5 | Frontend public API origin, PayPal Sandbox client ID and optional AG Studio license key placeholders. |
| `frontend/Dockerfile` | 9 | Node 22 frontend container definition and Next.js start configuration. Build context must be repo root. |
| `frontend/app/components/AgentLedger.js` | 50 | AG Grid tables for synthetic checkout catalogue, Channel3 observations and decision evidence. |
| `frontend/app/components/AgentStudio.js` | 100 | AG Studio AI analytics surface with read-only datasets and dashboard prompt starters. |
| `frontend/app/components/PayPalPayButton.js` | 57 | PayPal JavaScript SDK v6 buyer approval component calling server-side order/capture APIs. |
| `frontend/app/components/PurchaseProofPanel.js` | 60 | Persisted transaction evidence display and JSON receipt download. |
| `frontend/app/components/agentpayStudioAdapter.js` | 63 | AG Studio custom adapter that maps conversation turns to the backend analytics route. |
| `frontend/app/globals.css` | 22 | Responsive application styles for the procurement, checkout, analytics, ledger and Purchase Proof UI. |
| `frontend/app/layout.js` | 10 | Frontend global layout, metadata and stylesheet setup. |
| `frontend/app/page.js` | 234 | Main procurement workflow, AI run, tamper test, checkout, dashboard, market evidence and proof state. |
| `frontend/lib/api.js` | 4 | Frontend API base URL resolver for split frontend/backend deployment. |
| `frontend/next.config.mjs` | 6 | Frontend Next.js configuration and dependency transpilation settings. |
| `frontend/package.json` | 25 | Frontend Next.js/React, PayPal SDK, AG Grid, AG Charts and AG Studio dependencies/scripts. |
| `frontend/public/thumbnail.png` | 80,113 bytes | Raster project thumbnail used as a public project asset. |
| `frontend/public/thumbnail.svg` | 23 | Scalable vector project thumbnail asset. |

## Verification interpretation

- “Syntax scan passed” means source files transpiled without syntax diagnostics; it is not a TypeScript typecheck or proof that imports resolve at runtime.
- “Smoke tests passed” means deterministic local assertions passed; they do not call OpenAI, Channel3, PayPal, Render or a live PostgreSQL database.
- The Postman collection is a documented live test sequence, not evidence that all requests have been executed against a deployed service.
- The committed `dist/index.js` is the runtime Workflow entrypoint, but the source TypeScript compilation has not been verified in this environment because dependencies were not installed.
- No generated `package-lock.json` is included; one must be produced by npm from the actual workspace manifests in a network-enabled clean environment.

## Release blockers

- Clean dependency installation and generated lockfile remain pending.
- Workflow TypeScript build and both Next.js production builds remain unverified.
- PostgreSQL schema application, SQL integration and concurrency tests remain pending.
- Live OpenAI and Channel3 API calls remain pending valid credentials.
- PayPal Sandbox create → buyer approval → capture remains pending a Sandbox app and buyer.
- AG Studio license/runtime and Render Workflow deployment/callback remain pending configuration.
- Public repository, hosted demo and public YouTube recording remain entrant deliverables.

**Assessment:** this is a materially hardened hackathon prototype with passing local syntax and smoke checks, not a guaranteed first-place winner or certified production payment system.

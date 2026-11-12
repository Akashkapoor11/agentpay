# AgentPay final submission checklist

## 1. Source and reproducibility

- [ ] Public GitHub/GitLab/Bitbucket repository URL works without login.
- [ ] MIT `LICENSE` is at repository root and visible in repository About/license metadata.
- [ ] Full source, assets, environment examples, schema and instructions are committed.
- [ ] `package-lock.json` is generated from the actual npm workspaces and committed (do not hand-write it).
- [ ] `npm ci` completes from a clean checkout.
- [ ] `npm run smoke` passes.
- [ ] All eight requests in `backend/postman/AgentPay.postman_collection.json` are exercised against the deployed Sandbox flow, including tamper rejection and reconciliation idempotency.
- [ ] Backend, frontend and Workflow production builds pass.
- [ ] No `.env`, API token, PayPal secret, private key or sandbox buyer credential is committed.
- [ ] Demo uses synthetic catalogue data and PayPal Sandbox only; do not submit real customer, employee or confidential purchase information. The current prototype has no end-user authentication or tenant isolation.

## 2. Mandatory PayPal + AI requirement

- [ ] Real OpenAI Responses API run is shown; no deterministic fallback is misrepresented as model output.
- [ ] The AI uses the approved catalogue search and offer scoring tools.
- [ ] PayPal Developer Sandbox app credentials are configured server-side.
- [ ] The browser has only the public Sandbox client ID.
- [ ] Real PayPal Orders v2 order creation succeeds.
- [ ] PayPal JavaScript SDK v6 buyer approval succeeds.
- [ ] Backend re-fetches and verifies order identity, amount, currency and exact items before capture.
- [ ] Server-side capture succeeds and returns a real capture ID.
- [ ] No live-money transaction is used in the hackathon demo.

## 3. Authorization and evidence

- [ ] Production Ed25519 keys are generated and configured.
- [ ] Mandate includes buyer-intent digest, expiry, scope and exact-cart commitment.
- [ ] Commitment includes SKU, quantity, integer-cent price and currency.
- [ ] Modified SKU, quantity, price or currency is rejected by the actual order route.
- [ ] Expired/invalid/consumed mandate is rejected.
- [ ] Budget, category, merchant and catalogue delivery constraints are enforced server-side.
- [ ] Duplicate capture callback/request cannot create a second charge or conflicting capture record.
- [ ] Purchase Proof matches persisted mandate, order and capture values.
- [ ] Hash-linked audit chain status is verified in the proof panel.

## 4. Sponsor integrations — select only if genuinely used

- [ ] Channel3: show a successful live API response, source, retrieval time, reported currency and unknown-safe availability.
- [ ] AG Grid/AG Studio: show actual interactive grid/Studio experience and read-only assistant using real AgentPay data.
- [ ] Render: show a deployed Workflow run and idempotent authenticated reconciliation callback.
- [ ] PayPal MCP: if claiming it, show a real read-only MCP tool call; it is optional and disabled by default.
- [ ] APIMatic: do not select its prize unless the Context Plugin was actually used on the PayPal integration and provenance is documented.

## 5. Hosting and judge testing

- [ ] Hosted frontend and backend are reachable from a clean browser session.
- [ ] `/api/health` reports ready.
- [ ] PostgreSQL schema applies cleanly on the deployed database.
- [ ] Judge instructions include test flow and Sandbox buyer credentials if required by the project configuration.
- [ ] Demo remains available free of charge and without restrictions during the judging period.
- [ ] Any temporary keys/credits required for testing remain valid during judging.

## 6. Devpost package

- [ ] English project description accurately describes current working functionality.
- [ ] Public repository URL is correct.
- [ ] Hosted demo URL or complete reproducible run instructions are provided.
- [ ] Public YouTube video is under three minutes and shows the real application working.
- [ ] Video includes actual PayPal Sandbox authorization and capture, not a mocked success state.
- [ ] Video shows an actual tamper rejection before PayPal order creation.
- [ ] Video contains no exposed secrets or unlicensed third-party trademarks/music/material.
- [ ] Built-with tools list contains only tools actually used in the submitted version.
- [ ] Entrant eligibility, project originality/newness and all declarations are answered truthfully.
- [ ] Sponsor prize checkboxes are selected only when their requirements are genuinely met.
- [ ] Project and submission are frozen after the official deadline as instructed by the hackathon update.

## Rule reminder

The official rules control over this checklist and any hackathon promotional page. Confirm the current rules and deadline in Devpost before final submission.

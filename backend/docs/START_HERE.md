# Start here — local judge setup

## 1. Accounts and services

Create a PayPal Developer Sandbox app, an OpenAI API key and a PostgreSQL database. Channel3, AG Studio licensing and Render are optional integrations; configure them only if they are used in the demo.

## 2. Environment files

From the repository root:

```bash
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env.local
```

Put the PayPal Sandbox public Client ID in `frontend/.env.local`. Put PayPal Client ID/Secret, OpenAI key, PostgreSQL URL, mandate signing keys and other server credentials in `backend/.env.local` only.

Generate stable mandate keys:

```bash
npm run keys:generate
```

Copy the printed Base64 values into the two `MANDATE_*_KEY_B64` variables. Never commit private signing keys.

## 3. Install and initialize

```bash
npm install
npm run db:schema
npm run smoke
```

## 4. Run services

Terminal 1:

```bash
npm run dev:backend
```

Terminal 2:

```bash
npm run dev:frontend
```

Frontend: `http://localhost:3000`  
Backend: `http://localhost:4000`

## 5. Run the main workflow

Use this sample scenario:

> Buy six ergonomic office chairs for our new team. Stay under $1,500, arrive within four days, and prefer catalogue items carrying the recycled-material sample tag (not a certification).

Click **Run Agent**. Check that the actual AI mode is `openai-tools`, the mandate has a signed fingerprint and cart commitment, and the policy passes. Local catalogue prices and shipping estimates are synthetic fixtures; the Channel3 panel shows timestamped external observations when the API key is set; these are not live quotes or PayPal checkout items.

## 6. Verify the tamper block

Use the tamper-test control in the UI. It sends an altered quantity to the same `/api/paypal/create-order` endpoint used by checkout. Expected result: HTTP 403, `blocked: true`, `paypalOrderCreated: false`, and a `BLOCKED_TAMPER_ATTEMPT` event in the decision ledger. This is an order-route test, not a mock policy-only demonstration.

## 7. PayPal Sandbox transaction

Use a Sandbox buyer account. Restore the exact signed cart, approve the PayPal checkout, then verify the completed capture ID and amount. Refresh Purchase Proof and confirm that the proof matches the persisted order and capture. Do not use live credentials or real money.

## 8. Optional integrations

- **Channel3:** configure `CHANNEL3_API_KEY` and `CHANNEL3_USER_ID`; show a successful external API result.
- **AG Studio:** configure OpenAI and any required AG Studio license key; check the read-only assistant and real data sources.
- **PayPal MCP:** set `PAYPAL_MCP_ENABLED=true` to attempt the optional sandbox remote MCP read-only tool. It may require a valid remote MCP authorization setup; if it fails, keep it disabled and do not claim it.
- **Render Workflow:** deploy the workflow service. Configure `RENDER_API_KEY`, `RENDER_WORKFLOW_TASK_SLUG`, `AGENTPAY_PUBLIC_URL` and the same `WORKFLOW_SHARED_SECRET` on both services.
- **APIMatic:** only claim if the Context Plugin was genuinely used during PayPal integration work.

## 9. Production-like checks for judging

```bash
npm run smoke
npm run build:backend
npm run build:frontend
npm run workflows:build
```

These commands do not replace the live tests above. A clean deployment, real PayPal Sandbox payment and public demo URL must be completed by the entrant before submission. The public prototype endpoints are unauthenticated; use synthetic requests and Sandbox credentials only.

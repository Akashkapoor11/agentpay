# AgentPay demo script — target 2:55

Record only a real working build. Use a PayPal Sandbox buyer account and show the application running on its intended device. The YouTube video must be public and under three minutes for the hackathon.

## Scenario

> Buy 6 ergonomic office chairs for our new team. Stay under $1,500, arrive within 4 days, and prefer catalogue items carrying the recycled-material sample tag (not a certification).

The local catalogue is synthetic demo data. Say so on-screen or in narration. If Channel3 is configured, show actual returned observations with their reported currency and retrieval timestamp; do not call them a verified market benchmark.

## Timed sequence

### 0:00–0:10 — Problem

Show the AgentPay home screen. Say: “AI agents can prepare purchases, but a business still needs proof that the exact purchase stayed within the authority it granted.”

### 0:10–0:30 — AI procurement

Enter the scenario and run the agent. Show `openai-tools` mode, structured buyer constraints and selected catalogue cart. If the application is in deterministic fallback mode, do not describe it as a live AI run. State that local catalogue prices and delivery estimates are illustrative.

### 0:30–0:50 — Channel3 market context

Open the Channel3 market table. Show a real returned offer, retailer, reported price/currency, availability status and retrieval time. Explain that external offers are context only; they are not silently converted into PayPal checkout inventory.

### 0:50–1:10 — Signed purchase authority

Show the mandate fingerprint, intent digest, exact-cart commitment, budget ceiling and expiry. Explain that the signature and cart commitment are checked again on the backend.

### 1:10–1:28 — Adversarial block

Use the tamper-test control to submit a changed SKU or quantity through the actual `/api/paypal/create-order` endpoint. Show HTTP 403, `paypalOrderCreated: false`, and the blocked security event in the evidence ledger. Do not describe a simulated local policy check as an actual order-route test.

### 1:28–2:08 — PayPal Sandbox checkout

Restore the exact signed cart. Create a PayPal Sandbox order, show buyer approval, then show the backend-confirmed completed capture. Show the real order ID and capture ID from the response.

### 2:08–2:32 — Purchase Proof

Refresh the proof panel. Show exact amount/currency, mandate fingerprint, cart commitment, PayPal IDs and audit-chain verification. Download the JSON record only if time permits.

### 2:32–2:48 — AG Grid / AG Studio

Switch to the decision ledger or market table, then show the AG Studio read-only analytics assistant working on the actual AgentPay dataset. Ask one short question such as: “Summarise the purchase policy and the completed capture evidence.” Do not show a static/mock response or imply the analytics agent can approve or execute payments.

### 2:48–2:55 — Close

Say: “AgentPay connects buyer intent to a verified PayPal capture. AI prepares the purchase; the server enforces the mandate; the buyer stays in control.”

## Recording rules

- Keep the video under 3:00, ideally 2:50–2:55.
- Upload to YouTube and set visibility to Public.
- Show the product functioning, not a slide deck or static mockup.
- Do not show secrets, account credentials, browser password managers or private customer data.
- Use only owned or permitted footage, assets and audio.
- Do not show an unconfigured integration as if it were working.

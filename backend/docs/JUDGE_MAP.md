# Judge map — AgentPay 2.0

## Stage One: viability

AgentPay is a web application that meaningfully uses both AI and the PayPal Developer Platform. The AI runs through OpenAI Responses API function tools. The payment path uses PayPal Sandbox Orders API v2, PayPal JavaScript SDK v6 buyer approval and server-side capture. A local smoke test is not a substitute for demonstrating the live Sandbox flow; the entrant must complete that test before submission.

## Equally weighted judging criteria

### Technological implementation

- Structured OpenAI tool-calling workflow and deterministic fallback path.
- Optional live Channel3 API integration for timestamped external product observations (short-lived affiliate URLs are not stored).
- Ed25519 mandate signature, SHA-256 intent digest and exact-cart commitment.
- Deterministic server-side authorization and policy revalidation.
- PayPal order fetch, amount/currency/item verification and capture.
- PostgreSQL persistence, append-only hash-linked decision events and idempotent reconciliation record.

### Design

- One visible request → market context → signed mandate → PayPal checkout → proof workflow.
- AG Grid views for catalogue, Channel3 observations and event history.
- AG Studio read-only analytics assistant using persisted dashboard data.
- Purchase Proof receipt with clear transaction and evidence identifiers.

### Potential impact

The target user is a small business/team that delegates purchase research to AI but needs hard spending, product and delivery boundaries. The prototype illustrates how authorization and transaction evidence can be preserved when an AI agent prepares a purchase.

### Innovation / idea

The differentiator is connecting pre-purchase intent and exact-cart authorization to post-capture proof. Market context is visible, but external offers cannot silently become PayPal checkout inventory. The model never controls the final amount or overrides the server policy.

### Presentation

The best demo order is real AI run → Channel3 observations (if configured) → mandate → actual order-route tamper block → real PayPal Sandbox approval/capture → verified Purchase Proof.

## Sponsor readiness notes

- **AG Grid / AG Studio:** AG Grid powers interactive data tables. AG Studio is embedded with a server-side OpenAI adapter and read-only analytics intent. Verify the deployed Studio works and meets the current sponsor requirements before selecting its prize.
- **Channel3:** only claim when a successful live Channel3 API response is shown and used as visible external product context.
- **Render:** only claim after a deployed workflow is invoked by capture and completes authenticated idempotent reconciliation.
- **PayPal MCP:** optional, disabled by default; only read-only tools are allowed. Claim use only after showing a real successful MCP call.
- **APIMatic:** requires actual Context Plugin use during PayPal integration work and retained provenance. Source code alone does not establish use.

## Prize stacking

The official rules limit an eligible project to one Grand Prize plus one Sponsor Prize, or one Honorable Mention plus one Sponsor Prize. Do not imply multiple sponsor/Grand Prize awards can be stacked beyond the rule.

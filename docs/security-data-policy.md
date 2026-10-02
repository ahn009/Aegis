# Security data handling policy and release gates

Status: engineering policy for the production build, 2026-10-02. Customer data retention periods and deletion requests require an operator decision before live traffic.

## Access and tenant boundary

- A session selects one active organization. Every dashboard read and mutation must derive that organization from the session, and foreign resource IDs return 404. Mutations require an exact same-origin `Origin` header; role gates apply to staff writes and sensitive reads.
- Provider callbacks must pass Twilio signature and account checks. A signed destination selects the tenant; caller-supplied organization IDs have no authority. Receipt payloads store provider IDs and destination only, never SMS body, sender phone, transcripts, or credentials.
- Only managers and above can read the complete audit log. Worker error text requires administrator access. The production simulator and live webhooks remain disabled until the real integration gates pass.

## Durability

- A provider callback receipt is committed in the same database transaction as its local business changes. A failed transaction leaves no receipt so retry can work; a committed receipt is deduplicated. Provider sends and other external effects require their own idempotency boundary in Phases 2–3.
- Staff lead status, appointment confirmation/cancellation, and rule draft/publish writes commit with their audit row in one transaction. Contact and lead creation/updates, appointment creation, and expired-hold cancellation do the same. Appointment creation also enqueues its reminder or hold-expiry jobs in that transaction. An audit failure rolls back the business change; isolated failure-injection tests cover these paths.
- Simulated SMS records, inbound STOP/START changes, direct call creation, worker retry state, and unreachable-transfer follow-up jobs now commit with their audit rows. AI tool attempts, including successful attempts, require an audit write before returning a result. The best-effort audit helper has been removed.
- AI tool attempt rows are still written after their domain mutations, and worker dispatch completion is not atomic with external effects. A process crash between those steps can leave incomplete attempt history or duplicate effects. Production release requires a durable turn/outbox boundary and reconciliation tests (P1-03/P1-04/P1-01). Do not claim a complete action history before that gate passes.
- Audit writers redact keys that indicate phone, email, address, token, password, secret, or credentials; rule draft audits use the same redaction. This is key-based minimization, so free-text fields can still contain personal data. Route roles restrict audit reads, while database operator access remains governed by the eventual hosting configuration.

## Retention and deletion

- Login admission counters expire after 15 minutes and the worker prunes expired rows hourly. Legacy login-attempt rows are pruned on the same schedule.
- Webhook receipts currently retain provider IDs and destination without an automatic deletion job. Call, SMS, transcript, contact, appointment, and audit records currently have no production retention/deletion schedule. The operator must choose periods, legal hold rules, and deletion authority before live traffic; Phase 3 must implement and test those rules with backups and restore behavior.
- Historical Git database blobs are demo fixtures only. Production must start from a fresh empty database; never restore historical blobs into production.

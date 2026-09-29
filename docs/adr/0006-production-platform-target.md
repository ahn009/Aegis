# ADR 0006: Working production platform target

Status: proposed for implementation; provider accounts and deployment are not authorized by this document.

The first production release covers both live inbound voice/SMS and the dashboard with AI agents for daily operations. OpenAI is the selected AI provider. The operator wants service-level enable/disable controls in a later product increment; the first release still has to meet the live service gates.

## Working choices

- **Telephony and SMS:** Twilio. The current webhook naming and data model already use Twilio SIDs, and Twilio documents Voice TwiML, message status callbacks, and signed webhook validation. A provider interface should keep the business domain independent of Twilio.
- **Application hosting:** paid Render web service and separate background worker in Ohio, USA. Render supports both service types and a shared regional private network. A free web service sleeps when idle and is unsuitable for inbound-call webhooks.
- **Database:** managed Render Postgres in the same region, with a versioned migration from the SQLite prototype. Enable backup/restore and evaluate high availability against the launch service level.
- **AI:** OpenAI API, with production model and spend limits set during integration testing. Do not fall back to a mock provider for live requests.

These choices are a concrete implementation target, not a purchase or cutover. The existing SQLite schema and worker cannot be deployed unchanged on this topology. Phase 3 owns the database migration, transaction semantics, and backup drill; Phase 6 owns the Render blueprint, staging deployment, latency checks, and rollback. A different region can be selected before any resources are created if the first customers are outside the current DFW prototype market.

Sources: [Render regions](https://render.com/docs/regions), [Render background workers](https://render.com/docs/background-workers), [Render Postgres backups](https://render.com/docs/postgresql-backups), [Render free-service limits](https://render.com/docs/free), [Twilio Voice TwiML](https://www.twilio.com/docs/voice/twiml), [Twilio messaging webhooks](https://www.twilio.com/docs/usage/webhooks/messaging-webhooks), [Twilio webhook validation](https://www.twilio.com/docs/usage/webhooks/webhooks-faq).

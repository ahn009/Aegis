// scripts/worker.ts — standalone outbox worker (polling loop).
// Run: bun run worker
import { processOutbox } from "../src/lib/worker/outbox";
import { db } from "../src/lib/db";

const POLL_MS = 15_000;

async function loop() {
  console.log("[worker] outbox processor started (poll every %dms)", POLL_MS);
  while (true) {
    try {
      const res = await processOutbox(100);
      if (res.processed > 0) {
        console.log("[worker] processed=%d ok=%d failed=%d dead=%d %s",
          res.processed, res.succeeded, res.failed, res.deadLettered,
          JSON.stringify(res.byEventType));
      }
    } catch (e) {
      console.error("[worker] loop error:", e);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

loop().catch((e) => {
  console.error("[worker] fatal:", e);
  process.exit(1);
});

// graceful shutdown
process.on("SIGINT", async () => {
  console.log("[worker] shutting down...");
  await db.$disconnect();
  process.exit(0);
});

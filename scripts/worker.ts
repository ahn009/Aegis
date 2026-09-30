// scripts/worker.ts — standalone outbox worker (polling loop).
// Run: npm run worker
import { processOutbox } from "../src/lib/worker/outbox";
import { db } from "../src/lib/db";
import { validateProductionConfig } from "../src/lib/production-config";
import { pruneExpiredLoginAttempts } from "../src/lib/rate-limit";

validateProductionConfig();

const POLL_MS = 15_000;
const LOGIN_ATTEMPT_CLEANUP_MS = 60 * 60 * 1000;
let lastLoginAttemptCleanup = 0;

async function loop() {
  console.log("[worker] outbox processor started (poll every %dms)", POLL_MS);
  while (true) {
    if (Date.now() - lastLoginAttemptCleanup >= LOGIN_ATTEMPT_CLEANUP_MS) {
      try {
        const pruned = await pruneExpiredLoginAttempts();
        if (pruned) console.log("[worker] pruned %d expired login attempts", pruned);
        lastLoginAttemptCleanup = Date.now();
      } catch (error) {
        console.error("[worker] login attempt cleanup error:", error);
      }
    }
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

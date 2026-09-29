// scripts/simulate-call.ts
// SPEC final deliverable: drives a full conversation through the MockProvider
// using a fake Twilio webhook payload — greeting → intake → area validation →
// booking — with NO Twilio/OpenAI account required.
//
// Run:  bun run simulate-call
//       bun run simulate-call --emergency    # exercises the emergency path
//       bun run simulate-call --out-of-area  # exercises the out-of-area path
import { db } from "../src/lib/db";
import { runTurn } from "../src/lib/ai/orchestrator";
import { createMockProvider } from "../src/lib/ai/provider-mock";
import { startInboundCall } from "../src/lib/domain/calls";
import { randomToken } from "../src/lib/crypto";

const args = new Set(process.argv.slice(2));
const EMERGENCY = args.has("--emergency");
const OUT_OF_AREA = args.has("--out-of-area");

async function main() {
  const org = await db.organization.findUnique({ where: { slug: "dfw-velora-hvac" } });
  if (!org) {
    console.error("Org not found. Run `bun run seed` first.");
    process.exit(1);
  }

  // Fake Twilio webhook payload
  const fromPhone = OUT_OF_AREA ? "+13105550143" : "+12145559999";
  const callSid = "CA" + randomToken(16).replace(/[^a-zA-Z0-9]/g, "").slice(0, 32);
  console.log("━━━ Simulated inbound call ━━━");
  console.log(`CallSid:    ${callSid}`);
  console.log(`From:       ${fromPhone}`);
  console.log(`To:         ${org.defaultPhone}`);
  console.log(`Mode:       ${EMERGENCY ? "EMERGENCY" : OUT_OF_AREA ? "OUT-OF-AREA" : "NORMAL"}`);
  console.log("");

  const { call, conversation } = await startInboundCall({
    organizationId: org.id,
    callSid,
    fromPhone,
    toPhone: org.defaultPhone ?? "",
  });
  const provider = createMockProvider();

  // Scripted caller utterances (deterministic demo). After these, the driver
  // pumps "yes" acknowledgements until the conversation reaches END (capped).
  const script: string[] = EMERGENCY
    ? [
        "Hi, I think I smell gas near my furnace, I'm worried.",
      ]
    : OUT_OF_AREA
    ? [
        "Hi, my name is Alex, my callback number is 310-555-0143.",
        "The service address is in Beverly Hills, 90210.",
        "I need AC repair, hopefully today.",
      ]
    : [
        "Hi, my name is Riley, my callback number is 214-555-9999.",
        "The service address is in Dallas, ZIP 75201.",
        "I need AC repair, hopefully sometime today or tomorrow.",
      ];

  let turn = 0;
  const MAX_TURNS = 12;
  const runTurnAndPrint = async (utterance: string): Promise<{ state: string; emergency: boolean }> => {
    turn++;
    console.log(`┌─ Turn ${turn} ─────────────────────────────────`);
    console.log(`│ CALLER: ${utterance}`);
    const res = await runTurn(
      { organizationId: org.id, conversationId: conversation.id, callId: call.id, callerUtterance: utterance, fromPhone },
      provider,
    );
    console.log(`│ VELORA: ${res.assistantText}`);
    console.log(`│ state:  ${res.state}  emergency=${res.emergency}`);
    if (res.toolAttempts.length) {
      for (const t of res.toolAttempts) {
        console.log(`│ tool:   ${t.tool}  valid=${t.validationOk}  ok=${t.executionOk}${t.error ? "  err=" + t.error : ""}${t.repaired ? "  (repaired)" : ""}`);
      }
    }
    console.log(`└${"─".repeat(46)}`);
    return { state: res.state, emergency: res.emergency };
  };

  for (const utterance of script) {
    const r = await runTurnAndPrint(utterance);
    if (r.emergency) {
      console.log("\n🚨 EMERGENCY detected — deterministic transfer executed. Stopping.");
      break;
    }
    if (r.state === "END") break;
  }

  // Auto-advance: pump "yes" until END (or cap). This lets the deterministic
  // state machine complete booking/requests without a human caller.
  if (!EMERGENCY) {
    while (turn < MAX_TURNS) {
      const conv = await db.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
      if (conv.state === "END") break;
      const r = await runTurnAndPrint("yes");
      if (r.state === "END") break;
    }
  }

  // Final summary
  const finalConv = await db.conversation.findUniqueOrThrow({
    where: { id: conversation.id },
    include: { call: true },
  });
  console.log("\n━━━ Conversation result ━━━");
  console.log(`final state:  ${finalConv.state}`);
  console.log(`outcome:       ${finalConv.outcome ?? "—"}`);
  const appts = await db.appointment.findMany({ where: { organizationId: org.id, callId: call.id } });
  if (appts.length) {
    console.log(`appointments:  ${appts.length}`);
    for (const a of appts) {
      console.log(`  • ${a.status} ${a.serviceType} @ ${a.startTime.toISOString()}`);
    }
  }
  const leads = await db.lead.findMany({ where: { organizationId: org.id, phoneE164: fromPhone } });
  console.log(`leads:         ${leads.length}`);
  const msgs = await db.smsMessage.findMany({ where: { organizationId: org.id, toPhone: fromPhone } });
  console.log(`sms sent:      ${msgs.length}`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error("simulate-call failed:", e);
  process.exit(1);
});

// Velora HVAC Response System — seed
// SPEC: one DFW HVAC org, supported services (AC repair, heating repair,
// maintenance, installation, inspection), business-hours + service-area +
// after-hours + escalation rules, an OWNER user (credentials printed by seed),
// sample contacts.
//
// Run: bun run seed  (or)  bun src/scripts/seed.ts
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";
import { encrypt } from "../src/lib/crypto";
import { createDraftVersion, publishVersion } from "../src/lib/rules/engine";
import { randomToken } from "../src/lib/crypto";

async function main() {
  console.log("🌱 Seeding Velora HVAC Response System...\n");

  // --- Owner user ----------------------------------------------------------
  const ownerEmail = "owner@velorahvac.example";
  const ownerPassword = "VeloraDemo2025!";
  const owner = await db.user.upsert({
    where: { email: ownerEmail },
    update: {},
    create: {
      email: ownerEmail,
      name: "Jordan Owner",
      passwordHash: hashPassword(ownerPassword),
    },
  });

  // --- DFW HVAC org --------------------------------------------------------
  const org = await db.organization.upsert({
    where: { slug: "dfw-velora-hvac" },
    update: {},
    create: {
      name: "Velora HVAC (DFW)",
      slug: "dfw-velora-hvac",
      timezone: "America/Chicago",
      defaultPhone: "+12145550100",
      transferPhone: "+12145550199",
      voicemailPhone: "+12145550188",
      encryptedCreds: encrypt(JSON.stringify({ twilioSid: "demo", twilioToken: "demo", crm: "none" })),
    },
  });

  // Membership (OWNER)
  await db.membership.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: owner.id } },
    update: { role: "OWNER" },
    create: { organizationId: org.id, userId: owner.id, role: "OWNER" },
  });

  // A second user (DISPATCHER) for RBAC demo
  const dispatcher = await db.user.upsert({
    where: { email: "dispatcher@velorahvac.example" },
    update: {},
    create: {
      email: "dispatcher@velorahvac.example",
      name: "Dana Dispatcher",
      passwordHash: hashPassword("VeloraDemo2025!"),
    },
  });
  await db.membership.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: dispatcher.id } },
    update: { role: "DISPATCHER" },
    create: { organizationId: org.id, userId: dispatcher.id, role: "DISPATCHER" },
  });

  // --- Supported services (stored as a knowledge doc tagged "services") ---
  await db.knowledgeDocument.create({
    data: {
      organizationId: org.id,
      title: "Supported Services",
      content: JSON.stringify(["AC_REPAIR", "HEATING_REPAIR", "MAINTENANCE", "INSTALLATION", "INSPECTION"]),
      tags: "services,config",
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });

  // --- Business rules ------------------------------------------------------
  // service_area: DFW ZIPs + cities
  await createAndPublish(org.id, "service_area", {
    type: "service_area",
    zips: ["75001", "75002", "75006", "75007", "75009", "75010", "75013", "75014", "75015", "75016", "75017", "75019", "75022", "75023", "75024", "75025", "75026", "75028", "75032", "75034", "75035", "75036", "75038", "75039", "75040", "75041", "75042", "75043", "75044", "75045", "75048", "75050", "75051", "75052", "75053", "75054", "75056", "75057", "75058", "75060", "75061", "75062", "75063", "75065", "75067", "75068", "75069", "75070", "75071", "75074", "75075", "75076", "75077", "75078", "75080", "75081", "75082", "75083", "75085", "75087", "75088", "75089", "75090", "75091", "75092", "75093", "75094", "75098", "75104", "75106", "75115", "75116", "75119", "75123", "75124", "75125", "75126", "75127", "75134", "75137", "75141", "75142", "75143", "75146", "75147", "75148", "75149", "75150", "75152", "75153", "75154", "75159", "75161", "75163", "75164", "75165", "75166", "75167", "75168", "75172", "75173", "75180", "75181", "75182", "75185", "75187", "75189", "75201", "75202", "75203", "75204", "75205", "75206", "75207", "75208", "75209", "75210", "75211", "75212", "75214", "75215", "75216", "75217", "75218", "75219", "75220", "75221", "75222", "75223", "75224", "75225", "75226", "75227", "75228", "75229", "75230", "75231", "75232", "75233", "75234", "75235", "75236", "75237", "75238", "75240", "75241", "75242", "75243", "75244", "75245", "75246", "75247", "75248", "75249", "75250", "75251", "75252", "75253", "75254", "75258", "75260", "75261", "75262", "75263", "75264", "75265", "75266", "75267", "75270", "75275", "75277", "75287"],
    cities: [
      { city: "Dallas", state: "TX" },
      { city: "Plano", state: "TX" },
      { city: "Frisco", state: "TX" },
      { city: "Garland", state: "TX" },
      { city: "Irving", state: "TX" },
      { city: "Arlington", state: "TX" },
      { city: "Fort Worth", state: "TX" },
      { city: "Richardson", state: "TX" },
      { city: "Carrollton", state: "TX" },
      { city: "McKinney", state: "TX" },
    ],
    allowRequestOnly: true,
  }, owner.id);

  // business_hours: Mon–Sat 8–18, Sun closed
  await createAndPublish(org.id, "business_hours", {
    type: "business_hours",
    hours: [
      { dayOfWeek: 0, open: "08:00", close: "18:00", closed: true }, // Sun
      { dayOfWeek: 1, open: "08:00", close: "18:00", closed: false },
      { dayOfWeek: 2, open: "08:00", close: "18:00", closed: false },
      { dayOfWeek: 3, open: "08:00", close: "18:00", closed: false },
      { dayOfWeek: 4, open: "08:00", close: "18:00", closed: false },
      { dayOfWeek: 5, open: "08:00", close: "18:00", closed: false },
      { dayOfWeek: 6, open: "08:00", close: "17:00", closed: false }, // Sat short
    ],
    timezone: "America/Chicago",
    bufferMinutes: 30,
  }, owner.id);

  // holidays
  await createAndPublish(org.id, "holidays", {
    type: "holidays",
    holidays: [
      { date: "2025-12-25", name: "Christmas Day" },
      { date: "2026-01-01", name: "New Year's Day" },
      { date: "2026-07-04", name: "Independence Day" },
      { date: "2026-11-26", name: "Thanksgiving Day" },
    ],
  }, owner.id);

  // after_hours
  await createAndPublish(org.id, "after_hours", {
    type: "after_hours",
    closedBehavior: "ai_intake",
    transferPhone: "+12145550199",
    allowIntakeCapture: true,
  }, owner.id);

  // escalation_routing
  await createAndPublish(org.id, "escalation_routing", {
    type: "escalation_routing",
    emergencyKeywords: ["gas smell", "carbon monoxide", "smell gas", "burning", "smoke", "sparking", "active water", "flooding", "electrical hazard"],
    urgentKeywords: ["no heat", "no ac", "no cooling", "no heating", "freezing", "burst pipe", "leak"],
    emergencyTransferPhone: "+12145550911",
    emergencyVoicemailPhone: "+12145550188",
    staffNotifyEmail: "staff@velorahvac.example",
    urgentTransferPhone: "+12145550199",
  }, owner.id);

  // missed_call_recovery
  await createAndPublish(org.id, "missed_call_recovery", {
    type: "missed_call_recovery",
    enabled: true,
    permittedHoursStart: 8,
    permittedHoursEnd: 20,
    textBackTemplate: "Hi, this is Velora HVAC — we missed your call. How can we help? Reply STOP to opt out.",
    windowHours: 4,
    createLead: true,
  }, owner.id);

  // --- Sample contacts -----------------------------------------------------
  const sampleContacts = [
    { name: "Maria Gonzalez", phone: "+12145551234", zip: "75201", city: "Dallas", state: "TX", street: "123 Main St" },
    { name: "James Patel", phone: "+19725557890", zip: "75024", city: "Plano", state: "TX", street: "456 Oak Ave" },
    { name: "Sarah Kim", phone: "+18175553421", zip: "75034", city: "Frisco", state: "TX", street: "789 Elm Dr" },
    { name: "Out Ofarea", phone: "+12145550000", zip: "90210", city: "Beverly Hills", state: "CA", street: "1 Rodeo Dr" },
  ];
  for (const c of sampleContacts) {
    await db.contact.upsert({
      where: { organizationId_phoneE164: { organizationId: org.id, phoneE164: c.phone } },
      update: {},
      create: {
        organizationId: org.id,
        phoneE164: c.phone,
        name: c.name,
        addressZip: c.zip,
        addressCity: c.city,
        addressState: c.state,
        addressStreet: c.street,
      },
    });
  }

  // --- A sample call + conversation (for the dashboard) -------------------
  const sampleCall = await db.call.create({
    data: {
      organizationId: org.id,
      callSid: "CA" + randomToken(16).replace(/[^a-zA-Z0-9]/g, "").slice(0, 32),
      direction: "inbound",
      fromPhone: "+12145551234",
      toPhone: "+12145550100",
      status: "COMPLETED",
      urgency: "ROUTINE",
      serviceType: "AC_REPAIR",
      durationSeconds: 184,
      endedAt: new Date(Date.now() - 3600_000),
    },
  });
  await db.conversation.create({
    data: {
      organizationId: org.id,
      callId: sampleCall.id,
      state: "END",
      outcome: "BOOKED",
      summary: "AC repair appointment booked for Maria Gonzalez.",
    },
  });

  // --- Print credentials ---------------------------------------------------
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ Seed complete.");
  console.log("");
  console.log("Organization:");
  console.log(`  name: ${org.name}`);
  console.log(`  slug: ${org.slug}`);
  console.log(`  id:   ${org.id}`);
  console.log("");
  console.log("OWNER credentials (printed by seed per SPEC):");
  console.log(`  email:    ${ownerEmail}`);
  console.log(`  password: ${ownerPassword}`);
  console.log("");
  console.log("Dispatcher (RBAC demo):");
  console.log(`  email:    dispatcher@velorahvac.example`);
  console.log(`  password: VeloraDemo2025!`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

async function createAndPublish(orgId: string, ruleType: any, data: any, actorId: string) {
  const { id, version } = await createDraftVersion(orgId, ruleType, data, actorId);
  await publishVersion(orgId, ruleType, version, actorId);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

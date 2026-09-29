// Create the first organization and owner on an empty database.
// Provide all VELORA_BOOTSTRAP_* values through the deployment secret manager.
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const name = required("VELORA_BOOTSTRAP_ORG_NAME");
  const slug = required("VELORA_BOOTSTRAP_ORG_SLUG");
  const timezone = required("VELORA_BOOTSTRAP_TIMEZONE");
  const email = required("VELORA_BOOTSTRAP_OWNER_EMAIL").toLowerCase();
  const ownerName = required("VELORA_BOOTSTRAP_OWNER_NAME");
  const password = required("VELORA_BOOTSTRAP_OWNER_PASSWORD");

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Organization slug must use lowercase letters, numbers, and hyphens");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Owner email is invalid");
  if (password.length < 16 || password.length > 1024) throw new Error("Owner password must be 16–1024 characters");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new Error("Organization timezone must be a valid IANA timezone");
  }

  const existing = await Promise.all([db.organization.count(), db.user.count()]);
  if (existing.some((count) => count > 0)) throw new Error("Bootstrap requires an empty database; existing organizations or users were found");

  const result = await db.$transaction(async (tx) => {
    const organization = await tx.organization.create({ data: { name, slug, timezone } });
    const user = await tx.user.create({ data: { email, name: ownerName, passwordHash: hashPassword(password) } });
    await tx.membership.create({ data: { organizationId: organization.id, userId: user.id, role: "OWNER" } });
    return { organization, user };
  });

  console.log(`Created organization ${result.organization.slug} and owner ${result.user.email}. Configure business rules and integrations before enabling live traffic.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Bootstrap failed");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

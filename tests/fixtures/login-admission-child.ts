import { db } from "../../src/lib/db";
import { consumeLoginAttempt } from "../../src/lib/rate-limit";

const email = process.argv[2];
if (!email) throw new Error("Missing login identifier");

async function main() {
  try {
    const accepted: boolean[] = [];
    for (let index = 0; index < 3; index++) {
      accepted.push((await consumeLoginAttempt(email)).ok);
    }
    process.stdout.write(JSON.stringify(accepted));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const testDir = mkdtempSync(join(tmpdir(), "velora-test-"));
const testEnv = {
  ...process.env,
  DATABASE_URL: `file:${join(testDir, "test.db")}`,
  VELORA_TEST_DATABASE: "1",
};

function run(binary, args) {
  const result = spawnSync(join(root, "node_modules", ".bin", binary), args, {
    cwd: root,
    env: testEnv,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Using isolated test database: ${testDir}`);
run("prisma", ["db", "push", "--schema", "prisma/schema.prisma"]);
run("vitest", process.argv.includes("--watch") ? ["--watch"] : ["run"]);

// Wipes the database DATABASE_URL (or TURSO_*) points at and loads the demo data.
// Run once from your own machine: a remote database is too slow to seed inside a serverless request.
//   npm run db:seed            (asks first)       npm run db:seed -- --yes   (no prompt)
import readline from "node:readline/promises";
import { config } from "@/lib/config";
import { storageKind } from "@/lib/repo";
import { resetDemo } from "@/lib/seed";

function target(): string {
  const url = config.postgres.url || config.turso.url;
  if (!url) return `local file ${config.databasePath}`;
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "(unreadable connection string)";
  }
}

async function main() {
  console.log(`Backend: ${storageKind()} · ${target()}`);
  if (!process.argv.includes("--yes")) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question("This deletes all jobs and demo data in that database. Continue? (y/N) ");
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log("Cancelled.");
      return;
    }
  }
  const t0 = Date.now();
  await resetDemo();
  console.log(`Done in ${Math.round((Date.now() - t0) / 1000)}s. Redeploy or reload the app.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

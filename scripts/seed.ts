import "dotenv/config";
import { seedDemo } from "../src/server/seed";

const reset = process.argv.includes("--reset");
seedDemo({ reset })
  .then((r) => {
    console.log(r.skipped ? `Demo data already present (${r.profiles} demo profiles). Use --reset to reload.` : `Seeded ${r.profiles} synthetic demo profiles and ${r.jobs} demo jobs.`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

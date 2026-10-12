import "dotenv/config";
import { runScan } from "../src/server/scan";

runScan({ trigger: "SCHEDULED" })
  .then((r) => {
    console.log(`Scan ${r.status}: ${r.jobsSeen} seen, ${r.jobsNew} new, ${r.jobsClosed} closed.`);
    const errs = JSON.parse(r.errorsJson) as string[];
    for (const e of errs) console.log(`  ! ${e}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

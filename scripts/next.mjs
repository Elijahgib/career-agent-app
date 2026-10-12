// Cross-platform launcher that runs the Next.js CLI with telemetry disabled.
// (Next.js collects anonymous telemetry by default; this app opts out.)
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const bin = require.resolve("next/dist/bin/next");
const child = spawn(process.execPath, [bin, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});
child.on("exit", (code) => process.exit(code ?? 0));

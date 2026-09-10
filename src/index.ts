#!/usr/bin/env node

import { runCli } from "./cli/commands.js";

runCli(process.argv.slice(2), process.argv[1]).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`gitguard: ${message}`);
  process.exitCode = 2;
});

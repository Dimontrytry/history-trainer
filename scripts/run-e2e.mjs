import { runWithDisplay } from "./display.mjs";
process.exitCode = await runWithDisplay(process.execPath, [
  "node_modules/@playwright/test/cli.js",
  "test",
]);

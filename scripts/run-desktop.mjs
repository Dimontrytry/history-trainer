import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { runWithDisplay } from "./display.mjs";
const require = createRequire(import.meta.url);
const args = process.argv.slice(2),
  dev = args.includes("--dev");
const root =
  process.env.HISTORY_TRAINER_DATA_DIR || resolve(".local/development-profile");
mkdirSync(root, { recursive: true });
process.exitCode = await runWithDisplay(
  dev ? process.execPath : require("electron"),
  dev
    ? [
        "node_modules/electron-vite/bin/electron-vite.js",
        ...args.filter((a) => a !== "--dev"),
      ]
    : ["."],
  { HISTORY_TRAINER_DATA_DIR: root },
);

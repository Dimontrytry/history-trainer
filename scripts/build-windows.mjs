import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";

mkdirSync("test-results", { recursive: true });
const log = createWriteStream("test-results/windows-build.log");
let tail = "";
const child = spawn(
  process.execPath,
  ["node_modules/electron-builder/cli.js", "--win", "nsis", "--x64"],
  { env: process.env, stdio: ["ignore", "pipe", "pipe"] },
);
function capture(data, output) {
  const text = String(data);
  output.write(text);
  log.write(text);
  tail = (tail + text).slice(-12000);
}
child.stdout.on("data", (data) => capture(data, process.stdout));
child.stderr.on("data", (data) => capture(data, process.stderr));
child.on("error", (error) => {
  capture(String(error) + "\n", process.stderr);
});
child.on("close", (code) => {
  if (code !== 0 && process.env.GITHUB_ACTIONS === "true") {
    const message = tail
      .replace(/%/g, "%25")
      .replace(/\r/g, "%0D")
      .replace(/\n/g, "%0A");
    console.log(`::error title=Windows packaging failed::${message}`);
  }
  log.end(() => {
    process.exitCode = code ?? 1;
  });
});

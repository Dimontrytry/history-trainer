import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export async function runWithDisplay(executable, args, extraEnv = {}) {
  let display;
  const env = { ...process.env, ...extraEnv };
  if (process.platform === "linux" && !env.DISPLAY) {
    const local = resolve(".local/linux/usr/bin/Xvfb");
    display = spawn(
      existsSync(local) ? local : "Xvfb",
      ["-displayfd", "3", "-screen", "0", "1440x1000x24", "-nolisten", "tcp"],
      { stdio: ["ignore", "ignore", "pipe", "pipe"] },
    );
    let diagnostic = "";
    display.stderr.on("data", (data) => {
      diagnostic = (diagnostic + String(data)).slice(-4000);
    });
    const number = await new Promise((ok, no) => {
      const timer = setTimeout(() => {
        display.kill();
        no(new Error("Xvfb не запустился: " + diagnostic));
      }, 10000);
      display.on("error", (error) => {
        clearTimeout(timer);
        no(error);
      });
      display.stdio[3].once("data", (data) => {
        clearTimeout(timer);
        ok(String(data).trim());
      });
      display.once("exit", (code) => {
        clearTimeout(timer);
        no(new Error("Xvfb завершился: " + code + " " + diagnostic));
      });
    });
    env.DISPLAY = ":" + number;
  }
  const child = spawn(executable, args, { stdio: "inherit", env });
  const stop = () => {
    child.kill();
    display?.kill();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  return new Promise((ok, no) => {
    child.on("exit", (code) => {
      display?.kill();
      ok(code ?? 1);
    });
    child.on("error", (error) => {
      display?.kill();
      no(error);
    });
  });
}

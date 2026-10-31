import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
const require = createRequire(import.meta.url);
// The pinned SQLite 13 and sharp packages ship verified Node-API binaries.
// Check the real runtime instead of rebuilding these as ABI-specific addons.
const install = spawnSync(
  process.execPath,
  [require.resolve("electron/install.js")],
  { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } },
);
if (install.status !== 0) process.exit(install.status ?? 1);
const electron = require("electron");
const result = spawnSync(
  electron,
  [
    "-e",
    `const db=require('better-sqlite3')(':memory:');if(db.prepare('select 42 as n').get().n!==42)throw Error('SQLite check failed');db.close();require('sharp')({create:{width:2,height:2,channels:3,background:'#fff'}}).png().toBuffer().then(()=>console.log('Electron: SQLite and image decoder OK')).catch(e=>{console.error(e);process.exitCode=1})`,
  ],
  { stdio: "inherit", env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } },
);
process.exit(result.status ?? 1);

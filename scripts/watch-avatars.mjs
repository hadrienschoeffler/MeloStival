import { watch } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const avatarsDir = path.join(projectRoot, "client", "public", "avatars");
const generator = path.join(projectRoot, "scripts", "generate-avatars.mjs");
let timer = null;
let running = false;
let rerun = false;

function generate() {
  if (running) {
    rerun = true;
    return;
  }

  running = true;
  const child = spawn(process.execPath, [generator], {
    cwd: projectRoot,
    stdio: "inherit",
  });

  child.on("exit", () => {
    running = false;
    if (rerun) {
      rerun = false;
      generate();
    }
  });
}

watch(avatarsDir, { persistent: true }, () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(generate, 120);
});

console.log("[MeloStival] Surveillance des avatars active.");

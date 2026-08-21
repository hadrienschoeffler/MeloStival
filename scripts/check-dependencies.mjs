import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeModules = path.join(projectRoot, "node_modules");

function fail() {
  console.error("\n[MeloStival] Les dépendances npm du projet ne sont pas installées.");
  console.error("Exécute depuis la racine du projet : npm install");
  console.error("Puis relance ta commande.\n");
  process.exit(1);
}

if (!existsSync(nodeModules)) fail();

const checks = [
  [path.join(projectRoot, "package.json"), "typescript/package.json"],
  [path.join(projectRoot, "package.json"), "concurrently/package.json"],
  [path.join(projectRoot, "server", "package.json"), "express/package.json"],
  [path.join(projectRoot, "server", "package.json"), "socket.io/package.json"],
  [path.join(projectRoot, "client", "package.json"), "react/package.json"],
  [path.join(projectRoot, "client", "package.json"), "vite/package.json"],
];

for (const [packageJsonPath, dependency] of checks) {
  try {
    createRequire(packageJsonPath).resolve(dependency);
  } catch {
    fail();
  }
}

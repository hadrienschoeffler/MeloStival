import { readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const avatarsDir = path.join(projectRoot, "client", "public", "avatars");
const outputDir = path.join(projectRoot, "client", "src", "generated");
const outputFile = path.join(outputDir, "avatars.ts");
const supportedExtensions = new Set([".webp", ".png", ".jpg", ".jpeg", ".svg"]);

await mkdir(avatarsDir, { recursive: true });
await mkdir(outputDir, { recursive: true });

const entries = await readdir(avatarsDir, { withFileTypes: true });
const files = entries
  .filter((entry) => entry.isFile() && supportedExtensions.has(path.extname(entry.name).toLowerCase()))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b, "fr", { numeric: true, sensitivity: "base" }));

if (files.length === 0) {
  console.error("\n[MeloStival] Aucun avatar trouvé dans client/public/avatars/.");
  console.error("Ajoute au moins un fichier .webp, .png, .jpg, .jpeg ou .svg puis relance la commande.\n");
  process.exit(1);
}

const avatars = files.map((fileName) => {
  const label = path.basename(fileName, path.extname(fileName)).replace(/[-_]+/g, " ").trim() || "Avatar";
  return {
    id: fileName,
    label,
    src: `/avatars/${encodeURIComponent(fileName)}`,
  };
});

const source = `// Fichier généré automatiquement par scripts/generate-avatars.mjs.\n// Ne pas modifier manuellement.\n\nexport interface AvatarOption {\n  id: string;\n  label: string;\n  src: string;\n}\n\nexport const AVATARS: AvatarOption[] = ${JSON.stringify(avatars, null, 2)};\n`;

await writeFile(outputFile, source, "utf8");
console.log(`[MeloStival] ${files.length} avatar(s) détecté(s).`);

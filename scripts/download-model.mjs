import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { resolve } from "node:path";

const ASSETS_DIR = resolve(process.cwd(), "assets");

const BASE = "https://zenodo.org/records/20703646/files/";
const FILES = [
  { name: "BirdNET+_V3.0-preview3.1_Global_11K_FP16_pruned.onnx", approxBytes: 71528628 },
  { name: "BirdNET+_V3.0-preview3.1_Global_11K_Labels.csv", approxBytes: 809172 },
];

const FORCE = process.argv.includes("--force");

function mb(bytes) {
  return `${(bytes / 1048576).toFixed(1)} MiB`;
}

async function download(file) {
  const target = resolve(ASSETS_DIR, file.name);

  if (existsSync(target) && !FORCE) {
    const size = statSync(target).size;
    if (Math.abs(size - file.approxBytes) < 1024) {
      console.log(`have    ${file.name}  (${mb(size)})`);
      return;
    }
    console.log(`retry   ${file.name}  (size mismatch, have ${mb(size)})`);
  }

  const url = `${BASE}${encodeURIComponent(file.name)}?download=1`;
  console.log(`fetch   ${file.name}`);
  console.log(`        ${url}`);

  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${file.name}`);
  }

  const tmp = `${target}.part`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  const size = statSync(tmp).size;
  const { renameSync, unlinkSync } = await import("node:fs");
  renameSync(tmp, target);

  console.log(`saved   ${file.name}  (${mb(size)})`);
  if (Math.abs(size - file.approxBytes) > 1024) {
    console.log(`        warning: expected about ${mb(file.approxBytes)}`);
  }
}

async function main() {
  mkdirSync(ASSETS_DIR, { recursive: true });
  console.log("BirdNET+ V3.0-preview3.1 developer weights");
  console.log("Licence: CC BY-NC-SA 4.0 — Cornell Lab of Ornithology and Chemnitz University of Technology");
  console.log("Non-commercial use only. Do not commit these files to git.");
  console.log("");

  for (const file of FILES) {
    await download(file);
  }

  console.log("");
  console.log(`assets written to ${ASSETS_DIR}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});

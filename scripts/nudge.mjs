import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOP_N = 5;
const MIN_CONFIDENCE = 0.05;

const HOUR_BANDS = [
  { name: "dawn", from: 5, to: 8 },
  { name: "morning", from: 8, to: 11 },
  { name: "midday", from: 11, to: 15 },
  { name: "afternoon", from: 15, to: 17 },
  { name: "dusk", from: 17, to: 19 },
  { name: "night", from: 19, to: 24 },
];

function normalize(name) {
  return String(name ?? "")
    .replace(/[×✕]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function binomial(name) {
  return normalize(name).split(" ").filter(Boolean).slice(0, 2).join(" ");
}

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else current += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      fields.push(current);
      current = "";
    } else current += ch;
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

function readRows(file) {
  const lines = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const cSci = header.indexOf("scientific_name");
  const cCom = header.indexOf("common_name");
  const cCon = header.indexOf("confidence");
  if (cSci === -1 || cCon === -1) return [];

  return lines
    .slice(1)
    .map((l) => parseCsvLine(l))
    .map((f) => ({ scientific: f[cSci] ?? "", common: f[cCom] ?? "", confidence: Number(f[cCon]) }))
    .filter((r) => Number.isFinite(r.confidence) && r.confidence >= MIN_CONFIDENCE);
}

function topPredictions(rows) {
  const best = new Map();
  for (const r of rows) {
    const key = binomial(r.scientific);
    const prev = best.get(key);
    if (!prev || r.confidence > prev.confidence) best.set(key, { ...r, key });
  }
  return [...best.values()].sort((a, b) => b.confidence - a.confidence).slice(0, TOP_N);
}

function bandNow(hour) {
  return HOUR_BANDS.find((b) => hour >= b.from && hour < b.to)?.name ?? "night";
}

function fitsNow(active, band) {
  if (!active) return false;
  const a = active.toLowerCase();
  if (a.includes("night")) return band === "night";
  if (a.includes("dawn")) return band === "dawn";
  if (a.includes("dusk")) return band === "dusk";
  if (a.includes("day")) return ["dawn", "morning", "midday", "afternoon", "dusk"].includes(band);
  return true;
}

function readText(path) {
  return readFileSync(path, "utf8").replace(/^﻿/, "");
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function loadKeyed(path, prefix = "_") {
  const raw = parseJsonSafe(readText(resolve(ROOT, path)));
  if (!raw || typeof raw !== "object") return new Map();
  const map = new Map();
  for (const [k, v] of Object.entries(raw)) {
    if (!k.startsWith(prefix)) map.set(binomial(k), v);
  }
  return map;
}

function loadPackKeys() {
  const raw = parseJsonSafe(readText(resolve(ROOT, "data/pack.json")));
  const set = new Set();
  if (!raw || !Array.isArray(raw.species)) return set;
  for (const s of raw.species) {
    set.add(binomial(s.scientific));
    set.add(normalize(s.scientific));
  }
  return set;
}

function loadSpotsByType() {
  const raw = parseJsonSafe(readText(resolve(ROOT, "data/spots.json")));
  const map = new Map();
  if (!raw || !Array.isArray(raw.spots)) return map;
  for (const spot of raw.spots) {
    if (!map.has(spot.type)) map.set(spot.type, spot);
  }
  return map;
}

function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: node scripts/nudge.mjs <detections.csv> [--hour H]");
    process.exitCode = 1;
    return;
  }

  const hourFlag = process.argv.indexOf("--hour");
  const nowHour = hourFlag !== -1 ? Number(process.argv[hourFlag + 1]) : new Date().getHours();

  const packKeys = loadPackKeys();
  const seasonal = loadKeyed("data/seasonal.json");
  const spotsByType = loadSpotsByType();

  const rows = readRows(resolve(ROOT, target));
  if (rows.length === 0) {
    console.log(`No detections above ${MIN_CONFIDENCE} in ${target}.`);
    console.log("Nothing to suggest. If you heard something, lower min-conf in the web demo to 0.01.");
    return;
  }

  const top = topPredictions(rows);
  const band = bandNow(nowHour);

  const local = top.filter((t) => packKeys.has(t.key) || packKeys.has(normalize(t.scientific)));
  const nonlocal = top.filter((t) => !packKeys.has(t.key) && !packKeys.has(normalize(t.scientific)));

  console.log(`  ${target}   (${band}, ${String(nowHour).padStart(2, "0")}:00)`);
  console.log("");
  console.log(`  ${local.length} of ${top.length} top predictions are species recorded within 30 km of Chidambaram.`);
  console.log("");

  if (local.length === 0) {
    console.log("  Nothing matched the local pack.");
    if (nonlocal.length) {
      const top = nonlocal[0];
      console.log(`  The model did register a call, confidently: ${top.common || top.scientific} at ${top.confidence.toFixed(2)}.`);
      console.log("  No species on that list has been recorded within 30 km of Chidambaram, so it is either");
      console.log("  a bird that lives somewhere else, or the model has latched onto noise. Either way, do not");
      console.log("  act on it. Play the segment back and check the spectrogram yourself.");
    } else {
      console.log("  Nothing was detected at all, which usually means the clip is too noisy or too short.");
      console.log("  Try a quieter spot, and lower --min-conf to 0.02 if you are sure you heard something.");
    }
    return;
  }

  const scored = local
    .map((t) => {
      const info = seasonal.get(t.key) ?? null;
      const timed = info ? fitsNow(info.active, band) : false;
      const ubiquitous = Boolean(info?.ubiquitous);
      const score = (timed ? 10 : 0) + (ubiquitous ? -2 : 0) + t.confidence;
      return { ...t, info, timed, ubiquitous, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const name = best.info?.common ?? best.common ?? best.scientific;

  console.log("  Sounds like");
  for (const t of scored.slice(0, 5)) {
    const n = t.info?.common ?? t.common ?? t.scientific;
    console.log(`    ${t.confidence.toFixed(3)}  ${n}${t.info?.season ? `   [${t.info.season}]` : ""}`);
  }
  console.log("");

  const spot = best.info?.spotType ? spotsByType.get(best.info.spotType) : null;
  console.log(`  GO:  ${name}`);
  if (best.info?.active) {
    console.log(`        Most vocal: ${best.info.active}.  It is ${band} now.${best.timed ? "  Good timing." : "  Not the best hour."}`);
  }
  if (best.info?.season) console.log(`        Season: ${best.info.season}`);
  if (spot) console.log(`        Where: ${spot.name}`);
  if (best.info?.cue) console.log(`        Listen for: ${best.info.cue}`);

  console.log("");
  console.log("  Treat this as a suggestion, not an identification.");
  console.log("  Play the segment back and check it against the spectrogram before you believe it.");

  if (nonlocal.length) {
    console.log("");
    console.log("  Also predicted, not recorded locally:");
    for (const t of nonlocal.slice(0, 3)) {
      console.log(`    ${t.confidence.toFixed(3)}  ${t.common || t.scientific}`);
    }
  }
}

main();

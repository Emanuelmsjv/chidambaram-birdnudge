import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACK_PATH = resolve(ROOT, "data/pack.json");
const SEASONAL_PATH = resolve(ROOT, "data/seasonal.json");
const SPOTS_PATH = resolve(ROOT, "data/spots.json");

const argDir = (() => {
  const i = process.argv.indexOf("--dir");
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
})();
const DETECTIONS_DIR = argDir ? resolve(ROOT, argDir) : resolve(ROOT, "data/detections");
const SUMMARY_JSON = argDir
  ? resolve(ROOT, "docs/summary-sample.json")
  : resolve(ROOT, "data/summary.json");
const SUMMARY_MD = argDir
  ? resolve(ROOT, "docs/overview-sample.md")
  : resolve(ROOT, "docs/overview.md");

const TOP_N = 5;
const MIN_CONFIDENCE = 0.05;

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
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

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

function loadPack() {
  const raw = parseJsonSafe(readText(PACK_PATH)) ?? { species: [] };
  const byFull = new Map();
  const byBinomial = new Map();
  const all = [];

  for (const entry of raw.species) {
    const record = {
      scientific: entry.scientific,
      common: entry.common,
      rank: entry.rank,
      observations: entry.observations,
      full: normalize(entry.scientific),
      bin: binomial(entry.scientific),
    };
    all.push(record);
    if (!byFull.has(record.full)) byFull.set(record.full, record);
    if (!byBinomial.has(record.bin)) byBinomial.set(record.bin, record);
  }

  return { meta: raw, all, byFull, byBinomial };
}

function lookup(pack, scientific) {
  const full = normalize(scientific);
  if (pack.byFull.has(full)) return pack.byFull.get(full);
  const bin = binomial(scientific);
  if (pack.byBinomial.has(bin)) return pack.byBinomial.get(bin);
  return null;
}

function readText(file) {
  return readFileSync(file, "utf8").replace(/^\uFEFF/, "");
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function loadJson(file) {
  return parseJsonSafe(readText(file));
}

function loadSeasonal() {
  const raw = loadJson(SEASONAL_PATH);
  if (!raw) return { map: new Map(), byType: new Map() };
  const map = new Map();
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith("_")) continue;
    map.set(binomial(key), value);
  }
  return { map };
}

function loadSpots() {
  const raw = loadJson(SPOTS_PATH);
  const byType = new Map();
  if (!raw || !Array.isArray(raw.spots)) return { byType };
  for (const spot of raw.spots) {
    if (!byType.has(spot.type)) byType.set(spot.type, []);
    byType.get(spot.type).push(spot);
  }
  return { byType };
}

function describeNudge(entry, seasonal, spots) {
  if (!entry) {
    return { season: null, active: null, cue: null, spot: null };
  }
  const info = seasonal.map.get(entry.key) ?? null;
  if (!info) {
    return { season: null, active: null, cue: null, spot: null };
  }
  const candidates = spots.byType.get(info.spotType) ?? [];
  return {
    season: info.season ?? null,
    active: info.active ?? null,
    cue: info.cue ?? null,
    spotType: info.spotType ?? null,
    spot: candidates.length ? candidates[0].name : null,
  };
}

function readDetections(file) {
  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const col = {
    start: header.indexOf("start_sec"),
    end: header.indexOf("end_sec"),
    scientific: header.indexOf("scientific_name"),
    common: header.indexOf("common_name"),
    confidence: header.indexOf("confidence"),
  };
  if (col.scientific === -1 || col.confidence === -1) return [];

  const rows = [];
  for (const line of lines.slice(1)) {
    const f = parseCsvLine(line);
    const confidence = Number(f[col.confidence]);
    if (!Number.isFinite(confidence)) continue;
    if (confidence < MIN_CONFIDENCE) continue;
    rows.push({
      start: Number(f[col.start]) || 0,
      end: Number(f[col.end]) || 0,
      scientific: f[col.scientific] ?? "",
      common: f[col.common] ?? "",
      confidence,
    });
  }
  return rows;
}

function rankDistinct(rows) {
  const best = new Map();
  for (const row of rows) {
    const key = binomial(row.scientific);
    const prev = best.get(key);
    if (!prev || row.confidence > prev.confidence) {
      best.set(key, { ...row, key, hits: 1 });
    } else {
      prev.hits += 1;
    }
  }
  return [...best.values()].sort((a, b) => b.confidence - a.confidence);
}

function topPredictions(rows, n) {
  return rankDistinct(rows).slice(0, n);
}

function pct(x) {
  return `${(x * 100).toFixed(1)}%`;
}

function bar(value, max, width = 18) {
  if (!(max > 0)) return "";
  const filled = Math.max(1, Math.round((value / max) * width));
  return "█".repeat(Math.min(width, filled));
}

function main() {
  const pack = loadPack();
  const seasonal = loadSeasonal();
  const spots = loadSpots();

  let files = [];
  try {
    files = readdirSync(DETECTIONS_DIR).filter((f) => f.toLowerCase().endsWith(".csv")).sort();
  } catch {
    mkdirSync(DETECTIONS_DIR, { recursive: true });
  }

  if (files.length === 0) {
    console.log("No detection CSVs found.");
    console.log(`Put them in ${DETECTIONS_DIR}`);
    console.log("In the web demo, run each clip then click Download CSV.");
    return;
  }

  const perClip = [];
  const speciesTotals = new Map();
  const foreignTotals = new Map();
  const allSpeciesTotals = new Map();
  let totalTop = 0;
  let totalInPack = 0;
  let totalRows = 0;
  let totalAllDistinct = 0;
  let totalAllInPack = 0;

  for (const file of files) {
    const rows = readDetections(resolve(DETECTIONS_DIR, file));
    totalRows += rows.length;
    const top = topPredictions(rows, TOP_N);
    const allRanked = rankDistinct(rows);

    let allInPack = 0;
    for (const t of allRanked) {
      const hit = lookup(pack, t.scientific);
      const key = t.key;
      const prev = allSpeciesTotals.get(key) ?? {
        key,
        scientific: t.scientific,
        common: hit ? hit.common : t.common,
        local: Boolean(hit),
        clips: 0,
        bestConfidence: 0,
        segmentHits: t.hits,
      };
      prev.clips += 1;
      prev.bestConfidence = Math.max(prev.bestConfidence, t.confidence);
      prev.segmentHits += t.hits;
      allSpeciesTotals.set(key, prev);
      if (hit) allInPack += 1;
    }

    totalAllDistinct += allRanked.length;
    totalAllInPack += allInPack;

    let inPack = 0;
    const topKeys = new Set();

    for (const t of top) {
      const hit = lookup(pack, t.scientific);
      t.local = Boolean(hit);
      t.localRank = hit ? hit.rank : null;
      t.localCommon = hit ? hit.common : null;
      if (hit) inPack += 1;
      topKeys.add(t.key);

      const bucket = hit ? speciesTotals : foreignTotals;
      const key = t.key;
      const prev = bucket.get(key) ?? {
        key,
        scientific: t.scientific,
        common: hit ? hit.common : t.common,
        clips: 0,
        topAppearances: 0,
        bestConfidence: 0,
        localRank: hit ? hit.localRank : null,
      };
      prev.topAppearances += 1;
      prev.bestConfidence = Math.max(prev.bestConfidence, t.confidence);
      bucket.set(key, prev);
    }

    for (const key of topKeys) {
      const rec = speciesTotals.get(key) ?? foreignTotals.get(key);
      if (rec) rec.clips += 1;
    }

    for (const [key, rec] of speciesTotals) {
      if (top.some((t) => t.key === key)) rec.clips += 1;
    }

    totalTop += top.length;
    totalInPack += inPack;

    perClip.push({
      file,
      detections: rows.length,
      top,
      inPack,
      topCount: top.length,
      inPackFraction: top.length ? inPack / top.length : 0,
    });
  }

  const bySpecies = (m) => [...m.values()].sort((a, b) => b.clips - a.clips || b.bestConfidence - a.bestConfidence);
  const local = bySpecies(speciesTotals);
  const foreign = bySpecies(foreignTotals);
  for (const rec of [...local, ...foreign]) {
    Object.assign(rec, describeNudge(rec, seasonal, spots));
  }
  const maxClips = Math.max(1, ...local.map((s) => s.clips), ...foreign.map((s) => s.clips));
  const nowMonth = new Date().getMonth() + 1;

  function seasonalNow(rec) {
    if (!rec.season) return "—";
    if (/year-round/i.test(rec.season)) return "year-round";
    const m = rec.season.match(/(\w{3})\s*-\s*(\w{3})/);
    if (!m) return rec.season;
    const order = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const a = order.indexOf(m[1].slice(0, 3).toLowerCase());
    const b = order.indexOf(m[2].slice(0, 3).toLowerCase());
    const idx = nowMonth - 1;
    if (a < 0 || b < 0) return rec.season;
    const inRange = a <= b ? idx >= a && idx <= b : idx >= a || idx <= b;
    const range = `${m[1]}-${m[2]}`;
    return inRange ? `IN SEASON (${range})` : `out of season (${range})`;
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    config: { topN: TOP_N, minConfidence: MIN_CONFIDENCE },
    pack: {
      generatedAt: pack.meta.generatedAt,
      place: pack.meta.place.name,
      speciesCount: pack.meta.count,
    },
    totals: {
      clips: perClip.length,
      detections: totalRows,
      topPredictions: totalTop,
      inPack: totalInPack,
      inPackFraction: totalTop ? totalInPack / totalTop : 0,
      allDistinctSpecies: totalAllDistinct,
      allInPack: totalAllInPack,
      allInPackFraction: totalAllDistinct ? totalAllInPack / totalAllDistinct : 0,
      distinctLocalSpecies: local.length,
      distinctNonLocalSpecies: foreign.length,
    },
    localSpecies: local,
    nonLocalSpecies: foreign,
    allSpecies: [...allSpeciesTotals.values()].sort(
      (a, b) => b.clips - a.clips || b.bestConfidence - a.bestConfidence,
    ),
    perClip,
  };

  mkdirSync(dirname(SUMMARY_JSON), { recursive: true });
  mkdirSync(dirname(SUMMARY_MD), { recursive: true });
  writeFileSync(SUMMARY_JSON, JSON.stringify(summary, null, 2) + "\n", "utf8");

  const lines = [];
  lines.push("# Chidambaram bird ID — summary");
  lines.push("");
  lines.push(`Generated ${new Date().toISOString().slice(0, 10)} from ${perClip.length} clip(s).`);
  lines.push("");
  lines.push("## Headline");
  lines.push("");
  lines.push(`**${pct(summary.totals.inPackFraction)} of top-${TOP_N} predictions fall inside the Chidambaram species pack.**`);
  lines.push("");
  lines.push(`- Clips analysed: ${summary.totals.clips}`);
  lines.push(`- Raw detections above ${MIN_CONFIDENCE}: ${summary.totals.detections}`);
  lines.push(`- Top-${TOP_N} predictions scored: ${summary.totals.topPredictions}`);
  lines.push(`- In pack: ${summary.totals.inPack}  |  not in pack: ${summary.totals.topPredictions - summary.totals.inPack}`);
  lines.push(`- Distinct local species seen: ${summary.totals.distinctLocalSpecies}`);
  lines.push(`- Distinct non-local species seen: ${summary.totals.distinctNonLocalSpecies}`);
  lines.push("");
  lines.push(`Pack: ${summary.pack.speciesCount} species within ${summary.pack.place}.`);
  lines.push("");
  lines.push("## Every distinct species the model proposed");
  lines.push("");
  lines.push(`Scoring every distinct species the model proposed, rather than only the top ${TOP_N}, uses far more of the model's output, so it is the more stable of the two figures. The top-${TOP_N} number is kept because it reflects what a user would actually be shown.`);
  lines.push("");
  lines.push(`- Distinct species proposed: ${summary.totals.allDistinctSpecies}`);
  lines.push(`- Of those, in pack: ${summary.totals.allInPack} (${pct(summary.totals.allInPackFraction)})`);
  lines.push(`- Not in pack: ${summary.totals.allDistinctSpecies - summary.totals.allInPack}`);
  lines.push("");
  lines.push("local | clips | best | species");
  lines.push(":--- | ---: | ---: | :---");
  for (const s of summary.allSpecies) {
    const name = `${s.common || "(no common name)"} (${s.scientific})`;
    lines.push(`${s.local ? "yes" : "no "} | ${String(s.clips).padStart(5)} | ${s.bestConfidence.toFixed(3)} | ${name}`);
  }
  lines.push("");
  lines.push("## Species found near Chidambaram");
  lines.push("");
  lines.push("clips | best | species | season now | best time | where to go | listen for");
  lines.push("---: | ---: | :--- | :--- | :--- | :--- | :---");
  for (const s of local) {
    const name = `${s.common ?? s.scientific} (${s.scientific})`;
    lines.push(
      `${String(s.clips).padStart(5)} | ${s.bestConfidence.toFixed(3)} | ${bar(s.clips, maxClips)} ${name} | ${seasonalNow(s)} | ${s.active ?? "—"} | ${s.spot ?? s.spotType ?? "—"} | ${s.cue ?? "—"}`,
    );
  }
  lines.push("");
  lines.push("## Predicted but not in the local pack");
  lines.push("");
  lines.push("These are the model's error modes in this region.");
  lines.push("");
  lines.push("clips | best | species | where it actually lives");
  lines.push("---: | ---: | :--- | :---");
  for (const s of foreign) {
    const name = `${s.common || "(no common name)"} (${s.scientific})`;
    lines.push(`${String(s.clips).padStart(5)} | ${s.bestConfidence.toFixed(3)} | ${bar(s.clips, maxClips)} ${name} | ${s.spot ?? "outside the 30 km pack"}`);
  }
  lines.push("");
  lines.push("## Per clip");
  lines.push("");
  lines.push("file | detections | in-pack | fraction");
  lines.push(":--- | ---: | ---: | ---:");
  for (const c of perClip) {
    lines.push(`${c.file} | ${c.detections} | ${c.inPack}/${c.topCount} | ${pct(c.inPackFraction)}`);
  }
  lines.push("");
  lines.push("## Method");
  lines.push("");
  lines.push(`For each clip every ${TOP_N} distinct species ranked by peak confidence is taken, then matched`);
  lines.push("against the local pack by binomial name. A prediction counts as local when a species with the");
  lines.push("same genus and species appears in the iNaturalist-derived pack. No manual labelling is used,");
  lines.push("so the score measures how much of the model's output is plausible for this location rather");
  lines.push("than how often it is correct.");
  lines.push("");

  writeFileSync(SUMMARY_MD, lines.join("\n"), "utf8");

  console.log(`Clips: ${summary.totals.clips}  detections: ${summary.totals.detections}`);
  console.log(`In-pack (top-${TOP_N}): ${summary.totals.inPack}/${summary.totals.topPredictions} = ${pct(summary.totals.inPackFraction)}`);
  console.log(`In-pack (all ${summary.totals.allDistinctSpecies} distinct): ${summary.totals.allInPack} = ${pct(summary.totals.allInPackFraction)}`);
  console.log(`Local species seen: ${local.length}   non-local: ${foreign.length}`);
  console.log(`Wrote ${SUMMARY_JSON}`);
  console.log(`Wrote ${SUMMARY_MD}`);
  console.log("");
  console.log("Top non-local predictions (model error modes):");
  for (const s of foreign.slice(0, 8)) {
    console.log(`  ${s.scientific} — ${s.common || "(no common name)"} (clips: ${s.clips}, ${s.bestConfidence.toFixed(3)})`);
  }
}

main();

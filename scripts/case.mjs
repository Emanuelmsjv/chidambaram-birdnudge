import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACK = resolve(ROOT, "data", "pack.json");
const SEASONAL = resolve(ROOT, "data", "seasonal.json");
const DETECTIONS = resolve(ROOT, "data", "detections");
const MANIFEST = resolve(ROOT, "clips", "manifest.json");
const OUT = resolve(ROOT, "docs", "case-report.md");

const TARGET = "Argya affinis";
const TARGET_LABEL = "Yellow-billed Babbler";
const MIN_CONFIDENCE = 0.05;

const GROUND_TRUTH = {
  observer: "project author",
  basis: "field identification by ear and sight",
  photo: "none available",
  location: "Golden Jubilee Hostel campus, Chidambaram, Tamil Nadu",
  date: "2026-10-11",
  note:
    "The identification was made by the observer before any model output was seen. " +
    "No photograph was taken, so there is no independent reference for the species claim. " +
    "The model output below is treated as corroboration of the observation, never as its source.",
};

const CLIP_INTENT = {
  "inside": { condition: "indoor", expectBird: true, note: "babblers audible/visible on campus trees" },
  "inside-2": { condition: "indoor", expectBird: true, note: "second indoor clip" },
  "outside": { condition: "outdoor", expectBird: true, note: "babblers audible outside the campus" },
  "speech": { condition: "indoor", expectBird: "unknown", note: "foreground is speech; background bird content not verified" },
  "speech-2": { condition: "indoor", expectBird: "unknown", note: "foreground is speech; background bird content not verified" },
  "soundscape": { condition: "foreign control", expectBird: false, note: "upstream BirdNET sample, New York" },
};

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
  return fields;
}

function readCsv(file) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const col = {
    start: header.indexOf("start_sec"),
    end: header.indexOf("end_sec"),
    scientific: header.indexOf("scientific_name"),
    common: header.indexOf("common_name"),
    confidence: header.indexOf("confidence"),
  };
  return lines.slice(1).map((line) => {
    const f = parseCsvLine(line);
    return {
      start: Number(f[col.start]) || 0,
      end: Number(f[col.end]) || 0,
      scientific: f[col.scientific] ?? "",
      common: f[col.common] ?? "",
      confidence: Number(f[col.confidence]) || 0,
    };
  }).filter((r) => Number.isFinite(r.confidence) && r.confidence >= MIN_CONFIDENCE);
}

function packIndex(pack) {
  const map = new Map();
  for (const s of pack.species) {
    map.set(binomial(s.scientific), s);
    if (s.binomial) map.set(s.binomial, s);
  }
  return map;
}

function analyse(file, targetBinomial, packMap) {
  const rows = readCsv(file);
  const totalSegments = new Set(rows.map((r) => r.start)).size;
  const target = rows.filter((r) => binomial(r.scientific) === targetBinomial);

  const best = new Map();
  for (const r of rows) {
    const key = binomial(r.scientific);
    const prev = best.get(key);
    if (!prev || r.confidence > prev.confidence) best.set(key, { ...r, hits: 0 });
  }
  for (const r of rows) {
    const key = binomial(r.scientific);
    const rec = best.get(key);
    if (rec) rec.hits += 1;
  }

  const ranked = [...best.values()].sort((a, b) => b.confidence - a.confidence);
  for (const r of ranked) {
    const hit = packMap.get(r.key ?? binomial(r.scientific));
    r.local = Boolean(hit);
    r.localRank = hit ? hit.rank : null;
    r.localCommon = hit ? hit.common : null;
  }

  return {
    file: basename(file, ".csv"),
    totalSegments,
    detections: rows.length,
    targetBest: target.length ? Math.max(...target.map((r) => r.confidence)) : 0,
    targetSegments: new Set(target.map((r) => r.start)).size,
    targetSegmentsList: [...new Set(target.map((r) => r.start))].sort((a, b) => a - b),
    ranked,
    localCount: ranked.filter((r) => r.local).length,
    foreign: ranked.filter((r) => !r.local),
  };
}

function main() {
  const pack = JSON.parse(readFileSync(PACK, "utf8"));
  const seasonalRaw = JSON.parse(readFileSync(SEASONAL, "utf8"));
  const seasonal = seasonalRaw;
  const packMap = packIndex(pack);
  const seasonalEntry = seasonal[binomial(TARGET)] ?? null;
  const packEntry = packMap.get(binomial(TARGET));
  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : null;

  const results = [];
  for (const stem of Object.keys(CLIP_INTENT)) {
    const file = resolve(DETECTIONS, `${stem}.csv`);
    if (existsSync(file)) results.push(analyse(file, binomial(TARGET), packMap));
  }

  const positives = results.filter((r) => CLIP_INTENT[r.file]?.expectBird === true);
  const detected = positives.filter((r) => r.targetBest > 0);
  const missed = positives.filter((r) => r.targetBest === 0);
  const ambiguous = results.filter((r) => CLIP_INTENT[r.file]?.expectBird === "unknown");

  const L = [];
  const p = (n, d = 3) => n.toFixed(d);

  L.push("# Case study: Yellow-billed Babbler at Golden Jubilee Hostel");
  L.push("");
  L.push("A single field observation, put through the pipeline, with the failures kept in.");
  L.push("");

  L.push("## The observation");
  L.push("");
  L.push(`A group of **${TARGET_LABEL}** (*${TARGET}*) was identified by ${GROUND_TRUTH.observer} at ${GROUND_TRUTH.location} on ${GROUND_TRUTH.date}.`);
  L.push("");
  L.push(`- Basis: ${GROUND_TRUTH.basis}`);
  L.push(`- Photographic reference: ${GROUND_TRUTH.photo}`);
  L.push(`- ${GROUND_TRUTH.note}`);
  L.push("");

  L.push("## Where this species sits locally");
  L.push("");
  if (packEntry) {
    L.push(`\`Argya affinis\` is **rank ${packEntry.rank} of ${pack.count}** in the Chidambaram species pack, with ${packEntry.observations} iNaturalist observations in range. It is a locally well-established bird, not a rarity.`);
  }
  if (seasonalEntry) {
    L.push("");
    L.push("The hand-curated seasonal note for this species reads:");
    L.push("");
    L.push("> " + [seasonalEntry.season, seasonalEntry.active, seasonalEntry.spot ?? seasonalEntry.spotType, seasonalEntry.cue].filter(Boolean).join(" / "));
    L.push("");
    L.push(`That describes a daytime, noisy, social bird in open scrub and along roadside edges — which is consistent with a chattering group in campus trees. The note was written before this observation was analysed.`);
  }
  L.push("");

  L.push("## Results");
  L.push("");
  L.push("| clip | condition | segments | best " + TARGET_LABEL + " | segments hit | in-pack of all proposals |");
  L.push("| :--- | :--- | ---: | ---: | ---: | ---: |");
  for (const r of results) {
    const meta = CLIP_INTENT[r.file];
    const score = r.targetBest > 0 ? p(r.targetBest) : "—";
    const hit = r.targetBest > 0 ? `${r.targetSegments}/${r.totalSegments}` : "0";
    L.push(`| \`${r.file}\` | ${meta?.condition ?? "—"} | ${r.totalSegments} | ${score} | ${hit} | ${r.localCount}/${r.ranked.length} |`);
  }
  L.push("");

  L.push("### Where the model placed the observed species");
  L.push("");
  if (detected.length) {
    for (const r of detected) {
      const rank = r.ranked.findIndex((x) => binomial(x.scientific) === binomial(TARGET)) + 1;
      L.push(`- \`${r.file}\`: **${p(r.targetBest)}**, rank ${rank} of ${r.ranked.length} distinct species proposed, present in ${r.targetSegments} of ${r.totalSegments} segments.`);
    }
  }
  if (missed.length) {
    for (const r of missed) {
      L.push(`- \`${r.file}\`: **not detected.** The model still produced bird calls, led by ${r.ranked.slice(0, 3).map((x) => `${x.localCommon ?? x.common} ${p(x.confidence)}`).join(", ")}.`);
    }
  }
  L.push("");

  L.push("## What this does and does not establish");
  L.push("");
  L.push(`Of the ${positives.length} clips where the observer confirmed the species was present, the model ranked it above threshold in ${detected.length}.`);
  L.push("");
  L.push("That is **corroboration, not accuracy**, and the distinction is not cosmetic:");
  L.push("");
  L.push("1. **No independent reference exists.** There is no photograph, so nothing outside the observer's own identification can check the species claim.");
  L.push("2. **The sample is three clips, one bird, one person.** No accuracy figure computed from this would mean anything.");
  L.push("3. **The observer's identification is the load-bearing claim.** Everything else is the model agreeing with it.");
  L.push("");

  if (ambiguous.length) {
    L.push("## The two speech clips");
    L.push("");
    L.push("These were recorded at the same hostel, with speech in the foreground. Whether babblers are audible behind the speech was **not verified**, so they cannot serve as clean negative controls and are excluded from the counts above.");
    L.push("");
    for (const r of ambiguous) {
      if (r.targetBest > 0) {
        L.push(`- \`${r.file}\` returned **${TARGET_LABEL} at ${p(r.targetBest)}**, in ${r.targetSegments} of ${r.totalSegments} segments.`);
      } else {
        L.push(`- \`${r.file}\` returned no ${TARGET_LABEL} above ${MIN_CONFIDENCE}.`);
      }
    }
    const bothSpeech = ambiguous.length === 2;
    const [hitSpeech, missSpeech] = ambiguous;
    if (bothSpeech && hitSpeech?.targetBest > 0 && missSpeech?.targetBest === 0) {
      L.push("");
      L.push("This split is the interesting part. If human speech reliably triggered this species, both clips would light up equally. One fires on it and the other does not, which points to something bird-like actually being present in \`${hitSpeech.file}\` rather than speech alone provoking the model. That reading is plausible but **not confirmed** — it would take listening to \`${hitSpeech.file}\` and marking whether babblers are audible behind the speech to settle it.");
      L.push("");
      L.push("Until then this stays a hypothesis, and it is the one result in this report most likely to be wrong in a way nobody has checked.");
    }
    L.push("");
  }

  L.push("## Foreign-audio control");
  L.push("");
  const ny = results.find((r) => r.file === "soundscape");
  if (ny) {
    L.push(`The upstream BirdNET sample from New York scores **0 of ${ny.ranked.length}** proposals inside the Chidambaram pack. The model was highly confident about species it had no business predicting here:`);
    L.push("");
    for (const s of ny.ranked.slice(0, 5)) {
      L.push(`- ${s.common} (*${s.scientific}*) at ${p(s.confidence)}, across ${s.hits} segments`);
    }
    L.push("");
    const localAll = results.filter((r) => r.file !== "soundscape");
    const localIn = localAll.reduce((a, r) => a + r.localCount, 0);
    const localTot = localAll.reduce((a, r) => a + r.ranked.length, 0);
    L.push(`Local recordings score ${localIn}/${localTot} in pack. Same model, same code, same weights — the only variable is which species list the predictions are filtered against.`);
  }
  L.push("");

  L.push("## Species proposed that do not live here");
  L.push("");
  const foreignAll = new Map();
  for (const r of results) {
    for (const s of r.foreign) {
      const rec = foreignAll.get(binomial(s.scientific)) ?? { ...s, clips: 0 };
      rec.clips += 1;
      rec.bestConfidence = Math.max(rec.bestConfidence ?? 0, s.confidence);
      foreignAll.set(binomial(s.scientific), rec);
    }
  }
  if (foreignAll.size) {
    L.push("| species | best | clips |");
    L.push("| :--- | ---: | ---: |");
    for (const s of [...foreignAll.values()].sort((a, b) => b.bestConfidence - a.bestConfidence)) {
      L.push(`| ${s.common} (*${s.scientific}*) | ${p(s.bestConfidence)} | ${s.clips} |`);
    }
    L.push("");
    L.push("These are the model's error modes on this audio. Any of them appearing in a top result is a reason to distrust the result, not a bird to go looking for.");
    L.push("");
    L.push("**Caveat on the pack itself.** \"Not in pack\" does not always mean \"does not occur locally\". The pack is derived from iNaturalist research-grade records within 30 km, and iNaturalist under-reports some ubiquitous small passerines. Indian White-eye (*Zosterops palpebrosus*) did not appear once in 1000 research-grade observations pulled from the area, so a genuinely correct prediction of it would be flagged as locally absent here. Read this table as *not established as local by this data source*, not as proven absence.");
  } else {
    L.push("None — every species proposed across these clips is in the local pack.");
  }
  L.push("");

  L.push("## Reproducing this");
  L.push("");
  L.push("```sh");
  L.push("npm run convert   # clips/*.m4a -> 32 kHz mono WAV, writes clips/manifest.json");
  L.push("npm run analyze clips --out data/detections");
  L.push("npm run summarize");
  L.push("npm run case");
  L.push("```");
  L.push("");
  if (manifest) {
    L.push(`Audio used: ${manifest.clips.length} clips, ${manifest.clips.reduce((a, c) => a + c.durationSec, 0).toFixed(1)}s total, converted with ${manifest.ffmpegVersion}.`);
    L.push("");
    L.push("The source recordings are not committed. `clips/manifest.json` records a SHA-256 for each file so the exact inputs are verifiable if you have your own copies.");
    L.push("");
    if (manifest.duplicateFiles?.length) {
      for (const d of manifest.duplicateFiles) {
        L.push(`\`${d.name}\` was excluded: ${d.reason}.`);
      }
      L.push("");
    }
  }

  L.push("## Honest limits");
  L.push("");
  L.push("- Three clips, one species, one observer. This is a worked example, not an evaluation.");
  L.push("- No photograph means no independent check on the species identification.");
  L.push("- The two speech clips have unverified background content and are not usable as controls.");
  L.push("- Confidence values are not calibrated probabilities and must not be read as such — the foreign-audio control shows the model being confidently wrong about species that do not occur locally.");
  L.push("- A confidence above threshold is a prompt to go and look, never a substitute for looking.");
  L.push("");

  writeFileSync(OUT, L.join("\n"), "utf8");
  console.log(`Wrote ${OUT}`);
  console.log(`  clips analysed : ${results.length}`);
  console.log(`  confirmed-bird : ${detected.length}/${positives.length} detected`);
  if (missed.length) console.log(`  missed         : ${missed.map((r) => r.file).join(", ")}`);
  for (const r of ambiguous) {
    console.log(`  unverified     : ${r.file} -> ${r.targetBest > 0 ? p(r.targetBest) : "no hit"}`);
  }
}

main();
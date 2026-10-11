// CI smoke tests. No test framework and no model download: these run in a few
// seconds on a clean checkout using the committed sample CSVs and data files,
// and they pin the numbers that every headline figure in the docs depends on.
//
// The point is drift detection. summarize.mjs computes the in-pack fractions
// that the case report, the overview, and the DEV post all quote. If someone
// edits the pack, the seasonal notes, the metric code, or a sample CSV, one of
// these assertions fires instead of the published numbers quietly going stale.

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
let checks = 0;

function check(name, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.error(`  FAIL  ${name}`);
    console.error(`        expected ${JSON.stringify(expected)}`);
    console.error(`        actual   ${JSON.stringify(actual)}`);
  } else {
    console.log(`  ok    ${name} = ${JSON.stringify(actual)}`);
  }
}

function checkNear(name, actual, expected, tol = 1e-6) {
  checks += 1;
  const ok = typeof actual === "number" && Math.abs(actual - expected) <= tol;
  if (!ok) {
    failures += 1;
    console.error(`  FAIL  ${name}: expected ~${expected}, got ${actual}`);
  } else {
    console.log(`  ok    ${name} = ${actual}`);
  }
}

console.log("data files present:");
for (const p of ["data/pack.json", "data/seasonal.json", "data/spots.json", "data/samples"]) {
  const exists = existsSync(resolve(ROOT, p));
  check(p, exists, true);
}

// The pack is the whole premise of the project: if it is empty or the Yellow-billed
// Babbler falls out of it, every in-pack number silently changes meaning.
console.log("\npack sanity:");
const pack = JSON.parse(readFileSync(resolve(ROOT, "data/pack.json"), "utf8"));
check("pack species count is 130", pack.species.length, 130);
const ybb = pack.species.find((s) => s.scientific === "Argya affinis");
check("Yellow-billed Babbler in pack", Boolean(ybb), true);
check("YBB observations", ybb?.observations, 19);
check("YBB rank", ybb?.rank, 18);
// The rank bug (a087f8f) let iNaturalist's taxonomicRank overwrite the ordinal.
// Guard that the two fields stay distinct so the regression cannot come back.
const anyRankClobbered = pack.species.some((s) => typeof s.rank !== "number" && s.rank !== undefined);
check("no species has a clobbered rank", anyRankClobbered, false);

// Regenerate the sample summary from the committed sample CSVs. summarize.mjs
// writes to docs/summary-sample.json when given --dir; we then read that file
// back to assert the metric values. Running it proves the metric code still
// executes end-to-end on a clean checkout.
console.log("\nsample summary metrics:");
try {
  execFileSync(process.execPath, ["scripts/summarize.mjs", "--dir", "data/samples"], { cwd: ROOT, stdio: "pipe" });
} catch (e) {
  console.error("  FAIL  summarize.mjs failed to run on samples");
  console.error(String(e.stdout ?? "") + String(e.stderr ?? ""));
  failures += 1;
}
const summary = JSON.parse(readFileSync(resolve(ROOT, "docs/summary-sample.json"), "utf8"));

const t = summary.totals;
check("clips summarised", t.clips, 3);
check("detections summarised", t.detections, 107);
check("top predictions", t.topPredictions, 13);
check("top-5 in-pack count", t.inPack, 6);
checkNear("top-5 in-pack fraction", t.inPackFraction, 6 / 13);
check("all-distinct species", t.allDistinctSpecies, 28);
check("all-distinct in-pack count", t.allInPack, 7);
checkNear("all-distinct in-pack fraction", t.allInPackFraction, 0.25);
check("distinct local species", t.distinctLocalSpecies, 6);
check("distinct non-local species", t.distinctNonLocalSpecies, 7);
check("config topN", summary.config.topN, 5);
check("config minConfidence", summary.config.minConfidence, 0.05);

// Foreign-audio control: the top non-local predictions for the New York soundscape
// are the headline evidence. Pin the strongest one and its rank.
const junco = (summary.nonLocalSpecies ?? []).find((s) => s.scientific === "Junco hyemalis");
check("Dark-eyed Junco is a non-local prediction", Boolean(junco), true);
checkNear("Junco best confidence", junco?.bestConfidence, 0.946, 0.001);
check("Junco has no local rank", junco?.localRank ?? null, null);

// nudge on the New York soundscape must take the "nothing local" branch and must
// NOT issue a GO recommendation, since none of its species live near Chidambaram.
// This is the user-facing half of the control experiment.
console.log("\nnudge refuses to recommend a non-local bird:");
try {
  const out = execFileSync(process.execPath, ["scripts/nudge.mjs", "data/samples/upstream-soundscape-ny.csv", "--hour", "9"], {
    cwd: ROOT,
    stdio: "pipe",
    encoding: "utf8",
  });
  check("reports 0 of 5 local", /0 of 5 top predictions/.test(out), true);
  check("says nothing matched the local pack", /Nothing matched the local pack/.test(out), true);
  check("does NOT issue a GO recommendation", /GO:/.test(out), false);
  check("cites the most confident foreign call", /Dark-eyed Junco/.test(out), true);
} catch (e) {
  console.error("  FAIL  nudge.mjs threw");
  console.error(String(e.stdout ?? "") + String(e.stderr ?? ""));
  failures += 1;
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} FAILURE(S)`);
  process.exitCode = 1;
}
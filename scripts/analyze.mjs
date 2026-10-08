import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { createRequire } from "node:module";
import { decodeWav, toMonoAt } from "./audio-io.mjs";

const require = createRequire(import.meta.url);
const ort = require("onnxruntime-node");

const ROOT = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const SAMPLE_RATE = 32000;
const DEFAULT_CHUNK_SEC = 3;
const DEFAULT_MIN_CONF = 0.05;
const DEFAULT_BATCH = 8;
const MODEL_NAME = "BirdNET+_V3.0-preview3.1_Global_11K_FP16_pruned.onnx";
const LABELS_NAME = "BirdNET+_V3.0-preview3.1_Global_11K_Labels.csv";

const SEARCH_DIRS = [
  resolve(process.cwd(), "assets"),
  resolve(ROOT, "assets"),
  resolve(ROOT, "../birdnet-V3.0-dev/web-demo/public/assets"),
];

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function findAsset(name) {
  const fromEnv = process.env.BIRDNET_ASSETS_DIR;
  const dirs = fromEnv ? [resolve(fromEnv), ...SEARCH_DIRS] : SEARCH_DIRS;
  for (const dir of dirs) {
    const p = resolve(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

function findAnyModel() {
  const explicit = argValue("--model", null);
  if (explicit) return resolve(explicit);
  const preferred = findAsset(MODEL_NAME);
  if (preferred) return preferred;
  for (const dir of SEARCH_DIRS) {
    if (!existsSync(dir)) continue;
    const onnx = readdirSync(dir).find((f) => f.toLowerCase().endsWith(".onnx"));
    if (onnx) return resolve(dir, onnx);
  }
  return null;
}

function parseSemicolonCsv(text) {
  const lines = text.replace(/^﻿/, "").trim().split(/\r?\n/);
  const header = lines[0].split(";").map((h) => h.trim().toLowerCase());
  const sciIdx = header.indexOf("sci_name");
  const comIdx = header.indexOf("com_name");
  const scientific = [];
  const common = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(";");
    const sci = (cols[sciIdx] ?? "").trim();
    const com = (cols[comIdx] ?? "").trim();
    if (sci || com) {
      scientific.push(sci);
      common.push(com);
    }
  }
  return { scientific, common };
}

function planChunks(audioLength, chunkSeconds, overlapSeconds, sampleRate) {
  const chunkSamples = Math.floor(chunkSeconds * sampleRate);
  const hopSamples = Math.max(1, Math.floor((chunkSeconds - overlapSeconds) * sampleRate));
  const starts = [];
  const spans = [];
  for (let s = 0; s < audioLength; s += hopSamples) {
    const e = Math.min(s + chunkSamples, audioLength);
    starts.push(s);
    spans.push([s / sampleRate, e / sampleRate]);
    if (e >= audioLength) break;
  }
  return { starts, spans, chunkSamples };
}

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function loadModel(modelPath) {
  const bytes = new Uint8Array(require("node:fs").readFileSync(modelPath));
  const session = await ort.InferenceSession.create(bytes, {
    executionProviders: ["cpu"],
    graphOptimizationLevel: "all",
  });
  return session;
}

function pickPredictionTensor(outputs, labelCount) {
  const entries = Object.entries(outputs);
  const match = entries.find(([, t]) => t.dims?.length === 2 && t.dims[1] === labelCount);
  return match ? match[1] : entries[0][1];
}

async function analyzeFile(session, file, labels, opts) {
  const { chunkSeconds, overlapSeconds, minConf, batchSize } = opts;

  const decoded = decodeWav(file);
  const audio = toMonoAt(decoded.samples, decoded.sampleRate, SAMPLE_RATE);
  const { starts, spans, chunkSamples } = planChunks(audio.length, chunkSeconds, overlapSeconds, SAMPLE_RATE);

  if (!starts.length) {
    return { detections: [], seconds: 0, sampleRate: decoded.sampleRate };
  }

  const detections = [];
  const inputName = session.inputNames[0];
  const started = Date.now();

  for (let i = 0; i < starts.length; i += batchSize) {
    const batchCount = Math.min(batchSize, starts.length - i);
    const input = new Float32Array(batchCount * chunkSamples);
    for (let b = 0; b < batchCount; b += 1) {
      const startSample = starts[i + b];
      const available = Math.max(0, audio.length - startSample);
      const toCopy = Math.min(chunkSamples, available);
      if (toCopy > 0) {
        input.set(audio.subarray(startSample, startSample + toCopy), b * chunkSamples);
      }
    }

    const feeds = { [inputName]: new ort.Tensor("float32", input, [batchCount, chunkSamples]) };
    const outputs = await session.run(feeds);
    const tensor = pickPredictionTensor(outputs, labels.scientific.length);
    const data = tensor.data;
    const outDim = tensor.dims?.[1] ?? labels.scientific.length;

    for (let b = 0; b < batchCount; b += 1) {
      const offset = b * outDim;
      const [start, end] = spans[i + b];
      for (let c = 0; c < labels.scientific.length; c += 1) {
        const confidence = data[offset + c];
        if (confidence >= minConf) {
          detections.push({
            start,
            end,
            scientific: labels.scientific[c],
            common: labels.common[c],
            confidence,
          });
        }
      }
    }
  }

  detections.sort((a, b) => (a.start === b.start ? b.confidence - a.confidence : a.start - b.start));

  return {
    detections,
    seconds: (Date.now() - started) / 1000,
    sampleRate: decoded.sampleRate,
    durationSec: audio.length / SAMPLE_RATE,
  };
}

function topSummary(detections, n = 5) {
  const best = new Map();
  for (const d of detections) {
    const key = d.scientific.toLowerCase();
    const prev = best.get(key);
    if (!prev || d.confidence > prev.confidence) best.set(key, d);
  }
  return [...best.values()].sort((a, b) => b.confidence - a.confidence).slice(0, n);
}

async function main() {
  const targets = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (targets.length === 0) {
    console.error("usage: node scripts/analyze.mjs <file.wav|dir> [--min-conf 0.05] [--out data/detections]");
    process.exitCode = 1;
    return;
  }

  const modelPath = findAnyModel();
  const labelsPath = findAsset(LABELS_NAME) ?? findAsset("Labels.csv");

  if (!modelPath) {
    console.error("Model not found. Run scripts/download-model.ps1 from birdnet-V3.0-dev, or pass --model <path>.");
    process.exitCode = 1;
    return;
  }
  if (!labelsPath) {
    console.error("Labels CSV not found alongside the model.");
    process.exitCode = 1;
    return;
  }

  const minConf = Number(argValue("--min-conf", DEFAULT_MIN_CONF));
  const chunkSeconds = Number(argValue("--chunk", DEFAULT_CHUNK_SEC));
  const overlapSeconds = Number(argValue("--overlap", 0));
  const batchSize = Number(argValue("--batch", DEFAULT_BATCH));
  const outDir = resolve(process.cwd(), argValue("--out", "data/detections"));

  const labels = parseSemicolonCsv(require("node:fs").readFileSync(labelsPath, "utf8"));
  console.log(`model    ${modelPath}`);
  console.log(`labels   ${labels.scientific.length} species`);
  console.log(`settings chunk=${chunkSeconds}s overlap=${overlapSeconds}s minConf=${minConf}`);
  console.log("");

  console.time("model load");
  const session = await loadModel(modelPath);
  console.timeEnd("model load");

  const files = [];
  for (const t of targets) {
    const p = resolve(process.cwd(), t);
    if (!existsSync(p)) {
      console.error(`skip (missing) ${t}`);
      continue;
    }
    const ext = extname(p).toLowerCase();
    if (ext === ".wav") files.push(p);
    else if (ext === ".csv") continue;
    else files.push(...readdirSync(p).filter((f) => extname(f).toLowerCase() === ".wav").map((f) => resolve(p, f)));
  }

  if (!files.length) {
    console.error("No .wav files found.");
    console.error("Phone recordings are usually .m4a or .ogg. Convert first:");
    console.error("  ffmpeg -i clip.m4a clip.wav");
    return;
  }

  mkdirSync(outDir, { recursive: true });

  let totalDetections = 0;
  for (const file of files) {
    let result;
    try {
      result = await analyzeFile(session, file, labels, { chunkSeconds, overlapSeconds, minConf, batchSize });
    } catch (err) {
      console.error(`FAILED ${basename(file)}: ${err.message}`);
      continue;
    }

    const rows = result.detections.map((d) =>
      [
        d.start.toFixed(3),
        d.end.toFixed(3),
        csvEscape(d.scientific),
        csvEscape(d.common),
        d.confidence.toFixed(6),
      ].join(","),
    );
    const csv = ["start_sec,end_sec,scientific_name,common_name,confidence", ...rows].join("\n") + "\n";
    const outFile = resolve(outDir, `${basename(file).replace(/\.wav$/i, "")}.csv`);
    writeFileSync(outFile, csv, "utf8");

    totalDetections += result.detections.length;
    const dur = result.durationSec.toFixed(1);
    console.log(`${basename(file)}  ${dur}s audio  ${result.seconds.toFixed(1)}s compute  ${result.detections.length} detections`);
    for (const d of topSummary(result.detections)) {
      console.log(`    ${d.confidence.toFixed(3)}  ${d.common || d.scientific}  (${d.scientific})`);
    }
    if (!result.detections.length) {
      console.log("    (nothing above threshold — try a quieter clip, or lower --min-conf)");
    }
  }

  console.log("");
  console.log(`${files.length} file(s), ${totalDetections} detections -> ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

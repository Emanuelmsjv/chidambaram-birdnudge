import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SRC = join(homedir(), "Downloads", "Mobile Devices");
const OUT_DIR = join(ROOT, "clips");
const TARGET_RATE = 32000;

const KNOWN_DUPES = new Set(["Outside (2).m4a"]);

function findFfmpeg() {
  if (process.env.FFMPEG_PATH && existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  const onPath = ["ffmpeg", "ffmpeg.exe"].find((bin) => runQuiet(bin, ["-version"]));
  if (onPath) return onPath;

  for (const root of ["C:\\tools", join(homedir(), "scoop", "shims"), join(process.env.LOCALAPPDATA ?? "", "Programs")]) {
    if (!existsSync(root)) continue;
    const hit = walk(root, "ffmpeg.exe", 3);
    if (hit) return hit;
  }
  throw new Error(
    "ffmpeg not found. Install it or set FFMPEG_PATH. See README (Setup) for the curl command.",
  );
}

function walk(dir, target, depth) {
  if (depth < 0) return null;
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isFile() && e.name.toLowerCase() === target) return full;
    if (e.isDirectory()) {
      const hit = walk(full, target, depth - 1);
      if (hit) return hit;
    }
  }
  return null;
}

function run(bin, args) {
  const res = spawnSync(bin, args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (res.error) throw res.error;
  return `${res.stdout ?? ""}${res.stderr ?? ""}`;
}

function runQuiet(bin, args) {
  try {
    execFileSync(bin, args, { stdio: "ignore", windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function probe(ffmpeg, file) {
  const ffprobe = ffmpeg.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1");
  const args = ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", file];
  const raw = existsSync(ffprobe) ? run(ffprobe, args) : run(ffmpeg, ["-i", file]).trim();
  try {
    const parsed = JSON.parse(raw);
    const audio = (parsed.streams ?? []).find((s) => s.codec_type === "audio") ?? {};
    return {
      durationSec: Number(parsed.format?.duration) || 0,
      sourceCodec: audio.codec_name ?? null,
      sourceRate: Number(audio.sample_rate) || null,
      sourceChannels: Number(audio.channels) || null,
    };
  } catch {
    const line = raw.split(/\r?\n/).find((l) => /Duration/.test(l)) ?? "";
    const m = line.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    const seconds = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
    return { durationSec: seconds, sourceCodec: null, sourceRate: null, sourceChannels: null };
  }
}

function level(ffmpeg, file) {
  let out = "";
  try {
    out = run(ffmpeg, ["-hide_banner", "-i", file, "-af", "volumedetect", "-f", "null", "-"]);
  } catch {
    return { meanDb: null, peakDb: null };
  }
  const mean = out.match(/mean_volume:\s*(-?[\d.]+) dB/);
  const peak = out.match(/max_volume:\s*(-?[\d.]+) dB/);
  return {
    meanDb: mean ? Number(mean[1]) : null,
    peakDb: peak ? Number(peak[1]) : null,
  };
}

function hash(file, algo) {
  return createHash(algo).update(readFileSync(file)).digest("hex");
}

function main() {
  const srcDir = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_SRC;
  if (!existsSync(srcDir)) {
    console.error(`Source directory not found: ${srcDir}`);
    console.error("Usage: node scripts/convert.mjs [source-directory]");
    process.exit(1);
  }

  const ffmpeg = findFfmpeg();
  const sources = readdirSync(srcDir)
    .filter((n) => [".m4a", ".mp3", ".m4b", ".aac", ".ogg", ".opus", ".wav"].includes(extname(n).toLowerCase()))
    .filter((n) => !KNOWN_DUPES.has(n))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (sources.length === 0) {
    console.error(`No audio files in ${srcDir}`);
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`ffmpeg  ${ffmpeg}`);
  console.log(`source  ${srcDir}`);
  console.log(`output  ${OUT_DIR}  (${TARGET_RATE} Hz mono, 16-bit PCM)`);
  console.log("");

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceDir: srcDir,
    targetRate: TARGET_RATE,
    ffmpegVersion: run(ffmpeg, ["-version"]).split(/\r?\n/)[0],
    duplicateFiles: [...KNOWN_DUPES].map((name) => ({
      name,
      reason: "byte-identical to Outside.m4a, excluded from analysis",
    })),
    clips: [],
  };

  for (const name of sources) {
    const src = join(srcDir, name);
    const stem = basename(name, extname(name));
    const outName = `${stem.toLowerCase().replace(/\s+/g, "-").replace(/[()]/g, "")}.wav`;
    const out = join(OUT_DIR, outName);
    const meta = probe(ffmpeg, src);
    const before = level(ffmpeg, src);

    run(ffmpeg, [
      "-y", "-hide_banner", "-loglevel", "error",
      "-i", src,
      "-vn",
      "-ac", "1",
      "-ar", String(TARGET_RATE),
      "-c:a", "pcm_s16le",
      out,
    ]);

    const after = level(ffmpeg, out);
    const record = {
      sourceFile: name,
      sourceSha256: hash(src, "sha256"),
      sourceBytes: statSync(src).size,
      wav: `clips/${outName}`,
      wavSha256: hash(out, "sha256"),
      wavBytes: statSync(out).size,
      durationSec: Math.round((meta.durationSec + Number.EPSILON) * 10) / 10,
      sourceCodec: meta.sourceCodec,
      sourceRate: meta.sourceRate,
      sourceLevel: before,
      convertedLevel: after,
    };
    manifest.clips.push(record);

    console.log(
      `${outName.padEnd(16)} ${String(record.durationSec).padStart(5)}s  ` +
        `${String(record.sourceRate ?? "?").padStart(6)}Hz -> ${TARGET_RATE}  ` +
        `mean ${padNum(before.meanDb)} -> ${padNum(after.meanDb)} dB`,
    );
  }

  const manifestPath = join(OUT_DIR, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log("");
  console.log(`Wrote ${manifestPath}`);
  console.log(`${manifest.clips.length} clip(s), ${manifest.clips.reduce((a, c) => a + c.durationSec, 0).toFixed(1)}s total`);
}

function padNum(n) {
  if (n === null || n === undefined) return "   -";
  return n.toFixed(1).padStart(6);
}

main();

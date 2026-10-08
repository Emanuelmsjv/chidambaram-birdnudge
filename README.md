# chidambaram-birdnudge

Point an open-weight bird sound model at a 10-second recording of somewhere in
Chidambaram, Tamil Nadu. Get back one sentence telling you which species
plausibly live near you, whether they are in season right now, what time of day
they are worth listening for, and a real place within reach to go and stand.

The model already exists and is very good. It is also, on published evidence,
close to useless in this part of India. That gap is the project.

## The premise

A 2026 global evaluation of BirdNET across 4,224 soundscapes, 67 sites and every
continent, annotated by local experts, reported PR AUC of:

| Region | PR AUC |
| :--- | ---: |
| North America / Oceania / Europe | 0.16 – 0.23 |
| Central & South America | 0.13 |
| Africa and Asia | **0.03 – 0.04** |

Chidambaram sits in that last band. Globally, the share of predictions that are
correct (precision) is around 0.57–0.71, so roughly a third to a half of what it
tells you is wrong.

So this project does three things instead of pretending otherwise:

1. **Filters the model's output against a local species pack**, built from
   iNaturalist open observations within 30 km of Chidambaram. A prediction that
   is not a species anyone has recorded nearby is flagged rather than shown as a
   fact.
2. **Never asserts.** Every output is phrased as a suggestion with a confidence
   number, and tells you to check the spectrogram and play the segment back.
3. **Turns the residual uncertainty into a reason to go outside** rather than
   into a screen to stare at. If the best local match is a Purple Heron and it is
   06:00, the advice is to find a tank before sunrise and listen for the booming
   flight call. That is the whole point.

## Why open weights matter here specifically

The vocabulary of this tool is **a JSON file, not weights**. Adding a species,
removing one, or moving the boundary to a different district is a data edit. A
closed audio API cannot be fine-tuned on Cuddalore-district birdsong, and cannot
be restricted to the 130 species that actually live here.

The audio never leaves the machine. That is not a generic privacy claim: precise
locations of nests, roosts and threatened-species territories are genuinely
sensitive, and a cafe recording is a recording of a specific place at a specific
hour.

## Quick start

Requires Node 18+. No Python, no GPU, no API keys, no browser.

```bash
npm install
npm run setup     # downloads model weights (~69 MiB) and builds data/pack.json
```

Analyse a clip, then read the result:

```bash
npm run analyze -- clips/my-clip.wav
npm run summarize
npm run nudge -- data/detections/my-clip.csv --hour 6
```

To see the pipeline work before recording anything:

```bash
npm run summarize:samples
```

## How it works

The BirdNET+ ONNX graph takes **raw audio directly** — the spectrogram, mel
filterbank and both frequency bands are baked into the model. So this project
does not reimplement any feature extraction. It loads the graph with
`onnxruntime-node`, chunks audio into 3-second windows at 32 kHz, and reads
back class probabilities.

Measured on the development machine: 1.0 s to load the model, and **120 s of
audio analysed in 2.2 s** — roughly 55x realtime on CPU, no GPU.

A web interface is not required and is not part of this repository. The upstream
BirdNET web demo remains the nicer thing to *point at* audio interactively, but
nothing here depends on it.

## Recording

Record with the browser rather than a native voice-memo app: iOS and many
Android recorders apply aggressive noise suppression that attenuates quiet,
high-frequency bird calls and would bias results.

Audio must be **16-bit PCM WAV** for the decoder in `scripts/audio-io.mjs`.
Phone recorders usually produce `.m4a` or `.ogg`, so convert:

```bash
ffmpeg -i clip.m4a clip.wav
```

Suggested naming, so location and time need no separate bookkeeping:

```
clips/2026-10-08T1712_pichavaram_cafe.wav
clips/2026-10-08T1745_anna-salai_outdoor.wav
```

Keep indoor and outdoor recordings distinguishable. A cafe is a hostile acoustic
environment and it is better to have that measured than assumed.

## What a run actually looks like

The bundled upstream sample, `example/soundscape.wav` from the BirdNET
repository, is a two-minute recording from New York State. Analysed against the
Chidambaram pack:

```
soundscape.wav  120.0s audio  2.1s compute  99 detections
    0.946  Dark-eyed Junco  (Junco hyemalis)
    0.904  House Finch  (Haemorhous mexicanus)
    0.901  Black-capped Chickadee  (Poecile atricapillus)
    0.894  Blue Jay  (Cyanocitta cristata)
    0.816  Northern Cardinal  (Cardinalis cardinalis)
```

```
In-pack: 0/5 = 0.0%
```

The model is confidently right about New York birds and completely wrong about
Chidambaram. That gap is the entire reason this project exists, and it is also
the sanity check that the pack filter does real work: without it, the hiker is
told they are hearing a Blue Jay at 89% confidence.

## The metric, and its limits

`scripts/summarize.mjs` reports **the fraction of top-5 predictions that fall
inside the local species pack**.

This deliberately requires no manual labelling. Labelling your own test set with
the same model you are evaluating is circular, and a reviewer will ask. This
metric instead measures *how much of the model's output is plausible for this
location*, which is a different and more honest claim.

What it is not: it is not accuracy, and a high number does not mean the species
identifications are correct. Two species can both be locally plausible while only
one is actually present. Report `n` alongside the figure. With twenty clips it is
an anecdote with arithmetic on it.

## Data sources and licensing

| Component | Licence |
| :--- | :--- |
| This repository's code and data | CC BY-NC-SA 4.0 |
| BirdNET+ acoustic models | CC BY-NC-SA 4.0 — Cornell Lab of Ornithology and Chemnitz University of Technology |
| `data/pack.json` | derived from iNaturalist open observations; individual observations keep their own licences |
| `data/seasonal.json` | hand-curated, CC0-1.0 |
| `scripts/` | original work, CC BY-NC-SA 4.0 |

**Everything here is non-commercial.** BirdNET's weights are CC BY-NC-SA and this
project stays inside those terms. Model weights are not committed to this
repository; download them with the script above.

BirdNET is a developer preview (V3.0-preview3.1). Treat its outputs accordingly.

## Not built yet

Stated plainly so nobody assumes otherwise:

- No microphone capture, so audio still has to be recorded separately
- No local fine-tuning; the model is used as-is
- No PWA packaging and no hosted demo
- WAV only. No m4a or ogg decoding without ffmpeg on PATH
- Seasonal notes are hand-curated for roughly the top 45 species in the pack
- Place coordinates in `data/spots.json` are approximate and need verifying
- Distances and travel times are not precomputed because they depend on where you
  are sitting

# Submission post — Hacktoberfest Open-Source AI Challenge Week 1: Touch Grass

> Draft. Paste into DEV. Required tags: `#devchallenge` `#hf26challenge`.
> Everything below is sourced from the repo; no number is written from memory.

---

## Title (pick one)

- `chidambaram-birdnudge: a bird call identifier that works where there is no signal`
- `I fed a global bird model foreign audio. It was confidently wrong. Then I fixed it.`

**Tags:** `devchallenge` `hf26challenge` `hacktoberfest` `opensource` `birds` `onnx`

---

## Opening

I started this project because I noticed something wrong with how bird identification works in my own town.

BirdNET is a genuinely impressive open-source project. Point it at a recording and it will confidently tell you what you heard. I tried it on some audio recorded on my hostel campus in Chidambaram, Tamil Nadu, and it told me about **Rose-ringed Parakeet, Common Grackle, and Dark-eyed Junco**. The grackle is a North American species. It has never been in India. It was never in my garden. The model was not confused — it was *sure*, and wrong.

That is the whole problem in one clip. A global classifier trained on global audio will happily tell you about birds that live four thousand kilometres away, because nothing in its architecture knows or cares where you are standing. There is no "not in my region" button.

**chidambaram-birdnudge** is that button. It runs the same open weights on your own machine, then filters every prediction through a species list built from real observations near you. It costs nothing to run, needs no account, works with no signal, and never sends your recordings anywhere.

---

## What I Built

A local Node.js pipeline that takes phone recordings, identifies birds with an open-weight audio model, filters the results to a regional species list, and tells you where to go next.

The pipeline is five scripts:

| script | what it does |
| :--- | :--- |
| `download-model.mjs` | fetches the BirdNET+ weights and label set |
| `fetch-pack.mjs` | builds the local species list from iNaturalist observations within a radius |
| `convert.mjs` | batch-converts `.m4a` / `.mp3` / `.ogg` to the 32 kHz mono WAV the model wants |
| `analyze.mjs` | runs ONNX inference, writes a detection CSV per clip |
| `summarize.mjs` | scores predictions against the pack, writes `docs/overview.md` |
| `case.mjs` | generates the case study from the detection data |

Two design decisions are worth calling out.

**The model runs whole-file peak-normalised**, so a quiet outdoor clip and a loud indoor one are comparable. This matters more than it sounds — my outdoor clip was about 6 dB quieter than my indoor ones, and without normalisation the comparison would have been meaningless.

**`min-conf` defaults to 0.05, not 0.25.** BirdNET's own web demo defaults much higher, which means it silently discards low-confidence-but-real detections. I lowered it so the local filter gets to see everything, then let the pack do the rejecting. The pack is a better filter than an arbitrary threshold, because it is specific to where you are.

**Repo:** https://github.com/Emanuelmsjv/chidambaram-birdnudge

---

## The open-source AI at its core

| | |
| :--- | :--- |
| Model | BirdNET+ V3.0-preview3.1 Global 11K FP16 (pruned) |
| Weights format | ONNX, **68.2 MB** |
| Runtime | `onnxruntime-node` |
| Labels | 11,560 species, plain CSV |
| Hardware | CPU only. No GPU. No Python. |

The model is a TarsNet2 classifier — a frozen convolutional backbone with a linear classification head. That architecture is the reason this project is tractable offline: the expensive part is fixed, and the part you retarget is one dense layer.

**Speed:** the five-clip case study below is **83.8 seconds of audio, analysed in under 4 seconds** after a ~1 second model load. That is roughly 25× realtime on a laptop CPU with no accelerator.

---

## Why open innovation mattered here

The challenge asks where an open approach did better than a closed one. I can answer that with a measurement rather than an opinion.

**Same weights, same code, two recordings:**

| audio | in-pack fraction |
| :--- | :---: |
| upstream BirdNET sample, recorded in New York | **1 / 20** |
| my recordings, Chidambaram | **23 / 33** |

Nineteen of the twenty species the model proposed for the New York audio do not exist within 30 km of Chidambaram. The twentieth is House Sparrow at 0.051 — rank 20 of 20 by confidence, barely clearing my own threshold. Every confident prediction was a bird that does not live here:

A hosted bird-ID service gives you a fixed species list, the one its provider chose. If that list does not contain your local birds, you cannot add them. **With open weights I can change what the model is allowed to say.** That is the entire difference between 1/20 and 23/33, and it is not available behind an API.

The other reasons the open pieces mattered:

**It runs with no signal.** After a one-time 68 MB download, `npm run analyze` never touches the network. A bird call identifier is only useful where bird calls happen, which is usually nowhere with good connectivity. I did not get to actually test this on a trail with no bars — I tested it on a laptop, and the mobile app I originally used needed a working connection. I am not claiming more than I measured.

**Your recordings never leave your machine.** The case study below is audio recorded at a university hostel. Uploading that to a third-party inference endpoint hands someone a location-precise recording of where a person lives and when they were there. Local inference means the audio is read once by `decodeWav` and never transmitted.

**It costs nothing.** No API key, no per-minute billing, no quota. A hosted audio-classification endpoint bills by the minute precisely when you most want to use it and least want to depend on it.

**The model is replaceable.** The labels are a CSV and the regional list is JSON. Retargeting to another city is a data edit, not a code change. Nothing about the pipeline is specific to BirdNET except the inference call.

### Honest limits of the open approach

Being straightforward about where this does *not* win:

- The weights are **CC BY-NC-SA**, so this is non-commercial. That is fine for a personal tool and a real constraint if you wanted to build a product.
- Fine-tuning for a local species set is architecturally trivial here (frozen encoder, linear head, logistic regression on embeddings, trainable on CPU) but **I did not do it.** With four labelled clips and no working route to bulk training audio, any claim I made about it would be unverified.
- BirdNET's Python pipeline has features my port does not — proper spectrogram caching, multi-label handling, and more careful segmenting. I ported the part that made my question answerable, not the whole project.

---

## I took it outside

The brief offers "a bird call identifier that works on the trail with no signal" as an example. I took it literally.

I heard a group of **Yellow-billed Babbler** (*Argya affinis*) on my hostel campus and recorded five clips on my phone — two indoors, one outdoors, and two while I was talking, to see what happened. Then I ran them through the pipeline.

The species was already in my local pack at rank 18 of 130, with 19 iNaturalist observations in range — a locally well-established bird, not a rarity.

| clip | babblers audible? | model's best score |
| :--- | :--- | ---: |
| `inside-2` | yes | **0.870** |
| `inside` | yes | **0.812** |
| `speech-2` | yes | **0.961** |
| `speech` | **no** | **none** |
| `outside` | yes | **none** |

Three of the four clips where I confirmed the bird was audible got a correct first-place identification.

The two I find most interesting are the `speech` pair. Both were recorded in the same room, minutes apart, with me talking. I listened back afterwards to check what was in the background. In one, babblers were chirping behind my voice; in the other, there were none. The model returned 0.961 for the one where they were there and **nothing at all** for the one where they were not.

That distinction matters, because the cheap explanation would have been that the model just fires on human voices and happened to point at a common local babbler. Two clips with identical foreground content and opposite answers rules that out.

The one result I still cannot fully explain is `speech-2`, where the babbler is buried under speech and still scored 0.961. I am reporting it because it happened, not because I understand it.

---

## Demo

Real output from a real run, on the five clips described above:

```
model    ...\assets\BirdNET+_V3.0-preview3.1_Global_11K_FP16_pruned.onnx
labels   11560 species
settings chunk=3s overlap=0s minConf=0.05

model load: 971ms
inside-2.wav  9.9s audio  0.4s compute  6 detections
    0.870  Yellow-billed Babbler  (Argya affinis)
    0.589  Rufous Treepie  (Dendrocitta vagabunda)
    0.068  Indian White-eye  (Zosterops palpebrosus)
inside.wav  17.9s audio  0.5s compute  15 detections
    0.812  Yellow-billed Babbler  (Argya affinis)
    0.415  Common Grackle  (Quiscalus quiscula)
    0.283  Oriental Magpie-Robin  (Copsychus saularis)
outside.wav  17.5s audio  0.5s compute  9 detections
    0.873  Rose-ringed Parakeet  (Psittacula krameri)
    0.731  Common Myna  (Acridotheres tristis)
    0.509  Red-vented Bulbul  (Pycnonotus cafer)

5 file(s), 47 detections
```

And what the filter actually does with that output:

```
$ npm run summarize
Clips: 6  detections: 146
In-pack (top-5): 15/27 = 55.6%
In-pack (all 53 distinct): 24 = 45.3%
```

---

## What it got wrong

Every one of these is in the repo, not just here.

**It missed the bird entirely on the outdoor clip.** I was there, the babblers were there, and the model proposed parakeet and myna instead. That clip was also my quietest recording. I still do not know whether the model failed or the microphone failed. It is the first thing I would try to fix.

**Confidence is not a probability.** BirdNET will hand you 0.9 and mean something much weaker. The New York control demonstrates this directly — the model was extremely confident about species that were not present at all. The number is a ranking signal, nothing more.

**My species pack is biased, and I can show how.** It is built from iNaturalist, which is a *photography* platform. I pulled 1,000 research-grade observations from around Chidambaram and checked the result: **Indian White-eye appeared zero times.** It is one of the most common birds in India and it is, to my ear, constantly audible from my window. The pack over-represents birds people stop to photograph — Pied Stilt is the second most-recorded species in range — and under-represents small common passerines nobody bothers to upload.

So "not in your local pack" is weaker evidence than it appears. It means *not established as local by this data source*, not *absent*. I would not have found this without checking the raw observations against my own pack.

**I had a real bug for most of this project.** The pack builder wrote entries as `{ rank: i + 1, ...s }` — the spread lands after, so the taxonomic rank from iNaturalist overwrote my ordinal in all 130 entries. Every `rank` field was the string `"species"`. The ordering was still correct, which is exactly why I did not notice for weeks. Fixed in `a087f8f`.

**My recordings were not independent data.** I collected them, then evaluated the model on them. There is no held-out set, and with four positives any accuracy number would be meaningless. I have not claimed one anywhere.

---

## Build process

This project was built with an AI coding agent, and the session is linked below. The interesting part is not that it worked, but the two places where it did not:

- The `rank` bug above survived several rounds because the agent optimised the thing I asked about and the symptom I noticed — ordering — happened to still be correct.
- A `ffmpeg` download was corrupted twice in transit, producing a 66 MB "executable" that Windows rejected with *"not a valid application for this OS platform."* The PE header was valid and the machine type was correct; the file was truncated. Diagnosing that took longer than installing ffmpeg should have.

**My Agent Session:** [link to DevRelay embed]

---

## Prize Categories

- **Overall** — this is what I am actually aiming for
- **Best Use of Entire** — the project was built in an agent session and the write-up includes it

I considered claiming DigitalOcean and Render and deliberately did not. Deploying a deliberately-offline tool to a cloud runtime to win a hosting prize would contradict the entire premise of the project. Same reasoning for Sentry Agent Tracing — this is deterministic DSP with an ONNX model, no LLM calls, no tokens, no spans to trace.

---

## Try it

```sh
git clone https://github.com/Emanuelmsjv/chidambaram-birdnudge
cd chidambaram-birdnudge
npm install
npm run setup        # downloads the 68 MB model, builds your species pack

npm run convert      # phone .m4a -> 32 kHz mono WAV
npm run analyze clips --out data/detections
npm run summarize    # writes docs/overview.md
```

Requires Node 18+ and ffmpeg on PATH. No Python, no GPU, no API keys.

**Licence:** CC BY-NC-SA 4.0. BirdNET weights are CC BY-NC-SA. iNaturalist observation data retains its own per-record licences, referenced in `data/pack.json`.

---

## Full write-up

The complete case study, including the control methodology and every non-local species the model proposed, is in the repo: [docs/case-report.md](https://github.com/Emanuelmsjv/chidambaram-birdnudge/blob/main/docs/case-report.md)

---

## Checklist before publishing

- [ ] Paste into DEV
- [ ] Add tags `#devchallenge` `#hf26challenge`
- [ ] Paste terminal screenshot(s) if you took them — otherwise the code blocks stand on their own
- [ ] Insert the DevRelay agent session link
- [ ] Add a cover image (optional but entries with one stand out)
- [ ] Read the ground-truth wording — "babblers audible?" column is **your** field call, not mine
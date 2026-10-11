# Case study: Yellow-billed Babbler at Golden Jubilee Hostel

A single field observation, put through the pipeline, with the failures kept in.

## The observation

A group of **Yellow-billed Babbler** (*Argya affinis*) was identified by project author at Golden Jubilee Hostel campus, Chidambaram, Tamil Nadu on 2026-10-11.

- Basis: field identification by ear and sight
- Photographic reference: none available
- The identification was made by the observer before any model output was seen. No photograph was taken, so there is no independent reference for the species claim. The model output below is treated as corroboration of the observation, never as its source.

## Where this species sits locally

`Argya affinis` is **rank 18 of 130** in the Chidambaram species pack, with 19 iNaturalist observations in range. It is a locally well-established bird, not a rarity.

## Results

| clip | condition | segments | best Yellow-billed Babbler | segments hit | in-pack of all proposals |
| :--- | :--- | ---: | ---: | ---: | ---: |
| `inside` | indoor | 6 | 0.812 | 3/6 | 7/11 |
| `inside-2` | indoor | 3 | 0.870 | 2/3 | 2/5 |
| `outside` | outdoor | 6 | — | 0 | 5/7 |
| `speech` | indoor | 6 | — | 0 | 7/8 |
| `speech-2` | indoor | 4 | 0.961 | 3/4 | 2/2 |
| `soundscape` | foreign control | 40 | — | 0 | 1/20 |

### Where the model placed the observed species

- `inside`: **0.812**, rank 1 of 11 distinct species proposed, present in 3 of 6 segments.
- `inside-2`: **0.870**, rank 1 of 5 distinct species proposed, present in 2 of 3 segments.
- `outside`: **not detected.** The model still produced bird calls, led by Rose-ringed Parakeet 0.873, Common Myna 0.731, Red-vented Bulbul 0.509.

## What this does and does not establish

Of the 3 clips where the observer confirmed the species was present, the model ranked it above threshold in 2.

That is **corroboration, not accuracy**, and the distinction is not cosmetic:

1. **No independent reference exists.** There is no photograph, so nothing outside the observer's own identification can check the species claim.
2. **The sample is three clips, one bird, one person.** No accuracy figure computed from this would mean anything.
3. **The observer's identification is the load-bearing claim.** Everything else is the model agreeing with it.

## The two speech clips

These were recorded at the same hostel, with speech in the foreground. Whether babblers are audible behind the speech was **not verified**, so they cannot serve as clean negative controls and are excluded from the counts above.

- `speech` returned no Yellow-billed Babbler above 0.05.
- `speech-2` returned **Yellow-billed Babbler at 0.961**, in 3 of 4 segments.

## Foreign-audio control

The upstream BirdNET sample from New York scores **0 of 20** proposals inside the Chidambaram pack. The model was highly confident about species it had no business predicting here:

- Dark-eyed Junco (*Junco hyemalis*) at 0.946, across 11 segments
- House Finch (*Haemorhous mexicanus*) at 0.904, across 37 segments
- Black-capped Chickadee (*Poecile atricapillus*) at 0.901, across 6 segments
- Blue Jay (*Cyanocitta cristata*) at 0.894, across 14 segments
- Northern Cardinal (*Cardinalis cardinalis*) at 0.816, across 7 segments

Local recordings score 23/33 in pack. Same model, same code, same weights — the only variable is which species list the predictions are filtered against.

## Species proposed that do not live here

| species | best | clips |
| :--- | ---: | ---: |
| Dark-eyed Junco (*Junco hyemalis*) | 0.946 | 1 |
| House Finch (*Haemorhous mexicanus*) | 0.904 | 1 |
| Black-capped Chickadee (*Poecile atricapillus*) | 0.901 | 1 |
| Blue Jay (*Cyanocitta cristata*) | 0.894 | 1 |
| Northern Cardinal (*Cardinalis cardinalis*) | 0.816 | 1 |
| American Goldfinch (*Spinus tristis*) | 0.789 | 1 |
| Red Crossbill (*Loxia curvirostra*) | 0.418 | 1 |
| Common Grackle (*Quiscalus quiscula*) | 0.415 | 1 |
| White-eyed Vireo (*Vireo griseus*) | 0.276 | 1 |
| Killdeer (*Charadrius vociferus*) | 0.269 | 1 |
| Tufted Titmouse (*Baeolophus bicolor*) | 0.203 | 1 |
| Purple Finch (*Haemorhous purpureus*) | 0.184 | 1 |
| Brown Rock Chat (*Oenanthe fusca*) | 0.153 | 2 |
| American Robin (*Turdus migratorius*) | 0.152 | 1 |
| Carolina Wren (*Thryothorus ludovicianus*) | 0.148 | 1 |
| Alexandrine Parakeet (*Psittacula eupatria*) | 0.144 | 1 |
| Red-eyed Vireo (*Vireo olivaceus*) | 0.143 | 1 |
| Song Sparrow (*Melospiza melodia*) | 0.125 | 1 |
| Indian White-eye (*Zosterops palpebrosus*) | 0.068 | 1 |
| Water Rail (*Rallus aquaticus*) | 0.066 | 1 |
| White-breasted Nuthatch (*Sitta carolinensis*) | 0.065 | 1 |
| Eurasian Blackcap (*Sylvia atricapilla*) | 0.061 | 1 |
| Myrtle Warbler (*Setophaga coronata*) | 0.054 | 1 |
| Common Iora (*Aegithina tiphia*) | 0.054 | 1 |
| Great-tailed Grackle (*Quiscalus mexicanus*) | 0.054 | 1 |
| Indian Grey Hornbill (*Ocyceros birostris*) | 0.053 | 1 |
| American Crow (*Corvus brachyrhynchos*) | 0.052 | 1 |
| Little Swift (*Apus affinis*) | 0.052 | 1 |

These are the model's error modes on this audio. Any of them appearing in a top result is a reason to distrust the result, not a bird to go looking for.

**Caveat on the pack itself.** "Not in pack" does not always mean "does not occur locally". The pack is derived from iNaturalist research-grade records within 30 km, and iNaturalist under-reports some ubiquitous small passerines. Indian White-eye (*Zosterops palpebrosus*) did not appear once in 1000 research-grade observations pulled from the area, so a genuinely correct prediction of it would be flagged as locally absent here. Read this table as *not established as local by this data source*, not as proven absence.

## Reproducing this

```sh
npm run convert   # clips/*.m4a -> 32 kHz mono WAV, writes clips/manifest.json
npm run analyze clips --out data/detections
npm run summarize
npm run case
```

Audio used: 5 clips, 83.8s total, converted with ffmpeg version 9.0.2-essentials_build-www.gyan.dev Copyright (c) 2000-2026 the FFmpeg developers.

The source recordings are not committed. `clips/manifest.json` records a SHA-256 for each file so the exact inputs are verifiable if you have your own copies.

`Outside (2).m4a` was excluded: byte-identical to Outside.m4a, excluded from analysis.

## Honest limits

- Three clips, one species, one observer. This is a worked example, not an evaluation.
- No photograph means no independent check on the species identification.
- The two speech clips have unverified background content and are not usable as controls.
- Confidence values are not calibrated probabilities and must not be read as such — the foreign-audio control shows the model being confidently wrong about species that do not occur locally.
- A confidence above threshold is a prompt to go and look, never a substitute for looking.

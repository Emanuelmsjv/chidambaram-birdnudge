# Chidambaram bird ID — summary

Generated 2026-10-11 from 1 clip(s).

## Headline

**0.0% of top-5 predictions fall inside the Chidambaram species pack.**

- Clips analysed: 1
- Raw detections above 0.05: 99
- Top-5 predictions scored: 5
- In pack: 0  |  not in pack: 5
- Distinct local species seen: 0
- Distinct non-local species seen: 5

Pack: 130 species within Chidambaram, Tamil Nadu, India.

## Every distinct species the model proposed

Scoring every distinct species the model proposed, rather than only the top 5, uses far more of the model's output, so it is the more stable of the two figures. The top-5 number is kept because it reflects what a user would actually be shown.

- Distinct species proposed: 20
- Of those, in pack: 1 (5.0%)
- Not in pack: 19

local | clips | best | species
:--- | ---: | ---: | :---
no  |     1 | 0.946 | Dark-eyed Junco (Junco hyemalis)
no  |     1 | 0.904 | House Finch (Haemorhous mexicanus)
no  |     1 | 0.901 | Black-capped Chickadee (Poecile atricapillus)
no  |     1 | 0.894 | Blue Jay (Cyanocitta cristata)
no  |     1 | 0.816 | Northern Cardinal (Cardinalis cardinalis)
no  |     1 | 0.789 | American Goldfinch (Spinus tristis)
no  |     1 | 0.418 | Red Crossbill (Loxia curvirostra)
no  |     1 | 0.276 | White-eyed Vireo (Vireo griseus)
no  |     1 | 0.269 | Killdeer (Charadrius vociferus)
no  |     1 | 0.203 | Tufted Titmouse (Baeolophus bicolor)
no  |     1 | 0.184 | Purple Finch (Haemorhous purpureus)
no  |     1 | 0.152 | American Robin (Turdus migratorius)
no  |     1 | 0.148 | Carolina Wren (Thryothorus ludovicianus)
no  |     1 | 0.143 | Red-eyed Vireo (Vireo olivaceus)
no  |     1 | 0.125 | Song Sparrow (Melospiza melodia)
no  |     1 | 0.065 | White-breasted Nuthatch (Sitta carolinensis)
no  |     1 | 0.061 | Eurasian Blackcap (Sylvia atricapilla)
no  |     1 | 0.054 | Myrtle Warbler (Setophaga coronata)
no  |     1 | 0.052 | American Crow (Corvus brachyrhynchos)
yes |     1 | 0.051 | House Sparrow (Passer domesticus)

## Species found near Chidambaram

clips | best | species | season now | best time | where to go | listen for
---: | ---: | :--- | :--- | :--- | :--- | :---

## Predicted but not in the local pack

These are the model's error modes in this region.

clips | best | species | where it actually lives
---: | ---: | :--- | :---
    1 | 0.946 | ██████████████████ Dark-eyed Junco (Junco hyemalis) | outside the 30 km pack
    1 | 0.904 | ██████████████████ House Finch (Haemorhous mexicanus) | outside the 30 km pack
    1 | 0.901 | ██████████████████ Black-capped Chickadee (Poecile atricapillus) | outside the 30 km pack
    1 | 0.894 | ██████████████████ Blue Jay (Cyanocitta cristata) | outside the 30 km pack
    1 | 0.816 | ██████████████████ Northern Cardinal (Cardinalis cardinalis) | outside the 30 km pack

## Per clip

file | detections | in-pack | fraction
:--- | ---: | ---: | ---:
soundscape.csv | 99 | 0/5 | 0.0%

## Method

For each clip every 5 distinct species ranked by peak confidence is taken, then matched
against the local pack by binomial name. A prediction counts as local when a species with the
same genus and species appears in the iNaturalist-derived pack. No manual labelling is used,
so the score measures how much of the model's output is plausible for this location rather
than how often it is correct.

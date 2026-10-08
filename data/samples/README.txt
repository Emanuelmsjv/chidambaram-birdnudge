demo-*.csv
  Synthetic. Fabricated to demonstrate the CSV format so the scripts can run
  before any real field recordings exist.

upstream-soundscape-ny.csv
  REAL, but not from Chidambaram. This is the two-minute example/soundscape.wav
  bundled with the BirdNET repository, recorded in New York State. Useful as a
  negative control: the model identifies these birds confidently and correctly,
  and none of them appear in the Chidambaram pack, so it scores 0.0% in-pack.

Run them with:
  node scripts/summarize.mjs --dir data/samples

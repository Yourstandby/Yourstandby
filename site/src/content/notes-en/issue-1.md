## Why not just use a card service

The public instances return 503 whenever they feel like it, and their palettes never fit mine. Self-hosted, the cards are static files in the repo and the raw URLs stay stable forever.

## An 8px grid cured my sizing anxiety

Zero corner radius, and every spacing step is a multiple of 8. No more agonizing: just pick 8.

## Pixel animation has to cut frame by frame

`steps(1, end)` is the soul of this look. Any easing instantly makes it feel cheap.

## Light theme needs its own contrast pass

`#FF3B1F` only reaches 3.7:1 on a light background; it has to drop to `#C81E00` to clear 4.5:1.

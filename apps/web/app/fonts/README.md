# Fonts

`twemoji-chipperly.woff2` (63KB) is Twemoji Mozilla 0.7.0 (<https://github.com/mozilla/twemoji-colr>, COLRv0 build of Twitter's Twemoji graphics, CC-BY 4.0) subset to the 203 code points the app shows by itself: `EMOJI_CHOICES`, `AVATAR_EMOJI`, the starter defaults, story templates and every emoji literal in the web source. It is preloaded on every page.

`twemoji-all.woff2` (348KB) is the same font subset to the 1,580 emoji the picker's search can find. Their search words are in `apps/web/lib/emoji/all.json`, taken from emojibase-data 16.0.3 (MIT). No flags and no skin-tone variants. It is not preloaded: Chrome fetches it the first time a page shows an emoji the small file lacks, Safari fetches it once on first load.

Rebuild both after adding emoji anywhere in `packages/shared` or `apps/web`:

```bash
curl -L -o /tmp/TwemojiMozilla.ttf https://github.com/mozilla/twemoji-colr/releases/download/v0.7.0/Twemoji.Mozilla.ttf
curl -L -o /tmp/emojibase-compact.json https://cdn.jsdelivr.net/npm/emojibase-data@16.0.3/en/compact.json
pnpm -F @chipperly/web emoji:subset   # needs python3 with fonttools + brotli
```

Without the second download the script rebuilds the small file only.

`alegreya-latin.woff2` (variable, every weight) and `alegreya-sans-{400,500,700}-latin.woff2` are Alegreya and Alegreya Sans (SIL OFL), the Latin subsets Google Fonts serves (fonts.gstatic.com, Alegreya v41, Alegreya Sans v28). Kept in the repo so a build never needs Google Fonts to be reachable; `app/fonts.ts` loads them with `next/font/local`.

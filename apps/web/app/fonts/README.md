# Fonts

`twemoji-chipperly.woff2` (44KB) is Twemoji Mozilla 0.7.0 (<https://github.com/mozilla/twemoji-colr>, COLRv0 build of Twitter's Twemoji graphics, CC-BY 4.0) subset to the 152 code points the app can show: `EMOJI_CHOICES`, `AVATAR_EMOJI`, the starter defaults, story templates and every emoji literal in the web source.

Rebuild after adding emoji anywhere in `packages/shared` or `apps/web`:

```bash
curl -L -o /tmp/TwemojiMozilla.ttf https://github.com/mozilla/twemoji-colr/releases/download/v0.7.0/Twemoji.Mozilla.ttf
pnpm -F @chipperly/web emoji:subset   # needs python3 with fonttools + brotli
```

`alegreya-latin.woff2` (variable, every weight) and `alegreya-sans-{400,500,700}-latin.woff2` are Alegreya and Alegreya Sans (SIL OFL), the Latin subsets Google Fonts serves (fonts.gstatic.com, Alegreya v41, Alegreya Sans v28). Kept in the repo so a build never needs Google Fonts to be reachable; `app/fonts.ts` loads them with `next/font/local`.

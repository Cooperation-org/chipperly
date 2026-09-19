# Fonts

`twemoji-chipperly.woff2` (40KB) is Twemoji Mozilla 0.7.0 (<https://github.com/mozilla/twemoji-colr>, COLRv0 build of Twitter's Twemoji graphics, CC-BY 4.0) subset to the 147 code points the app can show: `EMOJI_CHOICES`, `AVATAR_EMOJI`, the starter defaults, story templates and every emoji literal in the web source.

Rebuild after adding emoji anywhere in `packages/shared` or `apps/web`:

```bash
curl -L -o /tmp/TwemojiMozilla.ttf https://github.com/mozilla/twemoji-colr/releases/download/v0.7.0/Twemoji.Mozilla.ttf
pnpm -F @chipperly/web emoji:subset   # needs python3 with fonttools + brotli
```

Alegreya and Alegreya Sans (SIL OFL) download at build time through `next/font/google` and are self-hosted in the export; nothing is fetched at runtime.

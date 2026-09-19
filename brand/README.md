# Brand sources

Source files from the owner (Taymar Pixley, Chipperly LLC), 19 Sept 2026. The app ships derived copies in `apps/web/public/brand/` and `apps/web/public/icons/`; regenerate those from here, never the other way round. Colours, fonts and the rules the UI follows are in `docs/brand.md`.

| File | What it is |
| --- | --- |
| `logo/logo.svg` | The mark: twelve-point pinwheel star with a teal disc. Source of every icon and the SVG favicon |
| `logo/star-symmetric.svg` | Same star, rays made symmetric, for chips and check marks (`components/ui/ChipStar.tsx` inlines its paths) |
| `logo/lockup-horizontal.png` | Star + "Chipperly" wordmark, 2500x1250, transparent |
| `logo/lockup-tagline.png` | Lockup with "Neurodivergent life made easier.", 1000x1000, white |
| `logo/favicon/` | RealFaviconGenerator package: `favicon.ico`, `favicon.svg`, 96px PNG, 180px apple-touch, 192/512 web-app icons, `site.webmanifest` |

Not committed: the two-page brand kit PDF (`Chipperly App Brand Kit.pdf`, 6MB, colours and the Altone / Code Pro LC font names) and the font trial files. They are in the client's Drive share; ask in the team channel.

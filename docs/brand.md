# Chipperly brand kit

Copied 17 Sept 2026 from the client's Drive download. **The logo was replaced on 19 Sept 2026** (see "Logo, 19 Sept 2026" below); the colours and fonts on the kit's pages still stand until the brand identity work says otherwise.

| File | What it is |
| --- | --- |
| `Chipperly App Brand Kit.pdf` | Two-page brand sheet: logo, icon, monochrome, colors, fonts, moodboard |
| `10.png`, `11.png` | The two PDF pages as images |
| `chipperly png.svg` | Old six-point star mark, superseded |
| `chipperly png.png` | Old star mark, raster, superseded |
| `chipperly logo png.png` | Old lockup, superseded |
| `chipperly font png.png` | Font specimen |
| `fonts-extracted/` | Subsets pulled out of the PDF for reference only. Not usable in the app (see below) |

## Logo, 19 Sept 2026

The owner redrew the mark: a twelve-point pinwheel star with a teal disc in the centre, wordmark "Chipperly" (capital C) in a bold serif, tagline "Neurodivergent life made easier." Sources are committed in `brand/logo/` (logo SVG, both lockups, the symmetric star used for chips and check marks, the favicon package). Shipped as `apps/web/public/brand/` (`mark.svg`, `mark.png`, `logo.png`, `logo-tagline.png`) and `apps/web/public/icons/` (the owner's favicon package plus a maskable 512 rendered from the SVG).

Logo colours, for reference only. None of them is a UI token: the centre teal `#13B6A5` is 2.5:1 against white, so it cannot carry text or be the action colour. Buttons stay on `#1F6F78`.

| Where | Hex |
| --- | --- |
| Centre disc | `#13B6A5` |
| Rays | `#B5D222` lime, `#24A6E1` blue, `#815E98` purple, `#DF5A20` red-orange, `#F89C10` orange, `#FDDF1E` yellow |

## Colors

| Role | Hex | Use |
| --- | --- | --- |
| Primary | `#1F6F78` | Buttons, active nav, headings, checks |
| Secondary | `#71A6A6` | Borders, secondary buttons, tags |
| Accent | `#F7931E` | Earned chips, celebrations only |
| Background | `#FAF8F5` | Page canvas (the PDF prints `#35BECD` under the cream swatch; that hex is wrong, the swatch is cream) |
| Neutral | `#3D3D3D` | Body text |

## Fonts

Brand: **Altone** (headings), **Code Pro LC** (body, labels).

The PDF embeds `AltoneTrial-Regular`, `AltoneTrial-Bold`, `CodePro-NormalLC`, `CodePro-BoldLC` as subsets only (Altone Bold: 8 glyphs, no digits anywhere). They cannot be used in the app. Needed from the client: licensed Altone Regular + Bold and Code Pro LC Normal + Bold as WOFF2 or OTF. Altone is sold by Ahmet Altun; Code Pro by Fontfabric. "Trial" cuts cannot ship.

Until the files arrive: Outfit (for Altone) and Montserrat (for Code Pro), self-hosted. Same fallback chain is in the app CSS, so swapping is a file drop.

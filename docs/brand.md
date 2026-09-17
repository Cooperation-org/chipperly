# Chipperly brand kit

Copied 17 Sept 2026 from the client's Drive download.

| File | What it is |
| --- | --- |
| `Chipperly App Brand Kit.pdf` | Two-page brand sheet: logo, icon, monochrome, colors, fonts, moodboard |
| `10.png`, `11.png` | The two PDF pages as images |
| `chipperly png.svg` | Star mark, vector. Use this for the app icon and favicon |
| `chipperly png.png` | Star mark, raster |
| `chipperly logo png.png` | Star mark + wordmark lockup |
| `chipperly font png.png` | Font specimen |
| `fonts-extracted/` | Subsets pulled out of the PDF for reference only. Not usable in the app (see below) |

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

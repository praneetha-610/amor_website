# Licensed script fonts — put your files here

Both fonts are **paid**. They are not in this repo, and nothing was downloaded from anywhere.
Until you add them, the site shows free stand-in scripts (Yellowtail / Lobster) so it still looks right.
The moment the files exist, the site uses them — no code change needed.

## Where to buy (choose a licence that allows web / @font-face use)
- **Sloop Script Pro** (Lipton Letter Design) — https://liptonletterdesign.com/fonts/sloop-script/ or MyFonts
  (web licence = single domain; Regular / Medium / Bold each ≈ $29).
- **Boardley Script – Layered** (Craft Supply) — https://craftsupply.co/product/boardley-script-layered-font/
  (pick a *Website* licence: "@font-face", 100,000 monthly views, or Extended for unlimited).
  It includes **two fonts: Boardley Script + Boardley Extrude** — those are the "layers".

## File names (EXACT)
Copy the files you receive here and rename them. `.otf` works as-is (no conversion needed);
`.woff2` is smaller if your licence allows converting.

| Burger | Font | Save as |
|---|---|---|
| Super Cheese | Sloop Script Pro (Regular, Medium or Bold — your choice) | `SloopScriptPro.otf`  (or `.woff2`) |
| Nashville | Boardley Script (main letters) | `BoardleyScript.otf`  (or `.woff2`) |
| Nashville | Boardley Extrude (shadow layer) | `BoardleyExtrude.otf` (or `.woff2`) |

Then commit + push; Vercel redeploys and the burger page titles switch automatically.
Colours of the layers are editable at the top of the Nashville block in `styles/fonts.css`.

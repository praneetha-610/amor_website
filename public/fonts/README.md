# Licensed script fonts — drop your files here

These two fonts are commercial. They are **not** included in this repo and were not
downloaded from anywhere. Buy/licence them (with a **web / webfont licence**), then copy the
files into this folder using EXACTLY these names. Nothing else needs to change —
the site detects the files and switches the burger titles automatically.

## Super Cheese — Sloop Script Pro
| File | Required |
|---|---|
| `SloopScriptPro.woff2` | yes — web format only (convert from the .otf/.ttf you bought — e.g. with fonttools or Font Squirrel's generator, *if your licence allows web conversion*) |

## Nashville — Boardley Script (Layered)
A "layered" font ships as several files that stack in different colours. Rename the ones you
receive to these names (only `Base` is required; the other layers are optional):

| File | Layer | Default colour (edit in `styles/fonts.css`) |
|---|---|---|
| `BoardleyScript-Base.woff2` | main letterforms — **required** | white |
| `BoardleyScript-Shadow.woff2` | drop-shadow / extrusion layer | deep red |
| `BoardleyScript-Detail.woff2` | highlight / inline detail layer | hot orange |

If your purchase has different layers, map them onto Shadow/Detail — whichever looks best.

## Until the files are here
The burger pages keep the current bold sans titles. Nothing breaks and no generic script
font is substituted.

## Where it's used
`styles/fonts.css` (declarations + colours) · `components/ScriptTitle.tsx` · `components/ScriptFonts.tsx`
Text shown in script is `scriptTitle` in `config/site.ts`.

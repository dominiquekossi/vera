# Vera — variant review cockpit

A single-screen cockpit for reviewing genetic variants. It pairs a genome browser
([gosling.js](http://gosling-lang.org)) with a side panel that aggregates, in one
place, the evidence an analyst would otherwise gather across ClinVar, gnomAD and
OMIM/HPO tabs.

The MVP tells one coherent story on load: a **heterozygous LMNA deletion** on
chr1 (hg38) where the coverage track drops to ~half and pathogenic ClinVar variants
sit in the same region. Brush the ideogram to move, zoom in until the lollipops
appear, then click one to open its dossier.

## Running

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

### The demo flow

1. **Overview + brush** — the top ideogram of chr1 has a blue brush. Drag it or
   resize its edges; the whole detail view follows.
2. **Coverage (CNV signal)** — the bottom track shows read depth. Over the LMNA
   region it drops from ~30× to ~15×, the signature of a heterozygous deletion.
3. **Variants (semantic zoom)** — zoomed out, variant density shows as a stacked
   bar of clinical-significance classes; below ~300 kb it becomes individual
   lollipops, coloured by significance (red = pathogenic … green = benign).
4. **Dossier** — click a lollipop. The right panel opens with that variant's
   ClinVar classification, gnomAD population frequency, and associated diseases /
   HPO terms. Each source loads independently, so one failing or having no record
   does not blank the others.

## Where the example data comes from

| File | Contents | Source |
| --- | --- | --- |
| `public/data/variants.example.csv` | 41 variants (GBA1, LMNA, NTRK1) with position, ref/alt, significance, HGVS, VCV id | **Real** — pulled from ClinVar via NCBI E-utilities |
| `public/data/variant-density.example.csv` | the same variants pre-binned to 250 kb (for the zoomed-out stacked bar) | derived from the file above |
| `public/data/coverage.example.csv` | read depth over chr1:155.1–157 Mb with a deletion across LMNA | **Simulated** (see below) |
| chr1 cytoband ideogram | hg38 cytobands | public dataset (`gemini-datasets`) |

The variant tables were generated once from ClinVar; the script is not part of the
app. To use your own cohort, replace `variants.example.csv` (same columns) and
regenerate the density file.

## Real vs. mock

**Real, live APIs** (all public, no key, called directly from the browser — CORS
verified):

- **ClinVar** — NCBI E-utilities (`esearch` + `esummary`). Classification, reported
  conditions, and the direct VCV link, looked up by hg38 position + ref/alt.
- **gnomAD** — official GraphQL API (`gnomad_r4`). Allele frequency, allele count,
  rsID, and the per-ancestry breakdown.
- **Disease / phenotype** — HPO (Jax ontology) API. Diseases associated with the
  gene, carrying their real OMIM / Orphanet ids, plus HPO terms.

**Simulated / mock:**

- **Coverage** — `coverage.example.csv` is synthetic read depth (flat ~30× baseline
  with a ~15× deletion over LMNA), generated to make the CNV story coherent with the
  variants. It is **not** a sequenced sample. Swap it for a real coverage track when
  wiring up actual data.
- **OMIM text** — the official OMIM API needs a per-institution key and forbids
  browser calls, so the panel **links** to the correct OMIM entry (via the real ids
  from HPO) rather than embedding OMIM's text. Marked `TODO(real OMIM API)` in
  `src/evidence/omim.ts`; embedding it would need a small server-side proxy.

## How it is built

- **Stack** — Vite + React 18 + TypeScript; `gosling.js` 1.0.7 with its `higlass`
  and `pixi.js` peers. (React is pinned to 18 because gosling.js 1.0.7 predates 19.)
- **Spec** — `src/specs/overviewDetail.ts` is the whole Gosling visualization:
  overview ideogram + brush, and a detail view (cytoband, variant lollipops with
  semantic zoom, coverage) linked by a shared `linkingId`.
- **Evidence providers** — `src/evidence/` has one module per source
  (`clinvar.ts`, `gnomad.ts`, `omim.ts`), a promise cache, and a `useEvidence` hook
  that exposes a `loading | empty | error | success` state per source.
- **Click → variant** — gosling.js 1.0.7 does not fire mark-level click events for
  this overlaid track, so `src/components/trackScale.ts` reads the track's own
  `_xScale` to map a click's pixel to a genomic position, matched against the
  variant table in 2D (position + significance row).

See `relatorio.md` for the full build notes.

import type { GoslingSpec } from 'gosling.js'

/** Shared by the brush in the overview and the x axis of the detail view. */
const DETAIL_LINK = 'detail'

/** Referenced from the viewer to resolve clicks back to a variant. */
export const DETAIL_VIEW_ID = 'detail-view'
/** The compiler preserves `title` but not `id`, so clicks match on this. */
export const VARIANT_TRACK_TITLE = 'Variant significance (semantic zoom — click a lollipop)'

/**
 * Resolve a file in `public/data/` against the app's base path. BASE_URL is `/`
 * in dev and `/vera/` on GitHub Pages, so this keeps the CSVs reachable in both.
 */
const dataUrl = (file: string) => `${import.meta.env.BASE_URL}data/${file}`

const CYTOBAND_URL =
  'https://raw.githubusercontent.com/sehilyi/gemini-datasets/master/data/UCSC.HG38.Human.CytoBandIdeogram.csv'

/**
 * Simulated read-depth for the demo case: flat ~30x baseline with a heterozygous
 * deletion (~15x) across LMNA, co-located with the LMNA ClinVar variants so the
 * coverage drop and the pathogenic lollipops tell one story. See README.
 */
const COVERAGE_URL = dataUrl('coverage.example.csv')

/**
 * Real ClinVar records for GBA1, LMNA and NTRK1 on chr1, plus the same variants
 * pre-binned to 250 kb. Gosling cannot count raw CSV rows into a stacked bar on
 * the fly, so the zoomed-out view reads the aggregated file — the same split the
 * official ClinVar example uses.
 */
export const VARIANTS_URL = dataUrl('variants.example.csv')
const VARIANT_DENSITY_URL = dataUrl('variant-density.example.csv')

/** Below this visible width (in bp) the track switches to lollipops. */
const LOLLIPOP_ZOOM_BP = 300000

/** Order also drives the lollipop rows top-to-bottom (used to resolve clicks). */
export const SIGNIFICANCE_DOMAIN = [
  'Pathogenic',
  'Likely_pathogenic',
  'Uncertain_significance',
  'Likely_benign',
  'Benign',
]

const SIGNIFICANCE_RANGE = [
  '#D62728',
  '#FF9896',
  '#9E9E9E',
  '#98DF8A',
  '#2CA02C',
]

const STAIN_DOMAIN = [
  'gneg',
  'gpos25',
  'gpos50',
  'gpos75',
  'gpos100',
  'gvar',
  'stalk',
  'acen',
]

const STAIN_RANGE = [
  '#F7F7F7',
  '#D9D9D9',
  '#979797',
  '#636363',
  '#2B2B2B',
  '#A0A0F2',
  '#63A1F2',
  '#B40101',
]

export const overviewDetailSpec: GoslingSpec = {
  assembly: 'hg38',
  spacing: 50,
  views: [
    {
      xDomain: { chromosome: 'chr1' },
      tracks: [
        {
          title: 'Overview — chr1 ideogram',
          alignment: 'overlay',
          data: {
            url: CYTOBAND_URL,
            type: 'csv',
            chromosomeField: 'Chromosome',
            genomicFields: ['chromStart', 'chromEnd'],
          },
          tracks: [
            { mark: 'rect' },
            {
              mark: 'brush',
              x: { linkingId: DETAIL_LINK },
              color: { value: '#3B82F6' },
              opacity: { value: 0.25 },
              stroke: { value: '#1D4ED8' },
              strokeWidth: { value: 1 },
            },
          ],
          x: { field: 'chromStart', type: 'genomic', axis: 'bottom' },
          xe: { field: 'chromEnd', type: 'genomic' },
          color: {
            field: 'Stain',
            type: 'nominal',
            domain: STAIN_DOMAIN,
            range: STAIN_RANGE,
          },
          stroke: { value: '#808080' },
          strokeWidth: { value: 0.3 },
          width: 800,
          height: 40,
        },
      ],
    },
    {
      id: DETAIL_VIEW_ID,
      linkingId: DETAIL_LINK,
      // Opens on the LMNA deletion: coverage drop + pathogenic/VUS lollipops in view.
      xDomain: { chromosome: 'chr1', interval: [156095000, 156160000] },
      tracks: [
        {
          title: 'Detail — region selected by the brush',
          data: {
            url: CYTOBAND_URL,
            type: 'csv',
            chromosomeField: 'Chromosome',
            genomicFields: ['chromStart', 'chromEnd'],
          },
          mark: 'rect',
          x: { field: 'chromStart', type: 'genomic', axis: 'top' },
          xe: { field: 'chromEnd', type: 'genomic' },
          color: {
            field: 'Stain',
            type: 'nominal',
            domain: STAIN_DOMAIN,
            range: STAIN_RANGE,
          },
          stroke: { value: '#808080' },
          strokeWidth: { value: 0.3 },
          width: 800,
          height: 60,
        },
        {
          title: VARIANT_TRACK_TITLE,
          alignment: 'overlay',
          data: {
            url: VARIANTS_URL,
            type: 'csv',
            chromosomeField: 'chrom',
            genomicFields: ['pos'],
          },
          tooltip: [
            { field: 'gene', type: 'nominal', alt: 'Gene' },
            { field: 'hgvs', type: 'nominal', alt: 'HGVS' },
            { field: 'significance', type: 'nominal', alt: 'ClinVar' },
          ],
          tracks: [
            {
              mark: 'bar',
              x: { field: 'pos', type: 'genomic' },
              y: {
                field: 'significance',
                type: 'nominal',
                domain: SIGNIFICANCE_DOMAIN,
                baseline: 'Uncertain_significance',
                range: [130, 20],
              },
              size: { value: 1 },
              color: { value: '#B0B0B0' },
              stroke: { value: '#B0B0B0' },
              strokeWidth: { value: 1 },
              visibility: [
                {
                  measure: 'zoomLevel',
                  target: 'mark',
                  threshold: LOLLIPOP_ZOOM_BP,
                  operation: 'LT',
                  transitionPadding: LOLLIPOP_ZOOM_BP,
                },
              ],
            },
            {
              mark: 'point',
              x: { field: 'pos', type: 'genomic' },
              y: {
                field: 'significance',
                type: 'nominal',
                domain: SIGNIFICANCE_DOMAIN,
                baseline: 'Uncertain_significance',
                range: [130, 20],
              },
              size: { value: 8 },
              opacity: { value: 0.9 },
              mouseEvents: { click: true, mouseOver: true },
              tooltip: [
                { field: 'gene', type: 'nominal', alt: 'Gene' },
                { field: 'hgvs', type: 'nominal', alt: 'HGVS' },
                { field: 'significance', type: 'nominal', alt: 'ClinVar' },
              ],
              style: { mouseOver: { stroke: '#111', strokeWidth: 2 } },
              visibility: [
                {
                  measure: 'zoomLevel',
                  target: 'mark',
                  threshold: LOLLIPOP_ZOOM_BP,
                  operation: 'LT',
                  transitionPadding: LOLLIPOP_ZOOM_BP,
                },
              ],
            },
            {
              data: {
                url: VARIANT_DENSITY_URL,
                type: 'csv',
                chromosomeField: 'chrom',
                genomicFields: ['binStart', 'binEnd'],
              },
              mark: 'bar',
              x: { field: 'binStart', type: 'genomic' },
              xe: { field: 'binEnd', type: 'genomic' },
              y: { field: 'count', type: 'quantitative', axis: 'none' },
              visibility: [
                {
                  measure: 'zoomLevel',
                  target: 'mark',
                  threshold: LOLLIPOP_ZOOM_BP,
                  operation: 'GT',
                  transitionPadding: LOLLIPOP_ZOOM_BP,
                },
              ],
            },
          ],
          color: {
            field: 'significance',
            type: 'nominal',
            domain: SIGNIFICANCE_DOMAIN,
            range: SIGNIFICANCE_RANGE,
            legend: true,
          },
          width: 800,
          height: 150,
        },
        {
          title: 'Coverage (read depth, simulated)',
          data: {
            url: COVERAGE_URL,
            type: 'csv',
            chromosomeField: 'chrom',
            genomicFields: ['start', 'end'],
          },
          mark: 'area',
          x: { field: 'start', type: 'genomic' },
          xe: { field: 'end', type: 'genomic' },
          y: { field: 'coverage', type: 'quantitative', axis: 'right' },
          color: { value: '#4C78A8' },
          width: 800,
          height: 120,
        },
      ],
    },
  ],
}

import { createCache } from './cache'
import { NotFoundError, bareChrom, variantKey, type Variant } from './types'

const GNOMAD_API = 'https://gnomad.broadinstitute.org/api'
const DATASET = 'gnomad_r4'

/** gnomAD reports sub-cohorts (`nfe_XX`) alongside cohorts; keep only the latter. */
const ANCESTRY_LABELS: Record<string, string> = {
  afr: 'African / African-American',
  amr: 'Admixed American',
  asj: 'Ashkenazi Jewish',
  eas: 'East Asian',
  fin: 'Finnish',
  mid: 'Middle Eastern',
  nfe: 'Non-Finnish European',
  sas: 'South Asian',
  ami: 'Amish',
  remaining: 'Remaining',
}

export interface PopulationFrequency {
  id: string
  label: string
  ac: number
  an: number
  af: number
}

export interface GnomadEvidence {
  variantId: string
  rsids: string[]
  /** Combined exome + genome allele frequency. */
  af: number | null
  ac: number | null
  an: number | null
  populations: PopulationFrequency[]
  url: string
}

interface GnomadCohort {
  ac?: number | null
  an?: number | null
  af?: number | null
  populations?: { id: string; ac: number; an: number }[] | null
}

const QUERY = `query VariantEvidence($id: String!, $dataset: DatasetId!) {
  variant(variantId: $id, dataset: $dataset) {
    variant_id
    rsids
    genome { ac an af populations { id ac an } }
    exome { ac an af populations { id ac an } }
  }
}`

function mergePopulations(cohorts: (GnomadCohort | null | undefined)[]): PopulationFrequency[] {
  const totals = new Map<string, { ac: number; an: number }>()

  for (const cohort of cohorts) {
    for (const pop of cohort?.populations ?? []) {
      if (!(pop.id in ANCESTRY_LABELS)) continue // drops sex-split sub-cohorts
      const running = totals.get(pop.id) ?? { ac: 0, an: 0 }
      running.ac += pop.ac
      running.an += pop.an
      totals.set(pop.id, running)
    }
  }

  return [...totals.entries()]
    .map(([id, { ac, an }]) => ({
      id,
      label: ANCESTRY_LABELS[id],
      ac,
      an,
      af: an > 0 ? ac / an : 0,
    }))
    .sort((a, b) => b.af - a.af)
}

async function load(variant: Variant, signal?: AbortSignal): Promise<GnomadEvidence> {
  if (!variant.ref || !variant.alt) {
    throw new Error('gnomAD needs ref and alt alleles, which this variant does not carry')
  }

  const variantId = `${bareChrom(variant.chrom)}-${variant.pos}-${variant.ref}-${variant.alt}`

  const response = await fetch(GNOMAD_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { id: variantId, dataset: DATASET } }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`gnomAD responded ${response.status} ${response.statusText}`)
  }

  const payload = (await response.json()) as {
    data?: { variant?: { variant_id: string; rsids?: string[] | null; genome?: GnomadCohort | null; exome?: GnomadCohort | null } | null }
    errors?: { message: string }[]
  }

  // gnomAD answers 200 with an `errors` array when a variant is absent.
  if (payload.errors?.length) {
    const message = payload.errors[0].message
    if (/not found/i.test(message)) throw new NotFoundError('gnomAD')
    throw new Error(message)
  }

  const found = payload.data?.variant
  if (!found) throw new NotFoundError('gnomAD')

  const ac = (found.genome?.ac ?? 0) + (found.exome?.ac ?? 0)
  const an = (found.genome?.an ?? 0) + (found.exome?.an ?? 0)

  return {
    variantId: found.variant_id,
    rsids: found.rsids ?? [],
    ac,
    an,
    af: an > 0 ? ac / an : null,
    populations: mergePopulations([found.genome, found.exome]),
    url: `https://gnomad.broadinstitute.org/variant/${variantId}?dataset=${DATASET}`,
  }
}

const cache = createCache<GnomadEvidence>()

export function fetchGnomad(variant: Variant, signal?: AbortSignal): Promise<GnomadEvidence> {
  return cache.get(variantKey(variant), () => load(variant, signal))
}

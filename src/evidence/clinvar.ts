import { createCache } from './cache'
import { NotFoundError, bareChrom, variantKey, type Variant } from './types'

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'

export interface ClinVarEvidence {
  accession: string
  title: string
  classification: string
  reviewStatus: string
  lastEvaluated: string
  conditions: string[]
  url: string
}

interface ESummaryRecord {
  accession?: string
  title?: string
  germline_classification?: {
    description?: string
    review_status?: string
    last_evaluated?: string
    trait_set?: { trait_name?: string }[]
  }
  variation_set?: { canonical_spdi?: string }[]
}

/** SPDI looks like `NC_000001.11:155240628:C:T` — position is 0-based. */
function spdiAlleles(record: ESummaryRecord): { ref: string; alt: string } | null {
  const spdi = record.variation_set?.[0]?.canonical_spdi
  if (!spdi) return null
  const parts = spdi.split(':')
  if (parts.length < 4) return null
  return { ref: parts[2], alt: parts[3] }
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`ClinVar responded ${response.status} ${response.statusText}`)
  }
  return response.json()
}

async function load(variant: Variant, signal?: AbortSignal): Promise<ClinVarEvidence> {
  const term = `${bareChrom(variant.chrom)}[chr] AND ${variant.pos}[chrpos38]`
  const search = (await getJson(
    `${EUTILS}/esearch.fcgi?db=clinvar&retmode=json&retmax=20&term=${encodeURIComponent(term)}`,
    signal
  )) as { esearchresult?: { idlist?: string[] } }

  const ids = search.esearchresult?.idlist ?? []
  if (ids.length === 0) throw new NotFoundError('ClinVar')

  const summary = (await getJson(
    `${EUTILS}/esummary.fcgi?db=clinvar&retmode=json&id=${ids.join(',')}`,
    signal
  )) as { result?: Record<string, ESummaryRecord> & { uids?: string[] } }

  const records = (summary.result?.uids ?? [])
    .map((uid) => summary.result?.[uid])
    .filter((r): r is ESummaryRecord => Boolean(r))

  // A position can hold several alleles; keep the one matching this ref/alt.
  const match =
    records.find((record) => {
      const alleles = spdiAlleles(record)
      if (!alleles || !variant.ref || !variant.alt) return false
      return alleles.ref === variant.ref && alleles.alt === variant.alt
    }) ?? (records.length === 1 ? records[0] : undefined)

  if (!match) throw new NotFoundError('ClinVar')

  const germline = match.germline_classification
  const accession = match.accession ?? variant.clinvarId ?? ''

  return {
    accession,
    title: match.title ?? '',
    classification: germline?.description ?? 'Not provided',
    reviewStatus: germline?.review_status ?? '',
    lastEvaluated: germline?.last_evaluated ?? '',
    conditions: (germline?.trait_set ?? [])
      .map((t) => t.trait_name ?? '')
      .filter((name) => name.length > 0),
    url: accession
      ? `https://www.ncbi.nlm.nih.gov/clinvar/variation/${accession.replace(/^VCV0*/, '')}/`
      : 'https://www.ncbi.nlm.nih.gov/clinvar/',
  }
}

const cache = createCache<ClinVarEvidence>()

export function fetchClinVar(variant: Variant, signal?: AbortSignal): Promise<ClinVarEvidence> {
  return cache.get(variantKey(variant), () => load(variant, signal))
}

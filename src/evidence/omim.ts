import { createCache } from './cache'
import { NotFoundError, type Variant } from './types'

/**
 * Gene-level evidence: diseases and phenotype terms.
 *
 * The data comes from the Human Phenotype Ontology API (public, no key), which
 * returns disease entries already carrying their OMIM and Orphanet identifiers.
 * We use those identifiers to link straight to the relevant OMIM entry.
 *
 * TODO(real OMIM API): omim.org exposes api.omim.org/api, but it requires a
 * per-institution API key and forbids browser-side calls, so pulling OMIM text
 * (inheritance, allelic variants, clinical synopsis) needs a small server-side
 * proxy holding the key. Until then this module links out to OMIM rather than
 * embedding its content.
 */
const HPO_API = 'https://ontology.jax.org/api/network'

export interface DiseaseLink {
  id: string
  name: string
  /** Present for OMIM-sourced diseases; Orphanet entries link to Orphanet. */
  url: string
  source: 'OMIM' | 'Orphanet' | 'Other'
}

export interface PhenotypeTerm {
  id: string
  name: string
  url: string
}

export interface GeneEvidence {
  symbol: string
  ncbiGeneId: string
  diseases: DiseaseLink[]
  phenotypes: PhenotypeTerm[]
  phenotypeCount: number
  omimSearchUrl: string
}

function diseaseLink(id: string, name: string): DiseaseLink {
  if (id.startsWith('OMIM:')) {
    return { id, name, source: 'OMIM', url: `https://omim.org/entry/${id.slice(5)}` }
  }
  if (id.startsWith('ORPHA:')) {
    return {
      id,
      name,
      source: 'Orphanet',
      url: `https://www.orpha.net/en/disease/detail/${id.slice(6)}`,
    }
  }
  return { id, name, source: 'Other', url: `https://monarchinitiative.org/${id}` }
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`HPO responded ${response.status} ${response.statusText}`)
  }
  return response.json()
}

async function load(symbol: string, signal?: AbortSignal): Promise<GeneEvidence> {
  const search = (await getJson(
    `${HPO_API}/search/gene?q=${encodeURIComponent(symbol)}&limit=10`,
    signal
  )) as { results?: { id: string; name: string }[] }

  const gene =
    search.results?.find((r) => r.name.toUpperCase() === symbol.toUpperCase()) ??
    search.results?.[0]
  if (!gene) throw new NotFoundError('HPO')

  const annotation = (await getJson(
    `${HPO_API}/annotation/${encodeURIComponent(gene.id)}`,
    signal
  )) as {
    diseases?: { id: string; name: string }[]
    phenotypes?: { id: string; name: string }[]
  }

  const phenotypes = annotation.phenotypes ?? []

  return {
    symbol: gene.name,
    ncbiGeneId: gene.id.replace(/^NCBIGene:/, ''),
    diseases: (annotation.diseases ?? []).map((d) => diseaseLink(d.id, d.name)),
    phenotypes: phenotypes.slice(0, 12).map((p) => ({
      id: p.id,
      name: p.name,
      url: `https://hpo.jax.org/browse/term/${p.id}`,
    })),
    phenotypeCount: phenotypes.length,
    omimSearchUrl: `https://omim.org/search?index=entry&search=${encodeURIComponent(symbol)}`,
  }
}

const cache = createCache<GeneEvidence>()

export function fetchGeneEvidence(variant: Variant, signal?: AbortSignal): Promise<GeneEvidence> {
  const symbol = variant.gene
  if (!symbol) return Promise.reject(new Error('This variant has no gene symbol'))
  // Cached per gene, not per variant: every variant in a gene shares this.
  return cache.get(symbol.toUpperCase(), () => load(symbol, signal))
}

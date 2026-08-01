/** A variant as it comes out of a Gosling click event. */
export interface Variant {
  chrom: string
  pos: number
  ref?: string
  alt?: string
  gene?: string
  significance?: string
  /** ClinVar accession (VCV…) when the source track already carries one. */
  clinvarId?: string
  hgvs?: string
}

/** Identity of a variant, used as the cache key. */
export function variantKey(v: Variant): string {
  return `${v.chrom}:${v.pos}:${v.ref ?? ''}>${v.alt ?? ''}`
}

/** gnomAD and several other resources address chromosomes without the `chr` prefix. */
export function bareChrom(chrom: string): string {
  return chrom.replace(/^chr/i, '')
}

/**
 * Raised by a provider when the source answered correctly but holds no record
 * for this variant. Rendered differently from a genuine failure.
 */
export class NotFoundError extends Error {
  constructor(source: string) {
    super(`No record in ${source}`)
    this.name = 'NotFoundError'
  }
}

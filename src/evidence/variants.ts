import type { Variant } from './types'

/**
 * Minimal CSV reader for the variant table. The generator strips commas out of
 * the HGVS field, so no quoted-field handling is needed here.
 */
function parseCsv(text: string): Record<string, string>[] {
  const [header, ...rows] = text.trim().split(/\r?\n/)
  const columns = header.split(',')
  return rows.map((row) => {
    const cells = row.split(',')
    return Object.fromEntries(columns.map((name, i) => [name, cells[i] ?? '']))
  })
}

export async function loadVariants(url: string): Promise<Variant[]> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Could not load variants: ${response.status} ${response.statusText}`)
  }

  return parseCsv(await response.text())
    .map((row) => ({
      chrom: row.chrom,
      pos: Number(row.pos),
      ref: row.ref || undefined,
      alt: row.alt || undefined,
      gene: row.gene || undefined,
      significance: row.significance || undefined,
      clinvarId: row.clinvarId || undefined,
      hgvs: row.hgvs || undefined,
    }))
    .filter((v) => v.chrom && Number.isFinite(v.pos))
}

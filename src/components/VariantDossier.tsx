import type { ReactNode } from 'react'
import { fetchClinVar } from '../evidence/clinvar'
import { fetchGnomad } from '../evidence/gnomad'
import { fetchGeneEvidence } from '../evidence/omim'
import { useEvidence, type EvidenceState } from '../evidence/useEvidence'
import type { Variant } from '../evidence/types'
import './VariantDossier.css'

const SIGNIFICANCE_COLOR: Record<string, string> = {
  Pathogenic: '#D62728',
  Likely_pathogenic: '#FF9896',
  Uncertain_significance: '#9E9E9E',
  Likely_benign: '#98DF8A',
  Benign: '#2CA02C',
}

function readableClass(value?: string): string {
  return value ? value.replace(/_/g, ' ') : 'Unknown'
}

function formatFrequency(af: number | null): string {
  if (af === null) return '—'
  if (af === 0) return '0 (not observed)'
  if (af < 0.0001) return `${af.toExponential(2)} (${(af * 100).toFixed(5)}%)`
  return `${af.toExponential(2)} (${(af * 100).toFixed(3)}%)`
}

/** Renders the loading / error / empty / success states shared by every source. */
function Section<T>({
  title,
  state,
  children,
}: {
  title: string
  state: EvidenceState<T>
  children: (data: T) => ReactNode
}) {
  return (
    <section className="dossier-section">
      <h3>
        {title}
        {state.status === 'loading' && <span className="badge badge-loading">loading…</span>}
        {state.status === 'error' && <span className="badge badge-error">failed</span>}
        {state.status === 'empty' && <span className="badge badge-empty">no record</span>}
      </h3>

      {state.status === 'loading' && <p className="muted">Querying…</p>}
      {state.status === 'empty' && <p className="muted">{state.message}</p>}
      {state.status === 'error' && (
        <p className="error-text">
          {state.message}
          <br />
          <span className="muted">Other sources on this page are unaffected.</span>
        </p>
      )}
      {state.status === 'success' && children(state.data)}
    </section>
  )
}

export function VariantDossier({
  variant,
  onClose,
}: {
  variant: Variant | null
  onClose: () => void
}) {
  const clinvar = useEvidence(variant, fetchClinVar)
  const gnomad = useEvidence(variant, fetchGnomad)
  const gene = useEvidence(variant, fetchGeneEvidence)

  if (!variant) {
    return (
      <aside className="dossier dossier-empty">
        <p className="muted">
          Click a variant (a lollipop) in the significance track to open its dossier.
          <br />
          <br />
          Zoom into one of the gene clusters until the stacked bars turn into
          individual lollipops.
        </p>
      </aside>
    )
  }

  const change = variant.ref && variant.alt ? `${variant.ref}>${variant.alt}` : '—'

  return (
    <aside className="dossier">
      <header className="dossier-header">
        <div>
          <h2>{variant.gene ?? 'Variant'}</h2>
          <p className="position">
            {variant.chrom}:{variant.pos.toLocaleString('en-US')} <span className="muted">(hg38)</span>
          </p>
        </div>
        <button type="button" className="close" onClick={onClose} aria-label="Close dossier">
          ×
        </button>
      </header>

      <div
        className="significance-chip"
        style={{ background: SIGNIFICANCE_COLOR[variant.significance ?? ''] ?? '#9E9E9E' }}
      >
        {readableClass(variant.significance)}
      </div>

      <section className="dossier-section">
        <h3>Identification</h3>
        <dl>
          <dt>Gene</dt>
          <dd>{variant.gene ?? '—'}</dd>
          <dt>Position (hg38)</dt>
          <dd>
            {variant.chrom}:{variant.pos.toLocaleString('en-US')}
          </dd>
          <dt>Change</dt>
          <dd className="mono">{change}</dd>
          {variant.hgvs && (
            <>
              <dt>HGVS</dt>
              <dd className="mono small">{variant.hgvs}</dd>
            </>
          )}
        </dl>
      </section>

      <Section title="ClinVar" state={clinvar}>
        {(data) => (
          <>
            <dl>
              <dt>Classification</dt>
              <dd>{data.classification}</dd>
              {data.reviewStatus && (
                <>
                  <dt>Review status</dt>
                  <dd className="small">{data.reviewStatus}</dd>
                </>
              )}
              {data.lastEvaluated && (
                <>
                  <dt>Last evaluated</dt>
                  <dd className="small">{data.lastEvaluated}</dd>
                </>
              )}
            </dl>
            {data.conditions.length > 0 && (
              <>
                <p className="label">Reported conditions</p>
                <ul className="chips">
                  {data.conditions.map((condition) => (
                    <li key={condition}>{condition}</li>
                  ))}
                </ul>
              </>
            )}
            <a href={data.url} target="_blank" rel="noreferrer">
              Open {data.accession || 'in ClinVar'} ↗
            </a>
          </>
        )}
      </Section>

      <Section title="gnomAD (v4)" state={gnomad}>
        {(data) => (
          <>
            <dl>
              <dt>Allele frequency</dt>
              <dd className="mono">{formatFrequency(data.af)}</dd>
              <dt>Allele count</dt>
              <dd className="mono">
                {data.ac?.toLocaleString('en-US')} / {data.an?.toLocaleString('en-US')}
              </dd>
              {data.rsids.length > 0 && (
                <>
                  <dt>dbSNP</dt>
                  <dd className="mono">{data.rsids.join(', ')}</dd>
                </>
              )}
            </dl>
            {data.populations.length > 0 && (
              <>
                <p className="label">By genetic ancestry group</p>
                <ul className="pop-list">
                  {data.populations.slice(0, 6).map((pop) => (
                    <li key={pop.id}>
                      <span className="pop-name">{pop.label}</span>
                      <span className="pop-bar">
                        <span
                          style={{
                            width: `${Math.min(100, (pop.af / (data.populations[0].af || 1)) * 100)}%`,
                          }}
                        />
                      </span>
                      <span className="pop-value mono">
                        {pop.af === 0 ? '0' : pop.af.toExponential(1)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <a href={data.url} target="_blank" rel="noreferrer">
              Open in gnomAD ↗
            </a>
          </>
        )}
      </Section>

      <Section title="Disease & phenotype" state={gene}>
        {(data) => (
          <>
            {data.diseases.length > 0 ? (
              <>
                <p className="label">Associated diseases</p>
                <ul className="links">
                  {data.diseases.slice(0, 8).map((disease) => (
                    <li key={disease.id}>
                      <a href={disease.url} target="_blank" rel="noreferrer">
                        {disease.name}
                      </a>{' '}
                      <span className="muted small">{disease.source}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted">No disease association listed.</p>
            )}

            {data.phenotypes.length > 0 && (
              <>
                <p className="label">
                  HPO terms{' '}
                  <span className="muted small">
                    (showing {data.phenotypes.length} of {data.phenotypeCount})
                  </span>
                </p>
                <ul className="chips">
                  {data.phenotypes.map((term) => (
                    <li key={term.id}>
                      <a href={term.url} target="_blank" rel="noreferrer">
                        {term.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <a href={data.omimSearchUrl} target="_blank" rel="noreferrer">
              Search {data.symbol} in OMIM ↗
            </a>
          </>
        )}
      </Section>
    </aside>
  )
}

import { useEffect, useState } from 'react'
import { GoslingViewer } from './components/GoslingViewer'
import { VariantDossier } from './components/VariantDossier'
import {
  DETAIL_VIEW_ID,
  SIGNIFICANCE_DOMAIN,
  VARIANT_TRACK_TITLE,
  VARIANTS_URL,
  overviewDetailSpec,
} from './specs/overviewDetail'
import { loadVariants } from './evidence/variants'
import type { Variant } from './evidence/types'
import './App.css'

function App() {
  const [selected, setSelected] = useState<Variant | null>(null)
  const [variants, setVariants] = useState<Variant[]>([])

  useEffect(() => {
    let active = true
    loadVariants(VARIANTS_URL)
      .then((loaded) => {
        if (active) setVariants(loaded)
      })
      .catch((error: unknown) => {
        console.error('Failed to load the variant table', error)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1>Vera — variant review cockpit</h1>
        <p>
          Demo case: a heterozygous <strong>LMNA</strong> deletion on chr1 (hg38). The
          coverage track drops to ~half over the deletion, and ClinVar variants —
          including pathogenic ones — sit in the same region. Brush the ideogram to
          move, zoom in until the lollipops appear, then click one to open its dossier.
        </p>
      </header>
      <div className="cockpit">
        <div className="cockpit-vis">
          <GoslingViewer
            spec={overviewDetailSpec}
            trackTitle={VARIANT_TRACK_TITLE}
            viewId={DETAIL_VIEW_ID}
            variants={variants}
            significanceOrder={SIGNIFICANCE_DOMAIN}
            onVariantClick={setSelected}
          />
        </div>
        <VariantDossier variant={selected} onClose={() => setSelected(null)} />
      </div>
    </div>
  )
}

export default App

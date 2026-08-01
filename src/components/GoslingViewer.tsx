import { useCallback, useEffect, useRef, type MouseEvent } from 'react'
import { GoslingComponent, type GoslingRef, type GoslingSpec } from 'gosling.js'
import { getTrackScale } from './trackScale'
import type { Variant } from '../evidence/types'

interface GoslingViewerProps {
  spec: GoslingSpec
  /**
   * `title` of the clickable track. The compiler replaces user `id`s with its
   * own uids but preserves `title`, so that is what we match on.
   */
  trackTitle: string
  /** `id` of the detail view (view ids are preserved); used for the chromosome. */
  viewId: string
  /** Variants drawn in the track, used to resolve a click back to one of them. */
  variants: Variant[]
  /** Significance categories top-to-bottom, matching the track's y encoding. */
  significanceOrder: string[]
  onVariantClick?: (variant: Variant) => void
}

/** Fraction of the track height where the lollipop heads sit (top and bottom). */
const HEAD_BAND = { top: 0.09, bottom: 0.62 }
/** A click must land within this pixel radius of a lollipop to select it. */
const CLICK_RADIUS_PX = 22

/**
 * Resolves a click inside the variant track back to a specific variant.
 *
 * gosling.js 1.0.7 does not fire the mark-level `click` event for this overlaid
 * track (only `trackClick`, which carries no datum), so we resolve it ourselves.
 * The track's own `_xScale` maps pixels to genomic coordinates; the significance
 * row order maps the click's y to a class. Matching on both is what lets a click
 * distinguish variants that sit only a few hundred bp apart — visually stacked
 * at nearly the same x but on different rows.
 */
export function GoslingViewer({
  spec,
  trackTitle,
  viewId,
  variants,
  significanceOrder,
  onVariantClick,
}: GoslingViewerProps) {
  const gosRef = useRef<GoslingRef>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const chromRef = useRef<string>('chr1')

  const handlerRef = useRef(onVariantClick)
  handlerRef.current = onVariantClick
  const variantsRef = useRef(variants)
  variantsRef.current = variants

  useEffect(() => {
    const api = gosRef.current?.api
    if (!api) return

    api.subscribe('location', (_name, event) => {
      if (event.id === viewId) chromRef.current = event.genomicRange[0].chromosome
    })

    return () => api.unsubscribe('location')
  }, [spec, viewId])

  const handleClick = useCallback(
    (nativeEvent: MouseEvent<HTMLDivElement>) => {
      const canvas = containerRef.current?.querySelector('canvas')
      const scale = getTrackScale(gosRef.current?.hgApi, trackTitle)
      if (!canvas || !scale) return

      const origin = canvas.getBoundingClientRect()
      const clickX = nativeEvent.clientX - origin.left - scale.position[0]
      const clickY = nativeEvent.clientY - origin.top - scale.position[1]

      const [width, height] = scale.dimensions
      if (clickX < 0 || clickX > width || clickY < 0 || clickY > height) return

      const rows = significanceOrder.length
      const bandTop = HEAD_BAND.top * height
      const bandBottom = HEAD_BAND.bottom * height
      const rowY = (index: number) =>
        rows <= 1 ? (bandTop + bandBottom) / 2 : bandTop + (index / (rows - 1)) * (bandBottom - bandTop)

      let best: Variant | null = null
      let bestDistance = Infinity
      for (const variant of variantsRef.current) {
        if (variant.chrom !== chromRef.current) continue
        const vx = scale.scaleX(variant.pos)
        const rowIndex = significanceOrder.indexOf(variant.significance ?? '')
        const vy = rowIndex >= 0 ? rowY(rowIndex) : clickY
        const distance = Math.hypot(vx - clickX, vy - clickY)
        if (distance < bestDistance) {
          bestDistance = distance
          best = variant
        }
      }

      if (best && bestDistance <= CLICK_RADIUS_PX) handlerRef.current?.(best)
    },
    [trackTitle, significanceOrder]
  )

  return (
    <div ref={containerRef} onClick={handleClick}>
      <GoslingComponent ref={gosRef} spec={spec} padding={30} theme="light" />
    </div>
  )
}

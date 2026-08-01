import type { GoslingRef } from 'gosling.js'

export interface TrackScale {
  /** Track origin and size within the canvas, in CSS pixels. */
  position: [number, number]
  dimensions: [number, number]
  /** Genomic (absolute, 1-based) coordinate at a track-local x pixel. */
  invertX: (localX: number) => number
  /** Track-local x pixel of a genomic coordinate (inverse of invertX). */
  scaleX: (genomic: number) => number
}

interface GoslingTrackObject {
  options?: { spec?: { title?: string } }
  position?: [number, number]
  dimensions?: [number, number]
  _xScale?: { (genomic: number): number; invert: (x: number) => number }
  createdTracks?: Record<string, GoslingTrackObject>
}

/**
 * Reaches into the HiGlass component to read a track's `_xScale`.
 *
 * This is deliberately going through internals: gosling.js 1.0.7 has no public
 * API to convert a pixel to a genomic coordinate, and the mark-level `click`
 * event does not fire for this overlaid track (only `trackClick` does, which
 * carries no datum). The renderer itself uses `_xScale.invert(mouseX)`, so we
 * use the very same scale. Everything is guarded; if the internal shape ever
 * changes, this returns null and clicking simply does nothing.
 */
export function getTrackScale(
  hgApi: GoslingRef['hgApi'] | undefined,
  trackTitle: string
): TrackScale | null {
  try {
    const component = hgApi?.api?.getComponent?.() as
      | { tiledPlots?: Record<string, { trackRenderer?: { trackDefObjects?: Record<string, { trackObject?: GoslingTrackObject }> } }> }
      | undefined
    if (!component?.tiledPlots) return null

    let match: GoslingTrackObject | null = null
    const consider = (track: GoslingTrackObject | undefined) => {
      if (
        track?._xScale &&
        track.position &&
        track.dimensions &&
        track.options?.spec?.title === trackTitle
      ) {
        match = track
      }
    }

    for (const plot of Object.values(component.tiledPlots)) {
      const defs = plot?.trackRenderer?.trackDefObjects
      if (!defs) continue
      for (const def of Object.values(defs)) {
        consider(def.trackObject)
        const nested = def.trackObject?.createdTracks
        if (nested) Object.values(nested).forEach(consider)
      }
    }

    if (!match) return null
    // `match` is definitely a GoslingTrackObject here, but the closure-based
    // assignment loses that for the type checker.
    const track = match as GoslingTrackObject
    const scale = track._xScale!
    return {
      position: track.position!,
      dimensions: track.dimensions!,
      invertX: (localX: number) => scale.invert(localX),
      scaleX: (genomic: number) => scale(genomic),
    }
  } catch {
    return null
  }
}

import { useEffect, useState } from 'react'
import { NotFoundError, variantKey, type Variant } from './types'

export type EvidenceState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'empty'; message: string }
  | { status: 'error'; message: string }
  | { status: 'success'; data: T }

/**
 * Runs one evidence provider for one variant. Each source gets its own hook
 * call, so a failure in one leaves the others untouched.
 */
export function useEvidence<T>(
  variant: Variant | null,
  load: (variant: Variant, signal?: AbortSignal) => Promise<T>
): EvidenceState<T> {
  const [state, setState] = useState<EvidenceState<T>>({ status: 'idle' })

  // Re-run when the variant identity changes, not on every re-render.
  const key = variant ? variantKey(variant) : null

  useEffect(() => {
    if (!variant) {
      setState({ status: 'idle' })
      return
    }

    const controller = new AbortController()
    let active = true
    setState({ status: 'loading' })

    load(variant, controller.signal)
      .then((data) => {
        if (active) setState({ status: 'success', data })
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return
        if (error instanceof NotFoundError) {
          setState({ status: 'empty', message: error.message })
          return
        }
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        })
      })

    return () => {
      active = false
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state
}

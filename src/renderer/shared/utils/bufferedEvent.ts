export type BufferedEventSpec<TPayload> = {
  eventName: string
  seqKey: string
  payloadKey: string
  lastSeqKey?: string
}

export function publishBufferedEvent<TPayload>(spec: BufferedEventSpec<TPayload>, payload: TPayload) {
  const w = window as any
  const prev = typeof w[spec.seqKey] === 'number' ? (w[spec.seqKey] as number) : 0
  const seq = prev + 1
  w[spec.seqKey] = seq
  w[spec.payloadKey] = payload
  window.dispatchEvent(new CustomEvent(spec.eventName, { detail: { seq, payload } }))
  return seq
}

export function syncFromBuffered<TPayload>(
  spec: BufferedEventSpec<TPayload>,
  handler: (payload: TPayload) => void,
  state?: { lastSeq: number }
) {
  const w = window as any
  const seq = typeof w[spec.seqKey] === 'number' ? (w[spec.seqKey] as number) : 0
  if (!seq) return
  const lastSeq = state ? state.lastSeq : 0
  if (seq === lastSeq) return
  if (state) state.lastSeq = seq
  if (spec.lastSeqKey) w[spec.lastSeqKey] = seq
  handler(w[spec.payloadKey] as TPayload)
}

export function subscribeBufferedEvent<TPayload>(spec: BufferedEventSpec<TPayload>, handler: (payload: TPayload) => void) {
  const state = { lastSeq: 0 }

  const onEvent = (event: Event) => {
    const detail = (event as CustomEvent).detail as { seq?: number; payload?: TPayload } | undefined
    const seq = typeof detail?.seq === 'number' ? (detail?.seq as number) : 0
    if (seq) {
      if (seq === state.lastSeq) return
      state.lastSeq = seq
      if (spec.lastSeqKey) (window as any)[spec.lastSeqKey] = seq
    }
    handler(detail?.payload as TPayload)
  }

  syncFromBuffered(spec, handler, state)
  window.addEventListener(spec.eventName, onEvent as EventListener)
  syncFromBuffered(spec, handler, state)
  return () => window.removeEventListener(spec.eventName, onEvent as EventListener)
}

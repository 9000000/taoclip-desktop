const EPSILON = 1e-6

function positive(value, label) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${label} phải lớn hơn 0.`)
  return n
}

/** Build the shared, source-addressable output timeline for primary clips. */
export function buildTimelinePlan(clips, { transition = 'none', transitionDuration = 0.5, keepByClip = {} } = {}) {
  if (!Array.isArray(clips)) throw new Error('Danh sách clip không hợp lệ.')
  const pieces = []
  for (const clip of clips) {
    if (!clip || typeof clip.id !== 'string') throw new Error('Mỗi clip cần có ID ổn định.')
    const speed = clip.kind === 'image' ? 1 : positive(clip.speed ?? 1, `Tốc độ clip ${clip.id}`)
    const start = clip.kind === 'image' ? 0 : Number(clip.in ?? 0)
    const end = Number(clip.out)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
      throw new Error(`Khoảng nguồn clip ${clip.id} không hợp lệ.`)
    }
    const kept = keepByClip[clip.id]
    const hasKeepPlan = Object.prototype.hasOwnProperty.call(keepByClip, clip.id) && Array.isArray(kept)
    const ranges = hasKeepPlan && clip.kind !== 'image'
      ? kept.map((range) => ({ start: Math.max(start, Number(range.start)), end: Math.min(end, Number(range.end)) }))
        .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end) && range.end - range.start > EPSILON)
      : [{ start, end }]
    for (const range of ranges) pieces.push({ clipId: clip.id, kind: clip.kind || 'video', sourceStart: range.start,
      sourceEnd: range.end, speed, duration: (range.end - range.start) / speed })
  }

  const entries = []
  let cursor = 0
  for (const piece of pieces) {
    const prior = entries[entries.length - 1]
    const appliesTransition = prior && prior.clipId !== piece.clipId
    const overlap = appliesTransition && transition === 'cross'
      ? Math.min(positive(transitionDuration, 'Thời lượng chuyển cảnh'), prior.duration / 2, piece.duration / 2)
      : 0
    const timelineStart = Math.max(0, cursor - overlap)
    const entry = { ...piece, start: timelineStart, end: timelineStart + piece.duration,
      transitionIn: appliesTransition ? transition : 'none', overlapIn: overlap }
    entries.push(entry)
    cursor = entry.end
  }
  const duration = entries.length ? Math.max(...entries.map((entry) => entry.end)) : 0
  return { entries, duration, transition, transitionDuration: Number(transitionDuration) || 0 }
}

/** Map a source range to every corresponding output range (clip may be reused). */
export function mapSourceRange(plan, clipId, sourceStart, sourceEnd) {
  const a0 = Number(sourceStart), b0 = Number(sourceEnd)
  if (!Number.isFinite(a0) || !Number.isFinite(b0) || b0 <= a0) return []
  return plan.entries.filter((entry) => entry.clipId === clipId).flatMap((entry) => {
    const a = Math.max(a0, entry.sourceStart), b = Math.min(b0, entry.sourceEnd)
    if (b - a <= EPSILON) return []
    const start = entry.start + (a - entry.sourceStart) / entry.speed
    const end = entry.start + (b - entry.sourceStart) / entry.speed
    return [{ start, end, clipId, sourceStart: a, sourceEnd: b }]
  })
}

/** Map timeline time to the active source time; crossfades can return two sources. */
export function mapTimelineTime(plan, time) {
  const t = Number(time)
  if (!Number.isFinite(t) || t < 0) return []
  return plan.entries.filter((entry) => t >= entry.start && t < entry.end).map((entry) => ({
    clipId: entry.clipId,
    sourceTime: entry.sourceStart + (t - entry.start) * entry.speed,
    kind: entry.kind
  }))
}

export function toExportSegments(plan) {
  return plan.entries.map((entry) => ({ clipId: entry.clipId, start: entry.start, end: entry.end,
    sourceStart: entry.sourceStart, sourceEnd: entry.sourceEnd, speed: entry.speed,
    overlapIn: entry.overlapIn, transitionIn: entry.transitionIn }))
}

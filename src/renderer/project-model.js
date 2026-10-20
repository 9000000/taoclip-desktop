const PROJECT_VERSION = 3

const DEFAULTS = Object.freeze({
  ratio: '9:16',
  filterKey: 'none',
  mode: 'smart',
  captions: [],
  burnCaptions: true,
  overlays: [],
  transition: 'none',
  clips: [],
  music: null,
  voice: null,
  musicVol: 0.4,
  voiceVol: 1,
  ducking: true,
  bgDur: 0,
  voiceDur: 0,
  voiceOffset: 0,
  origVolume: 1,
  bgLoop: true,
  syncMode: 'fit',
  slideDur: 3,
  ttsEngine: 'local',
  ttsVoice: '',
  ttsRate: 1,
  ttsPitch: 0,
  aiEdited: false
})

function defaultId(prefix, index) {
  const random = globalThis.crypto?.randomUUID?.()
  return random ? `${prefix}_${random}` : `${prefix}_${Date.now().toString(36)}_${index.toString(36)}_${Math.random().toString(36).slice(2)}`
}

function finite(value, label, { min = -Infinity, max = Infinity } = {}) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Project không hợp lệ: ${label}`)
  return n
}

function migrateLegacy(data) {
  const version = Number(data.version || 1)
  if (!Number.isInteger(version) || version < 1) throw new Error('Project không hợp lệ: version')
  if (version > PROJECT_VERSION) throw new Error(`Project version ${version} mới hơn phiên bản TaoClip đang hỗ trợ.`)

  const migrated = { ...data }
  if (version < 2 && data.bgAudio) {
    if (data.bgAudio.kind === 'tts') {
      migrated.voice ??= { path: data.bgAudio.path, name: data.bgAudio.name }
      migrated.voiceVol ??= data.bgVolume
    } else {
      migrated.music ??= { path: data.bgAudio.path, name: data.bgAudio.name }
      migrated.musicVol ??= data.bgVolume
    }
  }
  if (version < 2) { delete migrated.bgAudio; delete migrated.bgVolume }
  // In v1/v2 captions are in source time for one clip, and timeline time for
  // multi-clip projects. Keep every timestamp unchanged and record that fact.
  if (version < 3) {
    const clips = Array.isArray(data.clips) ? data.clips : []
    migrated.captionTimebase ??= clips.length === 1 ? 'source-legacy' : 'timeline-legacy'
    migrated.projectId ??= defaultId('project', 0)
  }
  migrated.version = PROJECT_VERSION
  return migrated
}

export function normalizeProject(input, makeId = defaultId) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('File dự án phải chứa một object JSON.')
  const migrated = migrateLegacy(input)
  // Never copy credentials from an imported file into the current project.
  delete migrated.apiKey
  delete migrated.googleTtsKey
  delete migrated.googleTtsKeyEnc
  const clips = Array.isArray(migrated.clips) ? migrated.clips : DEFAULTS.clips
  const overlays = Array.isArray(migrated.overlays) ? migrated.overlays : DEFAULTS.overlays
  const captions = Array.isArray(migrated.captions) ? migrated.captions : DEFAULTS.captions

  const normalizedClips = clips.map((clip, index) => {
    if (!clip || typeof clip !== 'object' || typeof clip.path !== 'string' || !clip.path.trim()) {
      throw new Error(`Project không hợp lệ: clips[${index}].path`)
    }
    const kind = clip.kind === 'image' ? 'image' : 'video'
    const speed = finite(clip.speed ?? 1, `clips[${index}].speed`, { min: 0.05, max: 16 })
    const input = kind === 'image' ? 0 : finite(clip.in ?? 0, `clips[${index}].in`, { min: 0 })
    const output = finite(clip.out ?? (kind === 'image' ? 3 : input + 0.1), `clips[${index}].out`, { min: input + 0.001 })
    return {
      ...clip,
      id: typeof clip.id === 'string' && clip.id ? clip.id : makeId('clip', index),
      kind,
      in: input,
      out: output,
      speed: kind === 'image' ? 1 : speed,
      name: typeof clip.name === 'string' && clip.name ? clip.name : clip.path.split(/[\\/]/).pop(),
      missing: !!clip.missing
    }
  })
  const clipIds = new Set()
  for (const clip of normalizedClips) {
    if (clipIds.has(clip.id)) throw new Error(`Project có clip trùng ID: ${clip.id}`)
    clipIds.add(clip.id)
  }
  const normalizedOverlays = overlays.map((overlay, index) => {
    if (!overlay || typeof overlay !== 'object') throw new Error(`Project không hợp lệ: overlays[${index}]`)
    const start = finite(overlay.start ?? 0, `overlays[${index}].start`, { min: 0 })
    const end = finite(overlay.end ?? start + 3, `overlays[${index}].end`, { min: start + 0.001 })
    return { ...overlay, id: overlay.id || makeId('overlay', index), start, end,
      x: finite(overlay.x ?? 0.5, `overlays[${index}].x`, { min: 0, max: 1 }),
      y: finite(overlay.y ?? 0.5, `overlays[${index}].y`, { min: 0, max: 1 }) }
  })
  const normalizedCaptions = captions.map((caption, index) => {
    if (!caption || typeof caption !== 'object' || typeof caption.text !== 'string') {
      throw new Error(`Project không hợp lệ: captions[${index}]`)
    }
    const start = finite(caption.start ?? 0, `captions[${index}].start`, { min: 0 })
    const end = finite(caption.end ?? start + 0.1, `captions[${index}].end`, { min: start + 0.001 })
    return { ...caption, id: caption.id || makeId('caption', index), start, end }
  })
  for (const [items, label] of [[normalizedOverlays, 'overlay'], [normalizedCaptions, 'caption']]) {
    const ids = new Set()
    for (const item of items) {
      if (ids.has(item.id)) throw new Error(`Project có ${label} trùng ID: ${item.id}`)
      ids.add(item.id)
    }
  }

  const ratio = migrated.ratio ?? DEFAULTS.ratio
  if (!['9:16', '1:1', '4:5', '16:9', 'original'].includes(ratio)) throw new Error('Project không hợp lệ: ratio')
  if (!['none', 'fade', 'cross'].includes(migrated.transition ?? DEFAULTS.transition)) throw new Error('Project không hợp lệ: transition')
  const captionTimebase = migrated.captionTimebase || 'timeline'
  if (!['timeline', 'timeline-legacy', 'source-legacy'].includes(captionTimebase)) throw new Error('Project không hợp lệ: captionTimebase')

  return {
    ...DEFAULTS,
    ...migrated,
    version: PROJECT_VERSION,
    projectId: migrated.projectId || makeId('project', 0),
    ratio,
    clips: normalizedClips,
    overlays: normalizedOverlays,
    captions: normalizedCaptions,
    captionTimebase,
    music: migrated.music ?? null,
    voice: migrated.voice ?? null
  }
}

export { PROJECT_VERSION }

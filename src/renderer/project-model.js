const PROJECT_VERSION = 4

const DEFAULTS = Object.freeze({
  ratio: '9:16',
  filterKey: 'none',
  filterIntensity: 100,
  mode: 'smart',
  captions: [],
  burnCaptions: true,
  overlays: [],
  videoOverlays: [],
  audioItems: [],
  transition: 'none',
  transitionDuration: 0.5,
  clips: [],
  assets: [],
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
  aiEdited: false,
  keepSegments: null,
  autoCut: false,
  autoInfo: null,
  silenceParams: { threshold: -30, minSilence: 0.4, pad: 0.06 }
})

function defaultId(prefix, index) {
  const random = globalThis.crypto?.randomUUID?.()
  return random ? `${prefix}_${random}` : `${prefix}_${Date.now().toString(36)}_${index.toString(36)}_${Math.random().toString(36).slice(2)}`
}

function mediaPathKey(value) { return String(value || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() }

function inferLegacyAssets(data, makeId = defaultId) {
  const records = [
    ...(Array.isArray(data.clips) ? data.clips.map((item) => ({ ...item, kind: item.kind === 'image' ? 'image' : 'video' })) : []),
    ...(Array.isArray(data.videoOverlays) ? data.videoOverlays.map((item) => ({ ...item, kind: item.kind === 'image' ? 'image' : 'video' })) : []),
    ...(Array.isArray(data.audioItems) ? data.audioItems.map((item) => ({ ...item, kind: 'audio' })) : []),
    ...(data.music?.path ? [{ ...data.music, kind: 'audio' }] : []),
    ...(data.voice?.path ? [{ ...data.voice, kind: 'audio' }] : [])
  ]
  const byPath = new Map()
  for (const record of records) {
    if (typeof record.path !== 'string' || !record.path.trim()) continue
    const key = mediaPathKey(record.path)
    const existing = byPath.get(key)
    if (existing) {
      existing.missing = existing.missing && !!record.missing
      existing.metadata ||= record.metadata || record.src || null
      continue
    }
    byPath.set(key, {
      id: typeof record.assetId === 'string' && record.assetId ? record.assetId : makeId('asset', byPath.size),
      path: record.path, name: record.name || record.path.split(/[\\/]/).pop(), kind: record.kind,
      source: ['local', 'download', 'tts', 'ai'].includes(record.source) ? record.source : 'local',
      missing: !!record.missing, metadata: record.metadata || record.src || null
    })
  }
  return [...byPath.values()]
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
  if (version < 4) migrated.assets ??= inferLegacyAssets(migrated)
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
  const videoOverlays = Array.isArray(migrated.videoOverlays) ? migrated.videoOverlays : DEFAULTS.videoOverlays
  const audioItems = Array.isArray(migrated.audioItems) ? migrated.audioItems : [
    ...(migrated.music?.path ? [{ id: 'legacy-music', path: migrated.music.path, name: migrated.music.name, track: 'music', start: 0,
      in: 0, out: Math.max(0.001, Number(migrated.bgDur) || 0.001), gain: migrated.musicVol ?? 0.4, loop: migrated.bgLoop !== false }] : []),
    ...(migrated.voice?.path ? [{ id: 'legacy-voice', path: migrated.voice.path, name: migrated.voice.name, track: 'voice', start: migrated.voiceOffset ?? 0,
      in: 0, out: Math.max(0.001, Number(migrated.voiceDur) || 0.001), gain: migrated.voiceVol ?? 1 }] : [])
  ]
  const captions = Array.isArray(migrated.captions) ? migrated.captions : DEFAULTS.captions
  const assetSource = Array.isArray(migrated.assets) ? migrated.assets : inferLegacyAssets(migrated, makeId)
  const normalizedAssets = []
  const assetIds = new Set(), assetPaths = new Set()
  for (let index = 0; index < assetSource.length; index++) {
    const asset = assetSource[index]
    if (!asset || typeof asset !== 'object' || typeof asset.path !== 'string' || !asset.path.trim()) {
      throw new Error(`Project không hợp lệ: assets[${index}].path`)
    }
    const pathKey = mediaPathKey(asset.path)
    if (assetPaths.has(pathKey)) continue
    const id = typeof asset.id === 'string' && asset.id ? asset.id : makeId('asset', index)
    if (assetIds.has(id)) throw new Error(`Project có asset trùng ID: ${id}`)
    assetIds.add(id); assetPaths.add(pathKey)
    const kind = ['video', 'image', 'audio'].includes(asset.kind) ? asset.kind : 'video'
    normalizedAssets.push({ ...asset, id, path: asset.path, name: typeof asset.name === 'string' && asset.name ? asset.name : asset.path.split(/[\\/]/).pop(),
      kind, source: ['local', 'download', 'tts', 'ai'].includes(asset.source) ? asset.source : 'local', missing: !!asset.missing,
      metadata: asset.metadata && typeof asset.metadata === 'object' && !Array.isArray(asset.metadata) ? asset.metadata : null })
  }

  const normalizedClips = clips.map((clip, index) => {
    if (!clip || typeof clip !== 'object' || typeof clip.path !== 'string' || !clip.path.trim()) {
      throw new Error(`Project không hợp lệ: clips[${index}].path`)
    }
    const kind = clip.kind === 'image' ? 'image' : 'video'
    const speed = finite(clip.speed ?? 1, `clips[${index}].speed`, { min: 0.05, max: 16 })
    const input = kind === 'image' ? 0 : finite(clip.in ?? 0, `clips[${index}].in`, { min: 0 })
    const output = finite(clip.out ?? (kind === 'image' ? 3 : input + 0.1), `clips[${index}].out`, { min: input + 0.001 })
    const cropMode = clip.cropMode ?? 'fit'
    if (!['fit', 'fill'].includes(cropMode)) throw new Error(`Project không hợp lệ: clips[${index}].cropMode`)
    return {
      ...clip,
      id: typeof clip.id === 'string' && clip.id ? clip.id : makeId('clip', index),
      kind,
      in: input,
      out: output,
      speed: kind === 'image' ? 1 : speed,
      cropMode,
      cropX: finite(clip.cropX ?? 0.5, `clips[${index}].cropX`, { min: 0, max: 1 }),
      cropY: finite(clip.cropY ?? 0.5, `clips[${index}].cropY`, { min: 0, max: 1 }),
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
      y: finite(overlay.y ?? 0.5, `overlays[${index}].y`, { min: 0, max: 1 }),
      size: finite(overlay.size ?? 0.07, `overlays[${index}].size`, { min: 0.005, max: 1 }),
      align: ['left', 'center', 'right'].includes(overlay.align) ? overlay.align : 'center',
      zIndex: finite(overlay.zIndex ?? index + 1, `overlays[${index}].zIndex`, { min: 0, max: 10000 }) }
  })
  const normalizedVideoOverlays = videoOverlays.map((item, index) => {
    if (!item || typeof item !== 'object' || typeof item.path !== 'string' || !item.path.trim()) {
      throw new Error(`Project không hợp lệ: videoOverlays[${index}].path`)
    }
    const kind = item.kind === 'image' ? 'image' : 'video'
    const start = finite(item.start ?? 0, `videoOverlays[${index}].start`, { min: 0 })
    const input = kind === 'image' ? 0 : finite(item.in ?? 0, `videoOverlays[${index}].in`, { min: 0 })
    const output = finite(item.out ?? (kind === 'image' ? 3 : input + 0.1), `videoOverlays[${index}].out`, { min: input + 0.001 })
    return {
      ...item, id: item.id || makeId('video-overlay', index), kind, start, in: input, out: output,
      speed: kind === 'image' ? 1 : finite(item.speed ?? 1, `videoOverlays[${index}].speed`, { min: 0.05, max: 16 }),
      x: finite(item.x ?? 0.5, `videoOverlays[${index}].x`, { min: 0, max: 1 }),
      y: finite(item.y ?? 0.5, `videoOverlays[${index}].y`, { min: 0, max: 1 }),
      width: finite(item.width ?? 1, `videoOverlays[${index}].width`, { min: 0.001, max: 4 }),
      height: finite(item.height ?? 1, `videoOverlays[${index}].height`, { min: 0.001, max: 4 }),
      opacity: finite(item.opacity ?? 1, `videoOverlays[${index}].opacity`, { min: 0, max: 1 }),
      zIndex: finite(item.zIndex ?? index, `videoOverlays[${index}].zIndex`), missing: !!item.missing
    }
  })
  const normalizedAudioItems = audioItems.map((item, index) => {
    if (!item || typeof item !== 'object' || typeof item.path !== 'string' || !item.path.trim()) {
      throw new Error(`Project không hợp lệ: audioItems[${index}].path`)
    }
    const track = item.track === 'voice' ? 'voice' : item.track === 'music' ? 'music' : null
    if (!track) throw new Error(`Project không hợp lệ: audioItems[${index}].track`)
    const start = finite(item.start ?? 0, `audioItems[${index}].start`, { min: 0 })
    const sourceIn = finite(item.in ?? 0, `audioItems[${index}].in`, { min: 0 })
    const sourceOut = finite(item.out ?? sourceIn + 0.1, `audioItems[${index}].out`, { min: sourceIn + 0.001 })
    return { ...item, id: item.id || makeId('audio', index), track, start, in: sourceIn, out: sourceOut,
      gain: finite(item.gain ?? 1, `audioItems[${index}].gain`, { min: 0, max: 4 }),
      fadeIn: finite(item.fadeIn ?? 0, `audioItems[${index}].fadeIn`, { min: 0 }),
      fadeOut: finite(item.fadeOut ?? 0, `audioItems[${index}].fadeOut`, { min: 0 }),
      loop: !!item.loop, muted: !!item.muted, missing: !!item.missing }
  })
  const normalizedCaptions = captions.map((caption, index) => {
    if (!caption || typeof caption !== 'object' || typeof caption.text !== 'string') {
      throw new Error(`Project không hợp lệ: captions[${index}]`)
    }
    const start = finite(caption.start ?? 0, `captions[${index}].start`, { min: 0 })
    const end = finite(caption.end ?? start + 0.1, `captions[${index}].end`, { min: start + 0.001 })
    return { ...caption, id: caption.id || makeId('caption', index), start, end }
  })
  for (const [items, label] of [[normalizedOverlays, 'overlay'], [normalizedVideoOverlays, 'video overlay'], [normalizedAudioItems, 'audio'], [normalizedCaptions, 'caption']]) {
    const ids = new Set()
    for (const item of items) {
      if (ids.has(item.id)) throw new Error(`Project có ${label} trùng ID: ${item.id}`)
      ids.add(item.id)
    }
  }

  const ratio = migrated.ratio ?? DEFAULTS.ratio
  if (!['9:16', '1:1', '4:5', '16:9', 'original'].includes(ratio)) throw new Error('Project không hợp lệ: ratio')
  if (!['none', 'bright', 'warm', 'cool', 'vivid', 'bw', 'vintage'].includes(migrated.filterKey ?? DEFAULTS.filterKey)) throw new Error('Project không hợp lệ: filterKey')
  if (!['none', 'fade', 'cross'].includes(migrated.transition ?? DEFAULTS.transition)) throw new Error('Project không hợp lệ: transition')
  const transitionDuration = finite(migrated.transitionDuration ?? DEFAULTS.transitionDuration, 'transitionDuration', { min: 0.1, max: 2 })
  const filterIntensity = finite(migrated.filterIntensity ?? DEFAULTS.filterIntensity, 'filterIntensity', { min: 0, max: 100 })
  const silenceSource = migrated.silenceParams || {}
  const silenceParams = {
    threshold: finite(silenceSource.threshold ?? -30, 'silenceParams.threshold', { min: -60, max: -10 }),
    minSilence: finite(silenceSource.minSilence ?? 0.4, 'silenceParams.minSilence', { min: 0.1, max: 5 }),
    pad: finite(silenceSource.pad ?? 0.06, 'silenceParams.pad', { min: 0, max: 1 })
  }
  const captionTimebase = migrated.captionTimebase || 'timeline'
  if (!['timeline', 'timeline-legacy', 'source-legacy'].includes(captionTimebase)) throw new Error('Project không hợp lệ: captionTimebase')
  let keepSegments = null
  if (migrated.keepSegments != null) {
    if (!Array.isArray(migrated.keepSegments)) throw new Error('Project không hợp lệ: keepSegments')
    const source = normalizedClips.length === 1 ? normalizedClips[0] : null
    keepSegments = migrated.keepSegments.map((range, index) => {
      const start = finite(range?.start, `keepSegments[${index}].start`, { min: source?.in ?? 0 })
      const end = finite(range?.end, `keepSegments[${index}].end`, { min: start + 0.001, max: source?.out ?? Infinity })
      return { start, end }
    })
  }
  let autoInfo = null
  if (migrated.autoInfo?.duration != null) {
    const sourceInfo = migrated.autoInfo
    const duration = finite(sourceInfo.duration, 'autoInfo.duration', { min: 0.001 })
    const silences = Array.isArray(sourceInfo.silences) ? sourceInfo.silences.map((silence, index) => ({
      start: finite(silence?.start, `autoInfo.silences[${index}].start`, { min: 0, max: duration }),
      end: finite(silence?.end, `autoInfo.silences[${index}].end`, { min: 0, max: duration }),
      remove: silence?.remove !== false
    })) : []
    if (silences.some((silence) => silence.end < silence.start)) throw new Error('Project không hợp lệ: autoInfo.silences')
    const ranges = (value, label) => Array.isArray(value) ? value.map((range, index) => {
      const start = finite(range?.start, `${label}[${index}].start`, { min: 0, max: duration })
      const end = finite(range?.end, `${label}[${index}].end`, { min: start + 0.001, max: duration })
      return { start, end }
    }) : []
    const opts = sourceInfo.options || {}
    autoInfo = { duration, silences, keep: ranges(sourceInfo.keep, 'autoInfo.keep'),
      ...(typeof sourceInfo.sourceKey === 'string' ? { sourceKey: sourceInfo.sourceKey } : {}),
      removed: finite(sourceInfo.removed ?? silences.length, 'autoInfo.removed', { min: 0 }),
      saved: finite(sourceInfo.saved ?? 0, 'autoInfo.saved', { min: 0, max: duration }),
      kept: finite(sourceInfo.kept ?? 0, 'autoInfo.kept', { min: 0, max: duration }),
      options: { noise: String(opts.noise || '-30dB'), minSilence: finite(opts.minSilence ?? 0.4, 'autoInfo.options.minSilence', { min: 0.1, max: 5 }),
        pad: finite(opts.pad ?? 0.06, 'autoInfo.options.pad', { min: 0, max: 1 }) } }
  }

  return {
    ...DEFAULTS,
    ...migrated,
    version: PROJECT_VERSION,
    projectId: migrated.projectId || makeId('project', 0),
    ratio,
    filterIntensity,
    transitionDuration,
    clips: normalizedClips,
    assets: normalizedAssets,
    overlays: normalizedOverlays,
    videoOverlays: normalizedVideoOverlays,
    audioItems: normalizedAudioItems,
    captions: normalizedCaptions,
    captionTimebase,
    keepSegments,
    silenceParams,
    autoCut: !!migrated.autoCut,
    autoInfo,
    music: migrated.music ?? null,
    voice: migrated.voice ?? null
  }
}

export { PROJECT_VERSION }

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')

// --- FFmpeg / FFprobe (dong goi san, khong can cai he thong) ---
const os = require('os')
const ops = require('./ffmpeg-ops.cjs')
const caps = require('./captions.cjs')
const projectStore = require('./project-store.cjs')
let ffmpegPath = require('ffmpeg-static')
let ffprobePath = require('ffprobe-static').path

// Khi dong goi production, binary nam trong app.asar.unpacked
ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked')
ffprobePath = ffprobePath.replace('app.asar', 'app.asar.unpacked')
ops.configure(ffmpegPath, ffprobePath)

const isDev = process.env.NODE_ENV === 'development'
let gpuEncoder = 'cpu' // tu do khi app san sang

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0f1115',
    title: 'TaoClip',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Bo menu mac dinh (File/Edit/View...) - app tu co UI rieng
  win.removeMenu()

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
    // Khong con menu nen tu gan phim tat DevTools / Reload khi dev
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.type !== 'keyDown') return
      if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
        win.webContents.toggleDevTools()
      } else if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
        win.webContents.reload()
      }
    })
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  ops.detectBestEncoder().then((e) => { gpuEncoder = e }).catch(() => {})
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Cho UI biet encoder GPU kha dung
ipcMain.handle('system:encoder', () => gpuEncoder)

// Mo Explorer va chon san file (sau khi xuat / luu du an)
ipcMain.handle('shell:showInFolder', (_e, p) => { shell.showItemInFolder(path.resolve(p)) })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ---------------- IPC: thao tac file & video ----------------

// Chon file video
ipcMain.handle('dialog:openVideo', async () => {
  const res = await dialog.showOpenDialog({
    title: 'Chon video',
    properties: ['openFile'],
    filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'] }]
  })
  if (res.canceled || !res.filePaths.length) return null
  return res.filePaths[0]
})

// Lay metadata video (thoi luong, do phan giai...)
ipcMain.handle('video:probe', async (_e, filePath) => {
  return ops.probe(filePath)
})

// Tao dai thumbnail cho timeline
ipcMain.handle('video:thumbnails', async (_e, filePath, count) => {
  return ops.generateThumbnails(filePath, count || 12)
})

// Tao anh waveform (dang song am thanh) cho timeline
ipcMain.handle('video:waveform', async (_e, filePath) => {
  try { return await ops.generateWaveform(filePath) } catch (e) { return null }
})

// Phat hien khoang lang -> tra ve cac doan giu lai + thong ke
ipcMain.handle('video:detectSilence', async (_e, filePath, opts) => {
  const info = await ops.probe(filePath)
  const silences = await ops.detectSilence(filePath, opts || {})
  const keep = ops.computeKeep(info.duration, silences)
  const kept = keep.reduce((a, s) => a + (s.end - s.start), 0)
  return { keep, removed: silences.length, saved: Math.max(0, info.duration - kept), duration: info.duration }
})

// Tao phu de tu dong bang Whisper (local). opts.clips -> ca timeline; nguoc lai 1 file
ipcMain.handle('captions:generate', async (event, filePath, opts) => {
  const whisper = require('./whisper.cjs') // nap muon (transformers nang)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taoclip-cap-'))
  try {
    const wav = path.join(tmpDir, 'a.wav')
    event.sender.send('captions:progress', { phase: 'audio' })
    if (opts && opts.clips && opts.clips.length) await ops.buildTimelineAudioWav(opts.clips, wav)
    else await ops.extractAudioWav(filePath, wav)
    const segs = await whisper.transcribe(wav, {
      language: (opts && opts.language) || 'vietnamese',
      model: (opts && opts.model) || 'Xenova/whisper-base',
      onStatus: (s) => event.sender.send('captions:progress', s)
    })
    event.sender.send('captions:progress', { phase: 'done' })
    return segs
  } finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {} }
})

// Chon noi luu file xuat
ipcMain.handle('dialog:saveVideo', async (_e, defaultName) => {
  const res = await dialog.showSaveDialog({
    title: 'Luu video',
    defaultPath: defaultName || 'taoclip-export.mp4',
    filters: [{ name: 'MP4', extensions: ['mp4'] }]
  })
  if (res.canceled || !res.filePath) return null
  return res.filePath
})

// Chon file am thanh (nhac nen)
ipcMain.handle('dialog:openAudio', async () => {
  const res = await dialog.showOpenDialog({
    title: 'Chon nhac nen',
    properties: ['openFile'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'] }]
  })
  if (res.canceled || !res.filePaths.length) return null
  return res.filePaths[0]
})

// Long tieng AI (TTS) -> tao file audio giu lai trong phien.
// opts.engine: 'local' (mms-tts-vie, offline) | 'google' (Google Cloud TTS)
ipcMain.handle('tts:generate', async (event, text, opts = {}) => {
  const dir = path.join(os.tmpdir(), 'taoclip-tts')
  fs.mkdirSync(dir, { recursive: true })

  if (opts.engine === 'google') {
    const g = require('./tts-google.cjs')
    const settings = require('./settings.cjs')
    const key = settings.getApiKey()
    if (!key) throw new Error('Chua cau hinh Google API key')
    const out = path.join(dir, 'voice-' + Date.now() + '.mp3')
    event.sender.send('tts:progress', { phase: 'synthesize' })
    await g.synthesize(text, out, {
      apiKey: key, voiceName: opts.voice, langCode: opts.langCode || 'vi-VN',
      rate: opts.rate ?? 1, pitch: opts.pitch ?? 0, ssml: !!opts.ssml
    })
    let duration = 0
    try { const m = await ops.probe(out); duration = m.duration || 0 } catch (e) {}
    event.sender.send('tts:progress', { phase: 'done' })
    return { path: out, duration }
  }

  // Mac dinh: TTS local (offline)
  const tts = require('./tts.cjs')
  const out = path.join(dir, 'voice-' + Date.now() + '.wav')
  const r = await tts.synthesize(text, out, { onStatus: (s) => event.sender.send('tts:progress', s) })
  event.sender.send('tts:progress', { phase: 'done' })
  return r
})

// Doi giong video (re-dub): TTS tung cau phu de -> ghep 1 track long tieng khop timeline.
// payload: { segments:[{start,end,text}] (thoi gian OUTPUT), totalDur, tts:{engine,voice,rate,pitch,langCode} }
ipcMain.handle('redub:generate', async (event, payload) => {
  const { segments = [], totalDur = 0, tts: ttsCfg = {} } = payload || {}
  const segs = segments
    .filter((s) => s.text && s.text.trim() && s.end - s.start > 0.05)
    .sort((a, b) => a.start - b.start)
  if (!segs.length) throw new Error('Khong co cau nao de doc')
  if (!(totalDur > 0)) throw new Error('Thieu thoi luong timeline')
  const send = (s) => event.sender.send('redub:progress', s)
  const outDir = path.join(os.tmpdir(), 'taoclip-tts')
  fs.mkdirSync(outDir, { recursive: true })
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taoclip-redub-'))
  try {
    let g = null, key = null, ttsLocal = null
    if (ttsCfg.engine === 'google') {
      g = require('./tts-google.cjs')
      key = require('./settings.cjs').getApiKey()
      if (!key) throw new Error('Chua cau hinh Google API key')
    } else {
      ttsLocal = require('./tts.cjs')
    }
    const parts = []
    for (let i = 0; i < segs.length; i++) {
      send({ phase: 'tts', done: i, total: segs.length })
      const s = segs[i]
      const f = path.join(tmpDir, `seg${i}.` + (g ? 'mp3' : 'wav'))
      if (g) await g.synthesize(s.text, f, { apiKey: key, voiceName: ttsCfg.voice, langCode: ttsCfg.langCode || 'vi-VN', rate: ttsCfg.rate ?? 1, pitch: ttsCfg.pitch ?? 0 })
      else await ttsLocal.synthesize(s.text, f, { onStatus: (st) => { if (st.phase === 'download') send(st) } })
      // slot = cho trong toi da cua cau nay (den cau ke tiep / het timeline)
      const next = segs[i + 1]
      parts.push({ path: f, start: s.start, slot: Math.max(0.3, (next ? next.start : totalDur) - s.start) })
    }
    send({ phase: 'mix' })
    const out = path.join(outDir, 'redub-' + Date.now() + '.wav')
    await ops.buildRedubTrack({ parts, totalDur, output: out })
    let duration = totalDur
    try { duration = (await ops.probe(out)).duration || totalDur } catch (e) {}
    send({ phase: 'done' })
    return { path: out, duration, segments: segs.length }
  } finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {} }
})

// Google TTS: liet ke giong doc (dung key da luu)
ipcMain.handle('tts:voices', async (_e, langCode) => {
  const settings = require('./settings.cjs')
  const key = settings.getApiKey()
  if (!key) throw new Error('Chua cau hinh Google API key')
  const g = require('./tts-google.cjs')
  return g.listVoices(key, langCode || 'vi-VN')
})

// Cai dat: luu / kiem tra Google API key (khong tra key ra renderer)
ipcMain.handle('settings:setApiKey', (_e, key) => {
  const settings = require('./settings.cjs')
  settings.setApiKey(key)
  return settings.hasApiKey()
})
ipcMain.handle('settings:hasApiKey', () => {
  const settings = require('./settings.cjs')
  return settings.hasApiKey()
})

// Tai video tu link (YouTube/TikTok/... qua yt-dlp) ve Downloads\TaoClip -> tra ve path
ipcMain.handle('dl:video', async (event, url) => {
  const dl = require('./downloader.cjs')
  dl.configure(path.join(app.getPath('userData'), 'bin'), ffmpegPath)
  const outDir = path.join(app.getPath('downloads'), 'TaoClip')
  const send = (s) => event.sender.send('dl:progress', s)
  return dl.download(url, outDir, { onStatus: send, onProgress: (p) => send({ phase: 'download', progress: p }) })
})

// AI doi nen (local RVM ONNX): xu ly doan [start, start+dur] cua 1 video -> file mp4 moi
// opts: { input, start, dur, bg: {type:'blur'|'color'|'image', color?, path?} }
ipcMain.handle('ai:replaceBg', async (event, opts) => {
  const aiv = require('./ai-video.cjs') // nap muon (onnxruntime nang)
  aiv.configure(ffmpegPath, path.join(app.getPath('userData'), 'models'))
  ops.setEncoder(gpuEncoder) // composite dung GPU neu co
  const dir = path.join(os.tmpdir(), 'taoclip-ai')
  fs.mkdirSync(dir, { recursive: true })
  const out = path.join(dir, 'bg-' + Date.now() + '.mp4')
  const send = (s) => event.sender.send('ai:progress', s)
  await aiv.replaceBackground({
    input: opts.input, start: opts.start || 0, dur: opts.dur, bg: opts.bg || { type: 'blur' },
    output: out, onStatus: send, onProgress: (p) => send({ phase: 'process', progress: p })
  })
  return { path: out }
})

// AI doi khuon mat (local insightface ONNX): swap mat trong doan [start, start+dur] cua 1 video.
// opts: { input, start, dur, sourceImage } -> file mp4 moi
ipcMain.handle('ai:faceSwap', async (event, opts) => {
  const fsw = require('./face-swap.cjs') // nap muon (model nang ~745MB)
  fsw.configure(ffmpegPath, path.join(app.getPath('userData'), 'models'))
  ops.setEncoder(gpuEncoder)
  const dir = path.join(os.tmpdir(), 'taoclip-ai')
  fs.mkdirSync(dir, { recursive: true })
  const out = path.join(dir, 'face-' + Date.now() + '.mp4')
  const send = (s) => event.sender.send('face:progress', s)
  let r
  try {
    r = await fsw.swapFaceVideo({
      input: opts.input, start: opts.start || 0, dur: opts.dur, sourceImage: opts.sourceImage,
      output: out, onStatus: send, onProgress: (p) => send({ phase: 'process', progress: p })
    })
  } catch (e) {
    if (e.code === 'NO_SOURCE_FACE') throw new Error('NO_SOURCE_FACE') // token on dinh cho renderer
    throw e
  }
  return { path: out, frames: r.frames, swapped: r.swapped }
})

// Chon anh khuon mat nguon
ipcMain.handle('dialog:openFaceImage', async () => {
  const res = await dialog.showOpenDialog({
    title: 'Chon anh khuon mat', properties: ['openFile'],
    filters: [{ name: 'Anh', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }]
  })
  if (res.canceled || !res.filePaths.length) return null
  return res.filePaths[0]
})

// Luu du an (.taoclip = JSON)
ipcMain.handle('project:save', async (_e, data) => {
  const res = await dialog.showSaveDialog({
    title: 'Luu du an', defaultPath: 'taoclip-project.taoclip',
    filters: [{ name: 'TaoClip Project', extensions: ['taoclip'] }]
  })
  if (res.canceled || !res.filePath) return null
  projectStore.writeProject(res.filePath, data)
  return res.filePath
})

// Mo du an
ipcMain.handle('project:open', async () => {
  const res = await dialog.showOpenDialog({
    title: 'Mo du an', properties: ['openFile'],
    filters: [{ name: 'TaoClip Project', extensions: ['taoclip'] }]
  })
  if (res.canceled || !res.filePaths.length) return null
  return projectStore.readProject(res.filePaths[0])
})

// Cho phep chon NHIEU video cung luc
ipcMain.handle('dialog:openVideos', async () => {
  const res = await dialog.showOpenDialog({
    title: 'Chon video', properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'] }]
  })
  if (res.canceled || !res.filePaths.length) return []
  return res.filePaths
})

// Cho phep chon NHIEU anh cung luc (slideshow)
ipcMain.handle('dialog:openImages', async () => {
  const res = await dialog.showOpenDialog({
    title: 'Chon anh', properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Anh', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'] }]
  })
  if (res.canceled || !res.filePaths.length) return []
  return res.filePaths
})

// Relink a missing project asset without discarding its timeline entry.
ipcMain.handle('dialog:relinkMedia', async (_e, kind) => {
  const image = kind === 'image'
  const res = await dialog.showOpenDialog({
    title: 'Tìm lại media bị thiếu', properties: ['openFile'],
    filters: [{ name: image ? 'Ảnh' : 'Video', extensions: image
      ? ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif']
      : ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'] }]
  })
  return res.canceled || !res.filePaths.length ? null : res.filePaths[0]
})

// Core export: 1 clip video -> exportVideo (giu smart-cut/auto-cut);
// nhieu clip HOAC co anh (slideshow) -> exportClips (ghep tung doan)
async function coreExport(opts, output, onProgress) {
  const useClips = opts.clips && (opts.clips.length > 1 || opts.clips.some((c) => c.kind === 'image'))
  if (useClips) return ops.exportClips({ clips: opts.clips, output, ratio: opts.ratio, colorFilter: opts.colorFilter, transition: opts.transition, onProgress })
  const c = opts.clips && opts.clips[0]
  return ops.exportVideo({
    ...opts, output, onProgress,
    input: c ? c.input : opts.input,
    start: c ? c.in : opts.start, end: c ? c.out : opts.end, speed: c ? c.speed : opts.speed
  })
}

// Huy lan xuat dang chay (kill ffmpeg + bo cac buoc sau)
ipcMain.handle('export:cancel', (_event, jobId) => ops.cancelJob(jobId))

// Xuat video: core (cat/toc do/khung/loc mau/ghep clip) -> khac phu de -> tron am thanh
ipcMain.handle('video:export', async (event, opts) => {
  const jobId = typeof opts.jobId === 'string' && opts.jobId ? opts.jobId : `export:${event.sender.id}:${Date.now()}`
  const job = ops.beginJob(jobId)
  try {
    return await ops.runJob(job, () => runExport(event, opts))
  } catch (e) {
    if (job.cancelled || e.cancelled) return { cancelled: true }
    throw e
  } finally { ops.endJob(jobId) }
})

async function runExport(event, opts) {
  const report = (pct) => event.sender.send('video:export:progress', pct)
  const stage = (name) => event.sender.send('video:export:stage', name)
  ops.setEncoder(opts.useGpu !== false ? gpuEncoder : 'cpu')
  const capBurn = opts.captions && opts.captions.length && opts.burnCaptions
  const hasOverlays = opts.overlays && opts.overlays.length
  const burning = capBurn || hasOverlays
  // Cac track am thanh them: nhac nen + long tieng CUNG LUC (opts.music/opts.voice)
  // Van nhan opts.bgAudio (payload cu, 1 track) de tuong thich nguoc
  const audioTracks = []
  if (opts.music) audioTracks.push({ path: opts.music.path, volume: opts.music.volume ?? 1, loop: opts.music.loop !== false, role: 'music' })
  if (opts.voice) audioTracks.push({ path: opts.voice.path, volume: opts.voice.volume ?? 1, loop: false, role: 'voice', delay: Math.round((opts.voice.offset || 0) * 1000) })
  if (!audioTracks.length && opts.bgAudio) audioTracks.push({ path: opts.bgAudio, volume: opts.bgVolume ?? 1, loop: !!opts.bgLoop, role: 'music' })
  const originalHasAudio = opts.clips
    ? (opts.clips.length === 1 ? !!opts.clips[0].hasAudio : opts.clips.some((clip) => clip.hasAudio))
    : true
  const mixing = audioTracks.length > 0 || (originalHasAudio && Number(opts.origVolume) < 0.999)
  const multi = opts.clips && opts.clips.length > 1
  const c0 = opts.clips && opts.clips[0]

  if (!burning && !mixing) { stage('core'); return coreExport(opts, opts.output, report) }

  const stages = 1 + (burning ? 1 : 0) + (mixing ? 1 : 0)
  let si = 0
  const w = 1 / stages
  const stageReport = (p) => report(Math.round((si + p / 100) * w * 100))

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taoclip-exp-'))
  try {
    // 1) Core
    stage('core')
    let cur = path.join(tmpDir, 's0.mp4')
    await coreExport(opts, cur, stageReport); si++

    // 2) Khac phu de + chu/sticker (re-encode video)
    if (burning) {
      stage('captions')
      const dims = await ops.probe(cur)
      // Phu de: da clip tinh theo timeline (identity); 1 clip theo trim/auto-cut + toc do
      let events = []
      if (capBurn) {
        if (opts.captionTimebase === 'timeline') {
          events = opts.captions
        } else {
          const segs = multi ? [{ start: 0, end: dims.duration }]
            : ((opts.segments && opts.segments.length) ? opts.segments : [{ start: (c0 ? c0.in : opts.start) || 0, end: c0 ? c0.out : opts.end }])
          const speedMap = multi ? 1 : ((c0 ? c0.speed : opts.speed) || 1)
          events = caps.mapToOutput(opts.captions, segs, speedMap)
        }
      }
      // Overlay (chu/sticker): da o thoi gian timeline, vi tri tuong doi -> px
      if (hasOverlays) {
        for (const o of opts.overlays) {
          events.push({
            start: o.start, end: o.end, text: o.text,
            pos: { x: (o.x ?? 0.5) * dims.width, y: (o.y ?? 0.5) * dims.height },
            fs: Math.round((o.size || 0.07) * dims.height),
            color: o.color ? caps.rgbToAss(o.color) : null
          })
        }
      }
      const assFile = path.join(tmpDir, 'sub.ass')
      fs.writeFileSync(assFile, caps.toAss(events, { width: dims.width, height: dims.height, fontScale: opts.captionScale || 1 }), 'utf8')
      const tot = dims.duration || 1
      const next = mixing ? path.join(tmpDir, 's1.mp4') : opts.output
      await ops.burnSubtitles({ input: cur, assFile, output: next, onProgress: (sec) => stageReport((sec / tot) * 100) })
      cur = next; si++
    }

    // 3) Tron am thanh (nhac nen + long tieng, co ducking)
    if (mixing) {
      stage('audio')
      const dims = await ops.probe(cur)
      const tot = dims.duration || 1
      await ops.mixAudioTracks({
        video: cur, tracks: audioTracks, output: opts.output,
        videoVol: opts.origVolume ?? 1, hasOrigAudio: dims.hasAudio,
        ducking: opts.ducking !== false,
        onProgress: (sec) => stageReport((sec / tot) * 100)
      })
      si++
    }
    report(100)
    return { ok: true, output: opts.output, method: [burning && 'cap', mixing && 'mix'].filter(Boolean).join('+') || 'core' }
  } finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {} }
}

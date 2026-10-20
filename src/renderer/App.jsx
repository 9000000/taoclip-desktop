import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getEntitlements } from './entitlements.js'
import { useI18n, LANGS } from './i18n.jsx'
import {
  Film, Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight, Repeat, Volume2, VolumeX,
  Save, FolderOpen, Undo2, Redo2, Upload, Scissors, Minus, Plus, Music, X, Keyboard, Image, FolderUp, Mic
} from 'lucide-react'
import {
  fmt, fileUrl, clamp, FRAME, RE_VIDEO, RE_IMAGE, RE_AUDIO, isImg, clipOut, FILTERS, TABS
} from './utils.js'
import MediaTab from './tabs/MediaTab.jsx'
import EffectTab from './tabs/EffectTab.jsx'
import TextTab from './tabs/TextTab.jsx'
import AudioTab from './tabs/AudioTab.jsx'
import FilterTab from './tabs/FilterTab.jsx'
import StickerTab from './tabs/StickerTab.jsx'
import TransTab from './tabs/TransTab.jsx'
import Inspector from './Inspector.jsx'
import ExportDialog from './ExportDialog.jsx'
import { normalizeProject } from './project-model.js'
import { buildTimelinePlan, mapSourceRange } from './timeline-plan.js'

function makeEntityId(kind) {
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
  return `${kind}_${value}`
}

export default function App() {
  const { t, lang, setLang } = useI18n()
  useMemo(() => getEntitlements(), [])
  const videoRef = useRef(null)
  const scrollRef = useRef(null)
  const dragRef = useRef(null)
  const idRef = useRef(1)
  const activeExportJobRef = useRef(null)
  const projectIdRef = useRef(null)
  if (!projectIdRef.current) projectIdRef.current = makeEntityId('project')
  const pendingSeekRef = useRef(null)
  const wasPlayingRef = useRef(false)
  const frameRef = useRef(null)
  const curRef = useRef(0) // guong cua `current` cho vong phat anh (RAF)
  const musicRef = useRef(null) // <audio> nghe thu nhac trong preview
  const voiceRef = useRef(null) // <audio> nghe thu long tieng trong preview
  const [frameH, setFrameH] = useState(0)

  const [tab, setTab] = useState('media')
  const [clips, setClips] = useState([]) // {id,path,name,src,in,out,speed,thumbs}
  const [selId, setSelId] = useState(null)
  const [activeIdx, setActiveIdx] = useState(0) // clip dang nap trong <video>
  const [current, setCurrent] = useState(0) // thoi gian global timeline
  const [playing, setPlaying] = useState(false)
  const [ratio, setRatio] = useState('9:16')
  const [extraRatios, setExtraRatios] = useState([])
  const [safeZone, setSafeZone] = useState(false)
  const [filterKey, setFilterKey] = useState('none')
  const [mode, setMode] = useState('smart')
  const [pps, setPps] = useState(80)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [loop, setLoop] = useState(false)
  // phu de + auto-cut (chi khi 1 clip)
  const [captions, setCaptions] = useState([])
  const [captionTimebase, setCaptionTimebase] = useState('timeline')
  const [capLang, setCapLang] = useState('vietnamese')
  const [capBusy, setCapBusy] = useState(false)
  const [capStatus, setCapStatus] = useState('')
  const [burnCaptions, setBurnCaptions] = useState(true)
  const [keepSegments, setKeepSegments] = useState(null)
  const [autoCut, setAutoCut] = useState(false)
  const [autoInfo, setAutoInfo] = useState(null)
  const [busy, setBusy] = useState(false)
  // am thanh them: 2 track DOC LAP (nhac nen + long tieng), tron cung luc khi xuat
  const [music, setMusic] = useState(null) // {path,name}
  const [voice, setVoice] = useState(null) // {path,name}
  const [musicWave, setMusicWave] = useState(null) // anh waveform cua nhac
  const [voiceWave, setVoiceWave] = useState(null) // anh waveform cua giong
  const [musicVol, setMusicVol] = useState(0.4)
  const [voiceVol, setVoiceVol] = useState(1)
  const [ducking, setDucking] = useState(true) // tu ha nhac khi co giong
  const [bgDur, setBgDur] = useState(0) // thoi luong nhac (de chia deu slideshow)
  const [voiceDur, setVoiceDur] = useState(0)
  const [voiceOffset, setVoiceOffset] = useState(0) // giay bat dau long tieng tren timeline
  const [syncMode, setSyncMode] = useState('fit') // fit = chia deu theo nhac | fixed = co dinh moi anh
  const [slideDur, setSlideDur] = useState(3) // thoi luong mac dinh moi anh (che do fixed)
  const [origVolume, setOrigVolume] = useState(1)
  const [bgLoop, setBgLoop] = useState(true)
  const [ttsText, setTtsText] = useState('')
  const [ttsBusy, setTtsBusy] = useState(false)
  const [ttsStatus, setTtsStatus] = useState('')
  // TTS engine (local mms-tts | google cloud)
  const [ttsEngine, setTtsEngine] = useState('local')
  const [ttsVoice, setTtsVoice] = useState('')
  const [ttsVoices, setTtsVoices] = useState([])
  const [ttsRate, setTtsRate] = useState(1)
  const [ttsPitch, setTtsPitch] = useState(0)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [voicesLoading, setVoicesLoading] = useState(false)
  const ttsPreviewRef = useRef(null)
  // doi giong video (re-dub): Whisper -> TTS tung cau -> track long tieng
  const [redubBusy, setRedubBusy] = useState(false)
  const [redubStatus, setRedubStatus] = useState('')
  // doi nen AI (RVM local)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiStatus, setAiStatus] = useState('')
  // doi khuon mat AI (insightface local)
  const [faceBusy, setFaceBusy] = useState(false)
  const [faceStatus, setFaceStatus] = useState('')
  const [aiEdited, setAiEdited] = useState(false) // co noi dung do AI tao/chinh -> danh dau khi xuat
  // tai video tu link (yt-dlp)
  const [dlBusy, setDlBusy] = useState(false)
  const [dlStatus, setDlStatus] = useState('')
  // chu / sticker overlay
  const [overlays, setOverlays] = useState([]) // {id,type,text,start,end,x,y,size,color}
  const [selOv, setSelOv] = useState(null)
  // tang toc + chuyen canh + keo-tha sap xep
  const [gpuEnc, setGpuEnc] = useState('cpu')
  const [useGpu, setUseGpu] = useState(true)
  const [transition, setTransition] = useState('none') // none | fade | cross
  const [dragInsert, setDragInsert] = useState(null)
  // xuat
  const [exporting, setExporting] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [expStage, setExpStage] = useState('core')
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [dragOver, setDragOver] = useState(false)
  // lich su (snapshot clips)
  const [hist, setHist] = useState([])
  const [future, setFuture] = useState([])
  // tu luu / khoi phuc
  const [recover, setRecover] = useState(null)
  const autosaveRef = useRef(null)
  // toast thong bao + bang phim tat
  const [toasts, setToasts] = useState([]) // {id,type:'ok'|'err',msg,action?:{label,run}}
  const [showKeys, setShowKeys] = useState(false)
  // keo gian panel (nho kich thuoc)
  const [libW, setLibW] = useState(() => clamp(Number(localStorage.getItem('taoclip_libw')) || 290, 200, 480))
  const [inspW, setInspW] = useState(() => clamp(Number(localStorage.getItem('taoclip_inspw')) || 280, 220, 460))
  const [tlH, setTlH] = useState(() => clamp(Number(localStorage.getItem('taoclip_tlh')) || 280, 160, 480))

  function notify(msg, type = 'ok', action) {
    const id = 'n' + (idRef.current++)
    setToasts((ts) => [...ts, { id, msg, type, action }])
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), type === 'err' ? 8000 : 5000)
  }
  const closeToast = (id) => setToasts((ts) => ts.filter((x) => x.id !== id))

  // Keo gian panel trai / phai / timeline
  function startPanelResize(kind, e) {
    e.preventDefault()
    const sx = e.clientX, sy = e.clientY, l0 = libW, i0 = inspW, t0 = tlH
    const move = (ev) => {
      if (kind === 'lib') setLibW(clamp(l0 + (ev.clientX - sx), 200, 480))
      else if (kind === 'insp') setInspW(clamp(i0 - (ev.clientX - sx), 220, 460))
      else setTlH(clamp(t0 - (ev.clientY - sy), 160, 480))
    }
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up) }
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up)
  }

  const single = clips.length === 1
  const filter = FILTERS.find((f) => f.k === filterKey) || FILTERS[0]
  const selectedClip = clips.find((c) => c.id === selId) || null

  // Bo cuc timeline: moi clip 1 doan [start,end] theo thoi gian output
  const layout = useMemo(() => {
    let acc = 0
    return clips.map((c) => { const d = clipOut(c); const seg = { id: c.id, start: acc, end: acc + d, clip: c }; acc += d; return seg })
  }, [clips])
  const totalDuration = layout.length ? layout[layout.length - 1].end : 0
  const activeClip = clips[activeIdx] || null
  const activeIsImage = isImg(activeClip)
  const videoSrc = activeClip && !activeIsImage && !activeClip.missing ? fileUrl(activeClip.path) : null
  const imageSrc = activeClip && activeIsImage && !activeClip.missing ? fileUrl(activeClip.path) : null
  const imageCount = useMemo(() => clips.filter(isImg).length, [clips])

  useEffect(() => window.taoclip.onExportProgress((p) => setProgress(p)), [])
  useEffect(() => window.taoclip.onExportStage?.((s) => setExpStage(s)) || undefined, [])
  useEffect(() => { window.taoclip.getEncoder().then(setGpuEnc).catch(() => {}) }, [])
  useEffect(() => { window.taoclip.hasApiKey?.().then(setHasKey).catch(() => {}) }, [])
  // Khi chuyen sang Google va da co key -> tu nap danh sach giong
  useEffect(() => { if (ttsEngine === 'google' && hasKey && !ttsVoices.length && !voicesLoading) loadVoices() }, [ttsEngine, hasKey])
  // Do chieu cao khung preview -> tinh co chu/sticker overlay theo px (dung moi ti le)
  useEffect(() => {
    const el = frameRef.current; if (!el) { setFrameH(0); return }
    const ro = new ResizeObserver((es) => { for (const e of es) setFrameH(e.contentRect.height) })
    ro.observe(el); return () => ro.disconnect()
  }, [activeIdx, ratio, clips.length])
  // Kiem tra phien tu luu truoc do (chi 1 lan luc mo)
  useEffect(() => {
    try { const s = localStorage.getItem('taoclip_autosave'); if (s) { const d = JSON.parse(s); if (d.clips && d.clips.length) setRecover(d) } } catch {}
  }, [])
  // Nho kich thuoc panel
  useEffect(() => {
    try { localStorage.setItem('taoclip_libw', libW); localStorage.setItem('taoclip_inspw', inspW); localStorage.setItem('taoclip_tlh', tlH) } catch {}
  }, [libW, inspW, tlH])
  // Meo lan dau mo app: chi hien 1 lan
  useEffect(() => {
    try {
      if (!localStorage.getItem('taoclip_tip_keys')) {
        localStorage.setItem('taoclip_tip_keys', '1')
        setTimeout(() => notify(t('tip_first')), 1500)
      }
    } catch {}
  }, [])
  // Tu luu (debounce 1.2s) khi du an thay doi
  useEffect(() => {
    if (!clips.length) return
    clearTimeout(autosaveRef.current)
    autosaveRef.current = setTimeout(() => { try { localStorage.setItem('taoclip_autosave', JSON.stringify(buildProject())) } catch {} }, 1200)
    return () => clearTimeout(autosaveRef.current)
  }, [clips, ratio, filterKey, mode, captions, overlays, music, voice, musicVol, voiceVol, ducking, origVolume, bgLoop, transition, burnCaptions, syncMode, slideDur, bgDur, voiceDur, voiceOffset])
  useEffect(() => { if (videoRef.current) { videoRef.current.volume = volume; videoRef.current.muted = muted } }, [volume, muted, activeIdx])
  // Giu activeIdx & current trong pham vi hop le khi xoa/doi thu tu/cat clip
  useEffect(() => { if (activeIdx > clips.length - 1) setActiveIdx(Math.max(0, clips.length - 1)) }, [clips.length, activeIdx])
  useEffect(() => { if (current > totalDuration) setCurrent(totalDuration) }, [totalDuration, current])
  useEffect(() => { curRef.current = current }, [current])
  useEffect(() => { if (!playing) wasPlayingRef.current = false }, [playing])

  // ---- Che do "khop nhac": chia deu thoi luong nhac cho cac anh ----
  useEffect(() => {
    if (syncMode !== 'fit' || !bgDur || !music || !imageCount) return
    const per = clamp(bgDur / imageCount, 0.5, 30)
    setClips((cs) => cs.map((c) => isImg(c) ? { ...c, in: 0, out: per } : c))
  }, [syncMode, bgDur, imageCount, music])

  // ---- Vong phat cho ANH (khong co <video> lam dong ho) ----
  useEffect(() => {
    if (!playing || !activeIsImage) return
    let raf, last = performance.now()
    const tick = (now) => {
      const dt = (now - last) / 1000; last = now
      const seg = layout[activeIdx]
      if (!seg) { raf = requestAnimationFrame(tick); return }
      const nc = curRef.current + dt
      if (nc >= seg.end - 0.002) {
        if (activeIdx < clips.length - 1) {
          curRef.current = seg.end; setCurrent(seg.end)
          wasPlayingRef.current = true; pendingSeekRef.current = clips[activeIdx + 1].in ?? 0
          setActiveIdx(activeIdx + 1); return // effect chay lai cho clip moi
        } else if (loop) {
          curRef.current = 0; setCurrent(0)
          if (activeIdx !== 0) { wasPlayingRef.current = true; pendingSeekRef.current = clips[0].in ?? 0; setActiveIdx(0); return }
        } else { setPlaying(false); return }
      } else { curRef.current = nc; setCurrent(nc) }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, activeIsImage, activeIdx, layout, clips, loop])

  // ---- Nghe thu nhac nen trong preview (dong bo tho theo playhead) ----
  useEffect(() => {
    const a = musicRef.current
    if (a) { a.volume = musicVol; if (playing) a.play().catch(() => {}); else a.pause() }
  }, [playing, music, musicVol])
  // ---- Nghe thu long tieng: chi phat khi playhead vao vung [voiceOffset, voiceOffset+dur] ----
  useEffect(() => {
    const v = voiceRef.current; if (!v || !voice) return
    v.volume = voiceVol
    const local = current - voiceOffset
    const dur = v.duration || voiceDur || 0
    if (playing && local >= -0.05 && local < dur - 0.05) {
      if (v.paused) { try { if (Math.abs(v.currentTime - local) > 0.35) v.currentTime = Math.max(0, local) } catch (e) {}; v.play().catch(() => {}) }
    } else if (!v.paused) v.pause()
  }, [current, playing, voice, voiceVol, voiceOffset, voiceDur])

  // ---- Lich su (snapshot toan bo noi dung du an: clips + overlay + phu de + audio) ----
  function snapshot() {
    return {
      clips, overlays, captions, captionTimebase, music, voice, bgDur, voiceDur, voiceOffset,
      ratio, filterKey, mode, transition, burnCaptions,
      musicVol, voiceVol, origVolume, ducking, bgLoop, syncMode, slideDur,
      ttsEngine, ttsVoice, ttsRate, ttsPitch, keepSegments, autoCut, autoInfo, aiEdited
    }
  }
  function restore(s) {
    setClips(s.clips); setOverlays(s.overlays || []); setCaptions(s.captions || []); setCaptionTimebase(s.captionTimebase || 'timeline')
    setMusic(s.music ?? null); setVoice(s.voice ?? null)
    setBgDur(s.bgDur ?? 0); setVoiceDur(s.voiceDur ?? 0); setVoiceOffset(s.voiceOffset ?? 0)
    setRatio(s.ratio || '9:16'); setFilterKey(s.filterKey || 'none'); setMode(s.mode || 'smart')
    setTransition(s.transition || 'none'); setBurnCaptions(s.burnCaptions !== false)
    setMusicVol(s.musicVol ?? 0.4); setVoiceVol(s.voiceVol ?? 1); setOrigVolume(s.origVolume ?? 1)
    setDucking(s.ducking !== false); setBgLoop(s.bgLoop !== false); setSyncMode(s.syncMode || 'fit'); setSlideDur(s.slideDur ?? 3)
    setTtsEngine(s.ttsEngine || 'local'); setTtsVoice(s.ttsVoice || ''); setTtsRate(s.ttsRate ?? 1); setTtsPitch(s.ttsPitch ?? 0)
    setKeepSegments(s.keepSegments ?? null); setAutoCut(!!s.autoCut); setAutoInfo(s.autoInfo ?? null); setAiEdited(!!s.aiEdited)
  }
  function pushHistory() {
    const s = snapshot()
    setHist((h) => {
      const last = h[h.length - 1]
      if (last && Object.keys(s).every((key) => last[key] === s[key])) return h
      return [...h.slice(-49), s]
    })
    setFuture([])
  }
  function changeRatio(value) { if (value !== ratio) { pushHistory(); setRatio(value) } }
  function changeFilter(value) { if (value !== filterKey) { pushHistory(); setFilterKey(value) } }
  function changeTransition(value) { if (value !== transition) { pushHistory(); setTransition(value) } }
  function changeMode(value) { if (value !== mode) { pushHistory(); setMode(value) } }
  function changeBurnCaptions(value) { if (value !== burnCaptions) { pushHistory(); setBurnCaptions(value) } }
  function undo() {
    setHist((h) => { if (!h.length) return h; setFuture((f) => [snapshot(), ...f]); restore(h[h.length - 1]); return h.slice(0, -1) })
  }
  function redo() {
    setFuture((f) => { if (!f.length) return f; setHist((h) => [...h, snapshot()]); restore(f[0]); return f.slice(1) })
  }

  // ---- Them / sua / xoa clip ----
  async function addClips(paths) {
    const built = []
    for (const p of paths) {
      try {
        const m = await window.taoclip.probe(p)
        built.push({ id: makeEntityId('clip'), path: p, name: p.split(/[\\/]/).pop(), src: m, in: 0, out: m.duration, speed: 1, thumbs: [] })
      } catch (e) { setStatus(t('st_err', { e })) }
    }
    if (!built.length) return
    pushHistory()
    setClips((cs) => [...cs, ...built])
    setSelId((prev) => prev || built[0].id)
    built.forEach((c) => window.taoclip.thumbnails(c.path, 8).then((th) => setClips((cs) => cs.map((x) => x.id === c.id ? { ...x, thumbs: th } : x))).catch(() => {}))
    built.forEach((c) => loadWave(c.id, c.path, c.src.hasAudio))
  }
  // Nap anh waveform (dang song) cho 1 clip — bat dong bo, cache o main process
  function loadWave(id, p, hasAudio) {
    if (!hasAudio || !window.taoclip.waveform) return
    window.taoclip.waveform(p).then((w) => { if (w) setClips((cs) => cs.map((x) => x.id === id ? { ...x, wave: w } : x)) }).catch(() => {})
  }
  async function addImages(paths) {
    const built = []
    for (const p of paths) {
      let w = 1080, h = 1920
      try { const m = await window.taoclip.probe(p); if (m.width) { w = m.width; h = m.height } } catch (e) {}
      built.push({
        id: makeEntityId('clip'), kind: 'image', path: p, name: p.split(/[\\/]/).pop(),
        src: { duration: 3600, width: w, height: h, hasAudio: false, isImage: true },
        in: 0, out: slideDur, speed: 1, kenBurns: true, thumbs: [p]
      })
    }
    if (!built.length) return
    pushHistory()
    setClips((cs) => [...cs, ...built])
    setSelId((prev) => prev || built[0].id)
  }
  function updateClip(id, patch) { setClips((cs) => cs.map((c) => c.id === id ? { ...c, ...patch } : c)) }
  // Dat thoi luong cho MOI anh (nut "Ap dung tat ca")
  function setAllSlideDur(d) { pushHistory(); setClips((cs) => cs.map((c) => isImg(c) ? { ...c, in: 0, out: d } : c)) }
  function deleteClip(id) {
    pushHistory()
    setClips((cs) => cs.filter((c) => c.id !== id))
    if (selId === id) setSelId(null)
  }
  function moveClip(id, dir) {
    const i = clips.findIndex((c) => c.id === id); const j = i + dir
    if (i < 0 || j < 0 || j >= clips.length) return
    pushHistory()
    setClips((cs) => { const n = [...cs];[n[i], n[j]] = [n[j], n[i]]; return n })
  }

  function startReorder(seg, e) {
    e.stopPropagation(); setSelId(seg.id); setSelOv(null)
    const fromIdx = clips.findIndex((c) => c.id === seg.id)
    const startX = e.clientX; let moved = false
    dragRef.current = 'reorder'
    const move = (ev) => {
      if (!moved && Math.abs(ev.clientX - startX) < 5) return
      moved = true
      const rect = scrollRef.current.getBoundingClientRect()
      const gt = (ev.clientX - rect.left + scrollRef.current.scrollLeft) / pps
      setDragInsert(layout.filter((s) => gt > (s.start + s.end) / 2).length)
    }
    const up = () => {
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up)
      setDragInsert((prev) => {
        if (moved && prev != null) {
          pushHistory()
          setClips((cs) => { const n = [...cs]; const [x] = n.splice(fromIdx, 1); let idx = prev > fromIdx ? prev - 1 : prev; n.splice(idx, 0, x); return n })
        }
        return null
      })
      setTimeout(() => { dragRef.current = null }, 0)
    }
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up)
  }

  // ---- Tai video tu link (YouTube/TikTok) -> them vao timeline ----
  async function downloadFromUrl(url) {
    if (!url || dlBusy) return false
    setDlBusy(true); setDlStatus(t('dl_start'))
    const off = window.taoclip.onDlProgress((s) => {
      if (s.phase === 'tool') setDlStatus(t('dl_tool', { p: s.progress ?? 0 }))
      else if (s.phase === 'start') setDlStatus(t('dl_start'))
      else if (s.phase === 'download') setDlStatus(t('dl_progress', { p: s.progress }))
    })
    try {
      const r = await window.taoclip.downloadVideo(url)
      await addClips([r.path])
      setDlStatus(t('dl_done'))
      return true
    } catch (e) {
      setDlStatus(t('st_err', { e: String(e.message || e).replace(/^.*dl:video[^:]*:\s*/, '').slice(0, 200) }))
      return false
    } finally { off(); setDlBusy(false) }
  }

  async function handleImport() { const ps = await window.taoclip.openVideos(); if (ps && ps.length) addClips(ps) }
  async function handleImportImages() { const ps = await window.taoclip.openImages(); if (ps && ps.length) addImages(ps) }
  function onDragOver(e) { e.preventDefault(); setDragOver(true) }
  function onDragLeave(e) { e.preventDefault(); setDragOver(false) }
  function onDrop(e) {
    e.preventDefault(); setDragOver(false)
    const vids = [], imgs = []; let audio = null
    for (const f of e.dataTransfer.files) {
      const p = window.taoclip.getDroppedPath(f)
      if (RE_VIDEO.test(f.name)) vids.push(p)
      else if (RE_IMAGE.test(f.name)) imgs.push(p)
      else if (RE_AUDIO.test(f.name) && !audio) audio = p
    }
    if (vids.length) addClips(vids)
    if (imgs.length) addImages(imgs)
    if (audio) setMusicFile(audio)
    if (!vids.length && !imgs.length && !audio) setStatus(t('st_not_media', { f: '' }))
  }

  // ---- Phat lien tuc qua nhieu clip ----
  function onLoadedMeta() {
    const v = videoRef.current; if (!v || !activeClip) return
    v.playbackRate = activeClip.speed || 1; v.volume = volume; v.muted = muted
    // Tu sua thoi luong neu probe thieu (out=0 hoac vuot qua video that)
    if (v.duration && isFinite(v.duration) && (!activeClip.out || activeClip.out < 0.05 || activeClip.out > v.duration + 0.5)) {
      updateClip(activeClip.id, { out: v.duration, src: { ...activeClip.src, duration: v.duration } })
    }
    if (pendingSeekRef.current != null) { v.currentTime = pendingSeekRef.current; pendingSeekRef.current = null }
    if (wasPlayingRef.current) { v.play(); setPlaying(true); wasPlayingRef.current = false }
  }
  function onTimeUpdate() {
    const v = videoRef.current; if (!v || !activeClip) return
    const seg = layout[activeIdx]; if (!seg) return
    const gt = seg.start + (v.currentTime - activeClip.in) / (activeClip.speed || 1)
    setCurrent(clamp(gt, 0, totalDuration))
    if (activeClip.out > 0.05 && v.currentTime >= activeClip.out - 0.04) {
      if (activeIdx < clips.length - 1) { wasPlayingRef.current = !v.paused; pendingSeekRef.current = clips[activeIdx + 1].in; setActiveIdx(activeIdx + 1) }
      else { if (loop) { seekGlobal(0); if (!v.paused) v.play() } else { v.pause(); setPlaying(false) } }
    }
  }
  const seekGlobal = useCallback((gt) => {
    gt = clamp(gt, 0, totalDuration || 0)
    const seg = layout.find((s) => gt >= s.start && gt < s.end) || layout[layout.length - 1]
    if (!seg) { setCurrent(gt); return }
    const idx = clips.findIndex((c) => c.id === seg.id)
    const srcTime = seg.clip.in + (gt - seg.start) * (seg.clip.speed || 1)
    if (idx !== activeIdx) { pendingSeekRef.current = srcTime; setActiveIdx(idx) }
    else if (videoRef.current) videoRef.current.currentTime = srcTime
    curRef.current = gt; setCurrent(gt)
    const a = musicRef.current
    if (a && bgDur) { try { a.currentTime = bgLoop ? gt % bgDur : Math.min(gt, bgDur) } catch (e) {} }
    const vv = voiceRef.current
    if (vv) { try { vv.currentTime = clamp(gt - voiceOffset, 0, vv.duration || voiceDur || 0) } catch (e) {} }
  }, [layout, totalDuration, clips, activeIdx, bgDur, bgLoop, voiceDur, voiceOffset])
  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) { // clip dang active la ANH: khong co <video>, dieu khien bang state (vong RAF lo phat)
      if (!playing && current >= totalDuration - 0.05) seekGlobal(0)
      setPlaying((pl) => !pl); return
    }
    if (v.paused) { if (current >= totalDuration - 0.05) seekGlobal(0); v.play(); setPlaying(true) }
    else { v.pause(); setPlaying(false) }
  }, [current, totalDuration, seekGlobal, playing])

  // vi tri nguon trong clip dang o playhead (cho phim I/O)
  function playheadInClip() {
    const seg = layout[activeIdx]; if (!seg || !activeClip) return null
    return { clip: activeClip, src: activeClip.in + (current - seg.start) * (activeClip.speed || 1) }
  }

  // ---- Tach clip tai playhead thanh 2 clip (giu nguyen file nguon) ----
  function splitAtPlayhead() {
    const seg = layout.find((s) => current > s.start + 0.1 && current < s.end - 0.1)
    if (!seg) return
    const c = seg.clip
    pushHistory()
    const nid = makeEntityId('clip')
    let a, b
    if (isImg(c)) {
      const tl = current - seg.start // anh: chia thoi luong hien
      a = { ...c, in: 0, out: tl }
      b = { ...c, id: nid, in: 0, out: (c.out - c.in) - tl }
    } else {
      const srcPos = c.in + (current - seg.start) * (c.speed || 1)
      a = { ...c, out: srcPos }
      b = { ...c, id: nid, in: srcPos }
    }
    setClips((cs) => cs.flatMap((x) => x.id === c.id ? [a, b] : [x]))
    setSelId(nid)
  }

  // ---- Timeline ----
  function clientXToTime(clientX) {
    const rect = scrollRef.current.getBoundingClientRect()
    return (clientX - rect.left + scrollRef.current.scrollLeft) / pps
  }
  function timelineClick(e) {
    if (dragRef.current) return
    seekGlobal(clientXToTime(e.clientX))
  }
  // Keo playhead/ruler -> tua truc tiep (preview cap nhat theo giay)
  function startScrub(e) {
    e.stopPropagation(); dragRef.current = 'scrub'
    seekGlobal(clientXToTime(e.clientX))
    const move = (ev) => seekGlobal(clientXToTime(ev.clientX))
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); setTimeout(() => { dragRef.current = null }, 0) }
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up)
  }
  function startTrim(clip, which, e) {
    e.stopPropagation(); setSelId(clip.id); pushHistory(); dragRef.current = which
    const startX = e.clientX, origIn = clip.in, origOut = clip.out
    const move = (ev) => {
      const dt = ((ev.clientX - startX) / pps) * (clip.speed || 1)
      if (which === 'l') updateClip(clip.id, { in: clamp(origIn + dt, 0, clip.out - 0.1) })
      else updateClip(clip.id, { out: clamp(origOut + dt, clip.in + 0.1, clip.src.duration) })
    }
    const up = () => { dragRef.current = null; document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up) }
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up)
  }
  function fitZoom() { if (totalDuration && scrollRef.current) setPps(clamp((scrollRef.current.clientWidth - 40) / totalDuration, 20, 300)) }

  // ---- Snap: bam vao mep clip / playhead / dau-cuoi khi keo tren timeline ----
  // dur > 0: snap ca mep phai (tt+dur) roi quy ve diem dau
  function snapTime(tt, dur = 0) {
    const th = 8 / pps
    const targets = [0, totalDuration, current]
    for (const s of layout) targets.push(s.start, s.end)
    let best = tt, bd = th
    for (const g of targets) {
      let d = Math.abs(g - tt); if (d < bd) { bd = d; best = g }
      if (dur > 0) { d = Math.abs(g - (tt + dur)); if (d < bd) { bd = d; best = g - dur } }
    }
    return Math.max(0, best)
  }

  // ---- Keo khoi LONG TIENG tren timeline -> doi diem bat dau ----
  function startVoiceDrag(e) {
    e.stopPropagation(); pushHistory(); dragRef.current = 'voice'
    const startX = e.clientX, orig = voiceOffset
    const move = (ev) => {
      let nt = clamp(orig + (ev.clientX - startX) / pps, 0, Math.max(0, totalDuration - 0.1))
      setVoiceOffset(snapTime(nt, voiceDur))
    }
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); setTimeout(() => { dragRef.current = null }, 0) }
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up)
  }

  // ---- Keo khoi CHU/STICKER tren timeline: di chuyen / keo mep doi thoi luong ----
  function startOvMove(o, e) {
    e.stopPropagation(); setSelOv(o.id); pushHistory(); dragRef.current = 'ovmove'
    const startX = e.clientX, s0 = o.start, dur = o.end - o.start
    const move = (ev) => {
      let ns = clamp(s0 + (ev.clientX - startX) / pps, 0, Math.max(0, (totalDuration || s0 + dur) - dur))
      ns = snapTime(ns, dur)
      updateOverlay(o.id, { start: ns, end: ns + dur })
    }
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); setTimeout(() => { dragRef.current = null }, 0) }
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up)
  }
  function startOvResize(o, which, e) {
    e.stopPropagation(); setSelOv(o.id); pushHistory(); dragRef.current = 'ovres'
    const startX = e.clientX, s0 = o.start, e0 = o.end
    const move = (ev) => {
      const dt = (ev.clientX - startX) / pps
      if (which === 'l') updateOverlay(o.id, { start: clamp(snapTime(s0 + dt), 0, e0 - 0.2) })
      else updateOverlay(o.id, { end: clamp(snapTime(e0 + dt), s0 + 0.2, totalDuration || e0 + 60) })
    }
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); setTimeout(() => { dragRef.current = null }, 0) }
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up)
  }

  // ---- Phim tat ----
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if (e.key === ' ') { e.preventDefault(); togglePlay() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); seekGlobal(current - (e.shiftKey ? 1 : FRAME)) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); seekGlobal(current + (e.shiftKey ? 1 : FRAME)) }
      else if (e.key === 'Home') seekGlobal(0)
      else if (e.key === 'End') seekGlobal(totalDuration)
      else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); saveProject() }
      else if (!e.ctrlKey && !e.metaKey && (e.key === 'i' || e.key === 'I')) { const ph = playheadInClip(); if (ph) { pushHistory(); updateClip(ph.clip.id, { in: clamp(ph.src, 0, ph.clip.out - 0.1) }) } }
      else if (!e.ctrlKey && !e.metaKey && (e.key === 'o' || e.key === 'O')) { const ph = playheadInClip(); if (ph) { pushHistory(); updateClip(ph.clip.id, { out: clamp(ph.src, ph.clip.in + 0.1, ph.clip.src.duration) }) } }
      else if (!e.ctrlKey && !e.metaKey && (e.key === 's' || e.key === 'S')) splitAtPlayhead()
      else if (e.key === 'Delete' || e.key === 'Backspace') { if (selOv) delOverlay(selOv); else if (selId) deleteClip(selId) }
      else if (e.key === '?') setShowKeys((s) => !s)
      else if (e.key === 'Escape') { setShowKeys(false); if (!exporting) setShowExport(false) }
      else if (e.key === '+' || e.key === '=') setPps((p) => Math.min(300, p + 20))
      else if (e.key === '-' || e.key === '_') setPps((p) => Math.max(20, p - 20))
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.shiftKey ? redo() : undo() }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, totalDuration, clips, activeIdx, seekGlobal, togglePlay, selId, selOv, overlays, captions, music, voice, bgDur, voiceDur, voiceOffset, exporting])

  // ---- Ctrl + lan chuot tren timeline = thu phong ----
  useEffect(() => {
    const el = scrollRef.current; if (!el) return
    const onWheel = (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setPps((p) => clamp(p + (e.deltaY < 0 ? 20 : -20), 20, 300))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ---- Phu de / auto-cut ----
  // Nhan dang loi noi (Whisper) - dung chung cho phu de tu dong + doi giong video
  async function transcribeClips(onStatus) {
    const off = window.taoclip.onCaptionProgress((s) => {
      if (s.phase === 'download') onStatus(t('cap_downloading', { p: s.progress }))
      else if (s.phase === 'transcribe') onStatus(t('cap_transcribing'))
      else if (s.phase === 'audio') onStatus(t('cap_extracting'))
      else if (s.phase !== 'done' && s.phase !== 'ready') onStatus(t('cap_loading'))
    })
    try {
      const opts = { language: capLang }
      if (clips.length > 1) opts.clips = clips.map((c) => ({ input: c.path, in: c.in, out: c.out, speed: c.speed }))
      const result = await window.taoclip.generateCaptions(clips.length > 1 ? null : clips[0].path, opts)
      if (clips.length !== 1) return result
      const clip = clips[0]
      const plan = buildTimelinePlan([clip])
      return result.flatMap((caption) => mapSourceRange(plan, clip.id, caption.start, caption.end)
        .map((mapped) => ({ ...caption, start: mapped.start, end: mapped.end, clipId: clip.id,
          sourceStart: mapped.sourceStart, sourceEnd: mapped.sourceEnd })))
    } finally { off() }
  }
  async function genCaptions() {
    if (!clips.length) return
    setCapBusy(true); setCapStatus(t('cap_extracting'))
    try {
      const segs = await transcribeClips(setCapStatus)
      pushHistory()
      setCaptions(segs.map((caption) => ({ ...caption, id: caption.id || makeEntityId('caption') })))
      setCaptionTimebase('timeline'); setCapStatus(t('cap_count', { n: segs.length }))
    } catch (e) { setCapStatus(t('st_err', { e })) } finally { setCapBusy(false) }
  }
  function editCaption(i, text) { setCaptions((cs) => cs.map((c, idx) => idx === i ? { ...c, text } : c)) }
  function delCaption(i) { pushHistory(); setCaptions((cs) => cs.filter((_, idx) => idx !== i)) }
  async function detectSilence() {
    if (!single) return
    setBusy(true); setStatus(t('st_analyzing_silence'))
    try {
      const r = await window.taoclip.detectSilence(clips[0].path, { noise: '-30dB', minSilence: 0.4 })
      pushHistory()
      setKeepSegments(r.keep); setAutoInfo(r); setAutoCut(true)
      setStatus(t('st_silence_result', { n: r.removed, s: r.saved.toFixed(1) }))
    } catch (e) { setStatus(t('st_err', { e })) } finally { setBusy(false) }
  }

  // ---- Am thanh: 2 track (nhac + giong) ----
  async function setMusicFile(p) {
    pushHistory()
    setMusic({ path: p, name: p.split(/[\\/]/).pop() }); setBgLoop(true); setMusicVol(0.4); setMusicWave(null)
    window.taoclip.waveform?.(p).then((w) => setMusicWave(w || null)).catch(() => {})
    try { const m = await window.taoclip.probe(p); setBgDur(m.duration || 0) } catch (e) { setBgDur(0) }
  }
  async function importMusic() { const p = await window.taoclip.openAudio(); if (p) setMusicFile(p) }
  const ttsOpts = () => ttsEngine === 'google'
    ? { engine: 'google', voice: ttsVoice, rate: ttsRate, pitch: ttsPitch, langCode: 'vi-VN' }
    : { engine: 'local' }
  async function genTTS() {
    if (!ttsText.trim()) return
    if (ttsEngine === 'google' && !ttsVoice) { setTtsStatus(t('tts_no_voices')); return }
    setTtsBusy(true); setTtsStatus(t('tts_generating'))
    const off = window.taoclip.onTtsProgress((s) => { if (s.phase === 'download') setTtsStatus(t('cap_downloading', { p: s.progress })); else if (s.phase === 'synthesize') setTtsStatus(t('tts_generating')) })
    try {
      const r = await window.taoclip.generateTTS(ttsText.trim(), ttsOpts())
      pushHistory()
      setVoice({ path: r.path, name: t('tts_label') }); setVoiceVol(1); setVoiceDur(r.duration || 0); setVoiceOffset(0); setTtsStatus('')
      setVoiceWave(null); window.taoclip.waveform?.(r.path).then((w) => setVoiceWave(w || null)).catch(() => {})
    } catch (e) { setTtsStatus(t('st_err', { e })) } finally { off(); setTtsBusy(false) }
  }
  // ---- Doi giong video (re-dub): nhan dang -> TTS tung cau -> track voice khop timeline ----
  async function redubVideo() {
    if (!clips.length || !anyAudio) return
    if (ttsEngine === 'google' && !ttsVoice) { setRedubStatus(t('tts_no_voices')); return }
    setRedubBusy(true); setRedubStatus(t('cap_extracting'))
    try {
      let segs = captions
      if (!segs.length) {
        segs = await transcribeClips(setRedubStatus)
        pushHistory()
        segs = segs.map((caption) => ({ ...caption, id: caption.id || makeEntityId('caption') }))
        setCaptions(segs); setCaptionTimebase('timeline')
      }
      // Thoi gian NGUON -> TIMELINE: nhieu clip da o timeline; 1 clip map theo trim + toc do
      let mapped = segs
      if (captionTimebase === 'source-legacy' && clips.length === 1) {
        const c = clips[0], sp = c.speed || 1
        mapped = segs.map((s) => {
          const a = Math.max(s.start, c.in), b = Math.min(s.end, c.out)
          return b - a > 0.05 ? { start: (a - c.in) / sp, end: (b - c.in) / sp, text: s.text } : null
        }).filter(Boolean)
      }
      if (!mapped.length) { setRedubStatus(t('redub_no_speech')); return }
      const off = window.taoclip.onRedubProgress((s) => {
        if (s.phase === 'tts') setRedubStatus(t('redub_tts_progress', { i: s.done + 1, n: s.total }))
        else if (s.phase === 'mix') setRedubStatus(t('redub_mixing'))
        else if (s.phase === 'download') setRedubStatus(t('cap_downloading', { p: s.progress }))
      })
      try {
        const r = await window.taoclip.redub({ segments: mapped, totalDur: totalDuration, tts: ttsOpts() })
        pushHistory()
        setVoice({ path: r.path, name: t('redub_voice_name') }); setVoiceVol(1); setVoiceDur(r.duration || totalDuration); setVoiceOffset(0)
        setVoiceWave(null); window.taoclip.waveform?.(r.path).then((w) => setVoiceWave(w || null)).catch(() => {})
        setOrigVolume(0) // tat giong goc khi xuat (keo len lai neu muon giu nen)
        setMuted(true)   // tat tieng goc trong preview de nghe giong moi
        setRedubStatus(t('redub_done', { n: mapped.length }))
      } finally { off() }
    } catch (e) { setRedubStatus(t('st_err', { e })) } finally { setRedubBusy(false) }
  }

  // ---- Google TTS: key + giong doc + nghe thu ----
  async function saveApiKey() {
    const wasHadKey = hasKey
    try {
      const ok = await window.taoclip.setApiKey(apiKeyInput.trim())
      setHasKey(ok); setApiKeyInput('')
      // Lan dau (false->true) effect tu nap giong; doi key (true->true, effect khong chay) thi nap lai o day
      if (ok && wasHadKey) loadVoices()
    } catch (e) { setTtsStatus(t('st_err', { e })) }
  }
  async function loadVoices() {
    setVoicesLoading(true); setTtsStatus('')
    try {
      const vs = await window.taoclip.getVoices('vi-VN')
      setTtsVoices(vs)
      if (vs.length && !vs.find((v) => v.name === ttsVoice)) setTtsVoice(vs[0].name)
    } catch (e) { setTtsStatus(t('st_err', { e })) } finally { setVoicesLoading(false) }
  }
  async function previewVoice() {
    if (ttsEngine === 'google' && !ttsVoice) { setTtsStatus(t('tts_no_voices')); return }
    setTtsBusy(true); setTtsStatus(t('tts_previewing'))
    try {
      const sample = (ttsText.trim().slice(0, 200)) || t('tts_sample')
      const r = await window.taoclip.generateTTS(sample, ttsOpts())
      const a = ttsPreviewRef.current
      if (a) { a.src = fileUrl(r.path); a.play().catch(() => {}) }
      setTtsStatus('')
    } catch (e) { setTtsStatus(t('st_err', { e })) } finally { setTtsBusy(false) }
  }

  // ---- AI xu ly clip: file moi (chi gom doan [in,out]) thay the clip trong timeline ----
  // Dung chung cho doi nen + doi mat: re-probe, doi goc phu de (1 clip), regen thumbs, danh dau AI.
  // remapCaptions: chup luc BAT DAU op (tranh doc clips.length cu sau await dai)
  async function replaceClipFile(c, newPath, remapCaptions) {
    const m = await window.taoclip.probe(newPath)
    pushHistory()
    if (remapCaptions && captionTimebase === 'source-legacy') {
      setCaptions((cs) => cs
        .map((s) => ({ ...s, start: clamp(s.start - c.in, 0, m.duration), end: clamp(s.end - c.in, 0, m.duration) }))
        .filter((s) => s.end - s.start > 0.05))
    }
    updateClip(c.id, { path: newPath, src: m, in: 0, out: m.duration, thumbs: [], wave: null })
    setAiEdited(true)
    window.taoclip.thumbnails(newPath, 8).then((th) => setClips((cs) => cs.map((x) => x.id === c.id ? { ...x, thumbs: th } : x))).catch(() => {})
    loadWave(c.id, newPath, m.hasAudio)
  }

  // ---- Doi nen AI (RVM local): xu ly doan [in,out] cua clip dang chon -> thay clip ----
  async function pickBgImage() { const ps = await window.taoclip.openImages(); return ps && ps.length ? ps[0] : null }
  async function applyReplaceBg(bg) {
    const c = selectedClip
    if (!c || isImg(c) || aiBusy || faceBusy) return
    const remapCap = clips.length === 1 && captions.length > 0 // chup truoc await dai
    setAiBusy(true); setAiStatus(t('ai_loading'))
    const off = window.taoclip.onAiProgress((s) => {
      if (s.phase === 'download') setAiStatus(t('ai_downloading', { p: s.progress ?? 0 }))
      else if (s.phase === 'load') setAiStatus(t('ai_loading'))
      else if (s.phase === 'process') setAiStatus(t('ai_processing', { p: s.progress }))
      else if (s.phase === 'composite') setAiStatus(t('ai_compositing'))
    })
    try {
      const r = await window.taoclip.replaceBg({ input: c.path, start: c.in, dur: c.out - c.in, bg })
      await replaceClipFile(c, r.path, remapCap)
      if (remapCap) setCaptionTimebase('timeline')
      setAiStatus(t('ai_done'))
    } catch (e) { setAiStatus(t('st_err', { e })) } finally { off(); setAiBusy(false) }
  }

  // ---- Doi khuon mat AI (insightface local): swap doan [in,out] clip dang chon -> thay clip ----
  async function pickFaceImage() { return window.taoclip.openFaceImage() }
  async function applyFaceSwap(sourceImage) {
    const c = selectedClip
    if (!c || isImg(c) || faceBusy || aiBusy || !sourceImage) return
    const remapCap = clips.length === 1 && captions.length > 0 // chup truoc await dai
    setFaceBusy(true); setFaceStatus(t('face_loading'))
    const off = window.taoclip.onFaceProgress((s) => {
      if (s.phase === 'download') setFaceStatus(t('face_downloading', { f: (s.file || '').replace('.onnx', ''), p: s.progress ?? 0 }))
      else if (s.phase === 'load') setFaceStatus(t('face_loading'))
      else if (s.phase === 'source') setFaceStatus(t('face_reading_source'))
      else if (s.phase === 'process') setFaceStatus(t('face_processing', { p: s.progress }))
    })
    try {
      const r = await window.taoclip.faceSwap({ input: c.path, start: c.in, dur: c.out - c.in, sourceImage })
      if (!r.swapped) { setFaceStatus(t('face_no_face_video')); return } // co mat nguon nhung video khong co mat
      await replaceClipFile(c, r.path, remapCap)
      if (remapCap) setCaptionTimebase('timeline')
      setFaceStatus(t('face_done', { n: r.swapped, total: r.frames }))
    } catch (e) {
      setFaceStatus(/NO_SOURCE_FACE/.test(String(e.message || e)) ? t('face_no_source') : t('st_err', { e }))
    } finally { off(); setFaceBusy(false) }
  }

  // ---- Chu / Sticker overlay ----
  function addOverlay(ov) {
    pushHistory()
    const id = makeEntityId('overlay')
    const limit = totalDuration || current + 3
    const start = Math.min(current, Math.max(0, limit - 0.1))
    const base = { id, start, end: Math.min(limit, Math.max(start + 0.1, current + 3)), x: 0.5, y: 0.4, ...ov }
    setOverlays((os) => [...os, base]); setSelOv(id)
  }
  function addText() { addOverlay({ type: 'text', text: t('ov_default_text'), size: 0.07, color: '#ffffff' }) }
  function addEmoji(em) { addOverlay({ type: 'emoji', text: em, size: 0.14, color: null, y: 0.5 }) }
  function updateOverlay(id, patch) {
    setOverlays((os) => os.map((o) => {
      if (o.id !== id) return o
      const next = { ...o, ...patch }
      const limit = Math.max(totalDuration, next.end, next.start + 0.1)
      if (Object.prototype.hasOwnProperty.call(patch, 'start')) {
        next.start = clamp(Number(patch.start) || 0, 0, Math.max(0, limit - 0.1))
        if (next.end < next.start + 0.1) next.end = Math.min(limit, next.start + 0.1)
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'end')) next.end = clamp(Number(patch.end) || 0, next.start + 0.1, limit)
      return next
    }))
  }
  function delOverlay(id) { pushHistory(); setOverlays((os) => os.filter((o) => o.id !== id)); if (selOv === id) setSelOv(null) }
  function startOverlayDrag(o, e) {
    e.stopPropagation(); setSelOv(o.id)
    pushHistory()
    const frame = e.currentTarget.closest('.cc-frame'); if (!frame) return
    const rect = frame.getBoundingClientRect()
    const move = (ev) => updateOverlay(o.id, { x: clamp((ev.clientX - rect.left) / rect.width, 0, 1), y: clamp((ev.clientY - rect.top) / rect.height, 0, 1) })
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up) }
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up)
  }

  const activeCaption = captions.find((c) => !c.unmapped && current >= c.start && current < c.end)
  const activeOverlays = overlays.filter((o) => current >= o.start && current < o.end)
  const anyAudio = clips.some((c) => c.src?.hasAudio)

  // ---- Luu / Mo du an ----
  function buildProject() {
    return normalizeProject({
      version: 3, projectId: projectIdRef.current, captionTimebase, ratio, filterKey, mode, captions, burnCaptions, overlays, transition,
      clips: clips.map((c) => ({ id: c.id, path: c.path, name: c.name, kind: c.kind || 'video', in: c.in, out: c.out, speed: c.speed, kenBurns: c.kenBurns, missing: c.missing })),
      music, voice, musicVol, voiceVol, ducking, bgDur, voiceDur, voiceOffset, origVolume, bgLoop, syncMode, slideDur,
      ttsEngine, ttsVoice, ttsRate, ttsPitch, aiEdited
    })
  }
  async function applyProject(data) {
    const project = normalizeProject(data)
    const built = []
    for (const c of project.clips) {
      let m = null
      try {
        m = await window.taoclip.probe(c.path)
      } catch (e) { /* Keep missing assets in their original timeline position. */ }
      if (c.kind === 'image') {
        built.push({ id: c.id, kind: 'image', path: c.path, name: c.name, missing: !m, src: { duration: c.out, width: m?.width || 0, height: m?.height || 0, hasAudio: false, isImage: true }, in: 0, out: c.out, speed: 1, kenBurns: c.kenBurns !== false, thumbs: m ? [c.path] : [] })
      } else {
        built.push({ id: c.id, path: c.path, name: c.name, missing: !m, src: m || { duration: c.out, width: 0, height: 0, hasAudio: false }, in: c.in, out: c.out, speed: c.speed, thumbs: [] })
      }
    }
    projectIdRef.current = project.projectId
    setHist([]); setFuture([])
    setClips(built); setSelId(built[0]?.id || null); setActiveIdx(0); setCurrent(0)
    setRatio(project.ratio); setFilterKey(project.filterKey); setMode(project.mode)
    let loadedCaptions = project.captions
    let loadedTimebase = project.captionTimebase
    if (loadedTimebase === 'source-legacy' && built.length === 1) {
      const plan = buildTimelinePlan(built)
      loadedCaptions = loadedCaptions.flatMap((caption) => {
        const ranges = mapSourceRange(plan, built[0].id, caption.start, caption.end)
        return ranges.length
          ? ranges.map((range) => ({ ...caption, ...range, unmapped: false }))
          : [{ ...caption, unmapped: true }]
      })
      loadedTimebase = 'timeline'
    }
    setCaptions(loadedCaptions); setCaptionTimebase(loadedTimebase); setBurnCaptions(project.burnCaptions)
    setOverlays(project.overlays); setSelOv(null); setTransition(project.transition)
    // v2: music/voice rieng; v1 (cu): bgAudio 1 track kind music|tts
    const m = project.music, vo = project.voice
    setMusic(m); setVoice(vo); setMusicVol(project.musicVol); setVoiceVol(project.voiceVol); setDucking(project.ducking)
    setBgDur(project.bgDur); setVoiceDur(project.voiceDur); setVoiceOffset(project.voiceOffset)
    setOrigVolume(project.origVolume); setBgLoop(project.bgLoop)
    setSyncMode(project.syncMode); setSlideDur(project.slideDur)
    setTtsEngine(project.ttsEngine); setTtsVoice(project.ttsVoice); setTtsRate(project.ttsRate); setTtsPitch(project.ttsPitch)
    setAiEdited(project.aiEdited)
    setKeepSegments(null); setAutoCut(false); setAutoInfo(null)
    built.filter((c) => !isImg(c)).forEach((c) => {
      window.taoclip.thumbnails(c.path, 8).then((th) => setClips((cs) => cs.map((x) => x.id === c.id ? { ...x, thumbs: th } : x))).catch(() => {})
      loadWave(c.id, c.path, c.src.hasAudio)
    })
    setMusicWave(null); setVoiceWave(null)
    if (m) window.taoclip.waveform?.(m.path).then((w) => setMusicWave(w || null)).catch(() => {})
    if (vo) window.taoclip.waveform?.(vo.path).then((w) => setVoiceWave(w || null)).catch(() => {})
  }
  async function openProject() {
    try { const data = await window.taoclip.openProject(); if (data) await applyProject(data) }
    catch (e) { setStatus(t('st_err', { e })) }
  }
  async function saveProject() {
    if (!clips.length) return
    try {
      const p = await window.taoclip.saveProject(buildProject())
      if (p) { setStatus('💾 ' + p); notify('💾 ' + p.split(/[\\/]/).pop(), 'ok', { label: t('open_folder'), run: () => window.taoclip.showInFolder(p) }) }
    } catch (e) { setStatus(t('st_err', { e })); notify(t('st_err', { e }), 'err') }
  }

  async function relinkMissingClip(id) {
    const clip = clips.find((item) => item.id === id)
    if (!clip?.missing) return
    try {
      const path = await window.taoclip.relinkMedia(isImg(clip) ? 'image' : 'video')
      if (!path) return
      const metadata = await window.taoclip.probe(path)
      pushHistory()
      setClips((items) => items.map((item) => item.id === id ? {
        ...item, path, name: path.split(/[\\/]/).pop(), missing: false,
        src: isImg(item) ? { ...item.src, width: metadata.width || 0, height: metadata.height || 0 } : metadata,
        thumbs: isImg(item) ? [path] : []
      } : item))
      if (!isImg(clip)) {
        window.taoclip.thumbnails(path, 8).then((thumbs) => setClips((items) => items.map((item) => item.id === id ? { ...item, thumbs } : item))).catch(() => {})
        loadWave(id, path, metadata.hasAudio)
      }
      notify(t('media_relinked'))
    } catch (e) { notify(t('st_err', { e }), 'err') }
  }

  // ---- Xuat ----
  async function handleExport() {
    if (!clips.length) return
    if (clips.some((clip) => clip.missing)) { notify(t('media_missing'), 'err'); return }
    const out = await window.taoclip.saveVideo('taoclip-export.mp4'); if (!out) return
    setExporting(true); setProgress(0); setExpStage('core')
    const ratios = [ratio, ...extraRatios.filter((r) => r !== ratio)]
    let segments
    if (single && autoCut && keepSegments) {
      const c = clips[0]
      segments = keepSegments.map((s) => ({ start: Math.max(s.start, c.in), end: Math.min(s.end, c.out) })).filter((s) => s.end - s.start > 0.05)
    }
    const clipPayload = clips.map((c) => ({ input: c.path, kind: c.kind || 'video', in: c.in, out: c.out, speed: c.speed, kenBurns: c.kenBurns, hasAudio: !!c.src?.hasAudio }))
    try {
      for (let i = 0; i < ratios.length; i++) {
        const r = ratios[i]
        const jobId = makeEntityId('export')
        activeExportJobRef.current = jobId
        const suffix = `_${r.replace(':', 'x')}`
        const o = ratios.length === 1 ? out : (/\.mp4$/i.test(out) ? out.replace(/\.mp4$/i, suffix + '.mp4') : out + suffix + '.mp4')
        setStatus(t('st_exporting', { r, i: i + 1, n: ratios.length }))
        const res = await window.taoclip.exportVideo({
          jobId, clips: clipPayload, output: o, ratio: r, mode, colorFilter: filter.ff, segments,
          captions, burnCaptions: burnCaptions && captions.length > 0,
          overlays: overlays.map((o) => ({ text: o.text, start: o.start, end: o.end, x: o.x, y: o.y, size: o.size, color: o.type === 'text' ? o.color : null })),
          music: music ? { path: music.path, volume: musicVol, loop: bgLoop } : undefined,
          voice: voice ? { path: voice.path, volume: voiceVol, offset: voiceOffset } : undefined,
          origVolume, ducking,
          captionTimebase,
          useGpu, transition: clips.length > 1 && transition !== 'none'
            ? { type: transition === 'cross' ? 'crossfade' : 'fade', dur: 0.5 } : undefined
        })
        if (res && res.cancelled) { setStatus(t('export_cancelled')); notify(t('export_cancelled')); return }
        if (i === ratios.length - 1) {
          setStatus(t('st_export_done', { m: res.method, n: ratios.length }))
          notify(t('st_export_done', { m: res.method, n: ratios.length }), 'ok', { label: t('open_folder'), run: () => window.taoclip.showInFolder(o) })
        }
      }
      setProgress(100)
      setShowExport(false)
    } catch (e) { setStatus(t('st_export_err', { e })); notify(t('st_export_err', { e }), 'err') } finally { activeExportJobRef.current = null; setExporting(false) }
  }
  function toggleExtra(r) { setExtraRatios((arr) => arr.includes(r) ? arr.filter((x) => x !== r) : [...arr, r]) }

  const tlWidth = Math.max(totalDuration * pps, 400)
  const ticks = []
  if (totalDuration) { const step = pps < 50 ? 5 : pps < 120 ? 2 : 1; for (let s = 0; s <= totalDuration; s += step) ticks.push(s) }
  const hasClips = clips.length > 0

  return (
    <div className={`cc ${dragOver ? 'dragging' : ''}`} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <header className="cc-top">
        <div className="cc-logo">Tao<span>Clip</span></div>
        <div className="cc-proj">{t('proj_untitled')} <span className="free">Free</span></div>
        <div className="cc-top-right">
          <button className="cc-ghost ic-btn" onClick={openProject} title={t('proj_open')}><FolderOpen size={16} /></button>
          <button className="cc-ghost ic-btn" onClick={saveProject} disabled={!hasClips} title={t('proj_save')}><Save size={16} /></button>
          <button className="cc-ghost ic-btn" onClick={undo} disabled={!hist.length} title={t('undo')}><Undo2 size={16} /></button>
          <button className="cc-ghost ic-btn" onClick={redo} disabled={!future.length} title={t('redo')}><Redo2 size={16} /></button>
          <select className="cc-lang" value={lang} onChange={(e) => setLang(e.target.value)} title="Language">
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
          <button className="cc-export" onClick={() => setShowExport(true)} disabled={!hasClips || exporting}>
            {exporting ? t('exporting_pct', { p: progress }) : <><Upload size={15} /> {t('export')}</>}
          </button>
        </div>
      </header>

      {recover && !clips.length && (
        <div className="cc-recover">
          <span>↩ {t('recover_msg')}</span>
          <button className="cc-export" onClick={() => { applyProject(recover); setRecover(null) }}>{t('recover_yes')}</button>
          <button className="cc-ghost" onClick={() => setRecover(null)}>{t('recover_no')}</button>
        </div>
      )}

      <div className="cc-mid">
        <nav className="cc-rail">
          {TABS.map((tb) => (
            <button key={tb.k} className={tab === tb.k ? 'on' : ''} onClick={() => setTab(tb.k)} title={t('tab_' + tb.k)}>
              <span className="ic"><tb.Icon size={19} /></span><span className="lb">{t('tab_' + tb.k)}</span>
            </button>
          ))}
        </nav>

        <section className="cc-lib" style={{ width: libW }}>
          {tab === 'media' ? (
            <MediaTab clips={clips} selId={selId} setSelId={setSelId} layout={layout} seekGlobal={seekGlobal}
              onImport={handleImport} onImportImages={handleImportImages}
              dlBusy={dlBusy} dlStatus={dlStatus} downloadFromUrl={downloadFromUrl} />
          ) : tab === 'text' ? (
            <TextTab hasClips={hasClips} anyAudio={anyAudio}
              captions={captions} setCaptions={setCaptions} capBusy={capBusy} capStatus={capStatus}
              capLang={capLang} setCapLang={setCapLang} burnCaptions={burnCaptions} setBurnCaptions={changeBurnCaptions}
              activeCaption={activeCaption} genCaptions={genCaptions} editCaption={editCaption} delCaption={delCaption}
              overlays={overlays} selOv={selOv} setSelOv={setSelOv} addText={addText}
              updateOverlay={updateOverlay} delOverlay={delOverlay} seekGlobal={seekGlobal} current={current} beginEdit={pushHistory} />
          ) : tab === 'audio' ? (
            <AudioTab hasClips={hasClips} anyAudio={anyAudio} imageCount={imageCount}
              syncMode={syncMode} setSyncMode={setSyncMode} bgDur={bgDur} setSlideDur={setSlideDur} setAllSlideDur={setAllSlideDur}
              music={music} setMusic={(m) => { pushHistory(); setMusic(m); if (!m) setBgDur(0) }}
              voice={voice} setVoice={(v) => { pushHistory(); setVoice(v); if (!v) { setVoiceDur(0); setVoiceOffset(0) } }}
              musicVol={musicVol} setMusicVol={setMusicVol} voiceVol={voiceVol} setVoiceVol={setVoiceVol}
              origVolume={origVolume} setOrigVolume={setOrigVolume} bgLoop={bgLoop} setBgLoop={setBgLoop}
              ducking={ducking} setDucking={setDucking} importMusic={importMusic}
              ttsText={ttsText} setTtsText={setTtsText} ttsBusy={ttsBusy} ttsStatus={ttsStatus}
              ttsEngine={ttsEngine} setTtsEngine={(v) => { if (v !== ttsEngine) { pushHistory(); setTtsEngine(v) } }} ttsVoice={ttsVoice} setTtsVoice={(v) => { if (v !== ttsVoice) { pushHistory(); setTtsVoice(v) } }}
              ttsVoices={ttsVoices} ttsRate={ttsRate} setTtsRate={(v) => { if (v !== ttsRate) setTtsRate(v) }} ttsPitch={ttsPitch} setTtsPitch={(v) => { if (v !== ttsPitch) setTtsPitch(v) }}
              apiKeyInput={apiKeyInput} setApiKeyInput={setApiKeyInput} hasKey={hasKey} voicesLoading={voicesLoading}
              saveApiKey={saveApiKey} loadVoices={loadVoices} previewVoice={previewVoice} genTTS={genTTS} ttsPreviewRef={ttsPreviewRef}
              redubBusy={redubBusy} redubStatus={redubStatus} redubVideo={redubVideo} beginEdit={pushHistory} />
          ) : tab === 'filter' ? (
            <FilterTab filterKey={filterKey} setFilterKey={changeFilter} />
          ) : tab === 'effect' ? (
            <EffectTab hasClips={hasClips} selectedClip={selectedClip} selIsImage={isImg(selectedClip)}
              aiBusy={aiBusy} aiStatus={aiStatus} applyReplaceBg={applyReplaceBg} pickBgImage={pickBgImage}
              faceBusy={faceBusy} faceStatus={faceStatus} applyFaceSwap={applyFaceSwap} pickFaceImage={pickFaceImage} />
          ) : tab === 'sticker' ? (
            <StickerTab hasClips={hasClips} overlays={overlays} selOv={selOv} setSelOv={setSelOv}
              addEmoji={addEmoji} updateOverlay={updateOverlay} delOverlay={delOverlay} seekGlobal={seekGlobal} current={current} beginEdit={pushHistory} />
          ) : tab === 'trans' ? (
            <TransTab clipCount={clips.length} transition={transition} setTransition={changeTransition} />
          ) : (
            (() => { const Ic = TABS.find((tb) => tb.k === tab).Icon; return <div className="cc-soon"><div className="big"><Ic size={42} /></div>{t('tab_' + tab)}<small>{t('coming_soon')}</small></div> })()
          )}
        </section>
        <div className="rsz v" onMouseDown={(e) => startPanelResize('lib', e)} />

        <section className="cc-player">
          <div className="cc-screen">
            {activeClip ? (
              <div ref={frameRef} className={`cc-frame ${ratio === 'original' ? 'orig' : 'fit'}`} style={ratio !== 'original' ? { aspectRatio: ratio.replace(':', '/') } : undefined}>
                {activeClip.missing
                  ? <div className="cc-missing">{t('media_missing')}<small>{activeClip.path}</small><button className="cc-import" onClick={() => relinkMissingClip(activeClip.id)}>{t('media_relink')}</button></div>
                  : videoSrc
                  ? <video ref={videoRef} src={videoSrc} preload="auto" onLoadedMetadata={onLoadedMeta} onTimeUpdate={onTimeUpdate} onClick={togglePlay} style={{ filter: filter.css }} />
                  : <img className={`cc-slide ${activeClip.kenBurns !== false ? 'kb' : ''}`} src={imageSrc} alt="" draggable={false} onClick={togglePlay} style={{ filter: filter.css }} />}
                {safeZone && ratio !== 'original' && (<div className="safe"><div className="sz top" /><div className="sz bottom" /><div className="sz right" /><span className="sz-tip">{t('safezone_tip')}</span></div>)}
                {activeCaption && <div className="cc-caption"><span>{activeCaption.text}</span></div>}
                {activeOverlays.map((o) => (
                  <div key={o.id} className={`cc-ov ${o.type} ${selOv === o.id ? 'sel' : ''}`}
                    style={{ left: o.x * 100 + '%', top: o.y * 100 + '%', fontSize: Math.max(8, o.size * frameH) + 'px', color: o.type === 'text' ? o.color : undefined }}
                    onMouseDown={(e) => startOverlayDrag(o, e)}>{o.text}</div>
                ))}
              </div>
            ) : (
              <div className="cc-empty">
                <div className="ico"><Film size={50} /></div>
                <h3>{t('drop_title')}</h3><p>{t('drop_sub')}</p>
                <div className="empty-actions">
                  <button className="cc-import" onClick={handleImport}><Upload size={14} /> {t('import_video')}</button>
                  <button className="cc-import alt" onClick={handleImportImages}><Image size={14} /> {t('empty_slideshow')}</button>
                  <button className="cc-import alt" onClick={openProject}><FolderUp size={14} /> {t('proj_open')}</button>
                </div>
              </div>
            )}
            {music && <audio ref={musicRef} src={fileUrl(music.path)} loop={bgLoop} preload="auto" />}
            {voice && <audio ref={voiceRef} src={fileUrl(voice.path)} preload="auto" />}
          </div>
          <div className="cc-pctrl">
            <span className="t">{fmt(current)}</span>
            <div className="btns">
              <button onClick={() => seekGlobal(0)} title={t('ctl_start')}><SkipBack size={16} /></button>
              <button onClick={() => seekGlobal(current - FRAME)} title={t('ctl_prev')}><ChevronLeft size={18} /></button>
              <button className="play" onClick={togglePlay} title={t('ctl_play')}>{playing ? <Pause size={17} /> : <Play size={17} />}</button>
              <button onClick={() => seekGlobal(current + FRAME)} title={t('ctl_next')}><ChevronRight size={18} /></button>
              <button onClick={() => seekGlobal(totalDuration)} title={t('ctl_end')}><SkipForward size={16} /></button>
              <button className={loop ? 'on' : ''} onClick={() => setLoop((l) => !l)} title={t('ctl_loop')}><Repeat size={15} /></button>
            </div>
            <div className="vol">
              <button onClick={() => setMuted((m) => !m)} title={t('ctl_mute')}>{muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
              <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false) }} />
            </div>
            <span className="t">{fmt(totalDuration)}</span>
          </div>
        </section>

        <div className="rsz v" onMouseDown={(e) => startPanelResize('insp', e)} />
        <Inspector width={inspW} hasClips={hasClips} single={single}
          ratio={ratio} setRatio={changeRatio} safeZone={safeZone} setSafeZone={setSafeZone}
          selectedClip={selectedClip} moveClip={moveClip} deleteClip={deleteClip} updateClip={updateClip}
          pushHistory={pushHistory} setAllSlideDur={setAllSlideDur}
          onDetectSilence={detectSilence} busy={busy} canDetectSilence={!!clips[0]?.src?.hasAudio}
          autoInfo={autoInfo} autoCut={autoCut} setAutoCut={(value) => { if (value !== autoCut) { pushHistory(); setAutoCut(value) } }} status={status} />
      </div>

      <div className="cc-tl" style={{ height: tlH }}>
        <div className="rsz h" onMouseDown={(e) => startPanelResize('tl', e)} />
        <div className="cc-tlbar">
          <button className="tb-ic" onClick={splitAtPlayhead} disabled={!hasClips} title={t('tb_split_tip')}><Scissors size={14} /> {t('tb_split')}</button>
          <button onClick={undo} disabled={!hist.length} title={t('undo')}><Undo2 size={14} /></button>
          <button onClick={redo} disabled={!future.length} title={t('redo')}><Redo2 size={14} /></button>
          <button onClick={() => setShowKeys(true)} title={t('keys_btn')}><Keyboard size={14} /></button>
          <div className="sp" />
          <span className="cur">{fmt(current)} / {fmt(totalDuration)}</span>
          <div className="zoom">
            <button onClick={() => setPps((p) => Math.max(20, p - 20))} title={t('zoom_out')}><Minus size={14} /></button>
            <button onClick={fitZoom} title={t('fit')}>{t('fit')}</button>
            <button onClick={() => setPps((p) => Math.min(300, p + 20))} title={t('zoom_in')}><Plus size={14} /></button>
          </div>
        </div>

        <div className="cc-tlscroll" ref={scrollRef} onClick={timelineClick}>
          <div className="cc-tlinner" style={{ width: tlWidth }}>
            <div className="cc-ruler" onMouseDown={startScrub}>{ticks.map((s) => <span key={s} className="tick" style={{ left: s * pps }}>{fmt(s).slice(3, 5)}s</span>)}</div>
            <div className="cc-track">
              {layout.map((seg) => (
                <div key={seg.id} className={`cc-clip ${selId === seg.id ? 'sel' : ''}`} style={{ left: seg.start * pps, width: (seg.end - seg.start) * pps }} onClick={(e) => { e.stopPropagation(); setSelId(seg.id); setSelOv(null); seekGlobal(clientXToTime(e.clientX)) }}>
                  <div className="h l" onMouseDown={(e) => startTrim(seg.clip, 'l', e)} />
                  <div className="strip" onMouseDown={(e) => startReorder(seg, e)} title={seg.clip.name}>{seg.clip.thumbs?.length ? seg.clip.thumbs.map((th, i) => <img key={i} src={fileUrl(th)} alt="" draggable={false} />) : <span className="cn">🎬 {seg.clip.name}</span>}</div>
                  <div className="h r" onMouseDown={(e) => startTrim(seg.clip, 'r', e)} />
                </div>
              ))}
            </div>
            {anyAudio && (
              <div className="cc-track audio">
                {layout.map((seg) => seg.clip.src?.hasAudio && (
                  <div key={seg.id} className="cc-aclip" style={{ left: seg.start * pps, width: (seg.end - seg.start) * pps }}>
                    {seg.clip.wave
                      ? <div className="wimg" style={{ backgroundImage: `url(${fileUrl(seg.clip.wave)})`, backgroundSize: `${seg.clip.src.duration * pps / (seg.clip.speed || 1)}px 100%`, backgroundPosition: `${-(seg.clip.in * pps / (seg.clip.speed || 1))}px 0` }} />
                      : <div className="wave" />}
                    <span>{seg.clip.name}</span>
                  </div>
                ))}
              </div>
            )}
            {music && (
              <div className="cc-track music">
                <div className="cc-mclip" style={{ width: Math.max((bgLoop ? (totalDuration || 0) : Math.min(bgDur || totalDuration || 0, totalDuration || 0)) * pps, 120) }} onClick={(e) => { e.stopPropagation(); setTab('audio') }} title={music.name}>
                  {musicWave
                    ? <div className="wimg rep" style={{ backgroundImage: `url(${fileUrl(musicWave)})`, backgroundSize: `${Math.max(20, (bgDur || 10) * pps)}px 100%` }} />
                    : <div className="wave" />}<Music size={13} /><span>{music.name}</span>
                  <button className="mclip-x" onClick={(e) => { e.stopPropagation(); pushHistory(); setMusic(null); setBgDur(0) }} title={t('bg_remove')}><X size={12} /></button>
                </div>
              </div>
            )}
            {voice && (
              <div className="cc-track music">
                <div className="cc-vclip" style={{ left: voiceOffset * pps, width: Math.max((voiceDur || 2) * pps, 70) }}
                  onMouseDown={startVoiceDrag} onClick={(e) => e.stopPropagation()} title={voice.name + ' — ' + fmt(voiceOffset)}>
                  {voiceWave
                    ? <div className="wimg" style={{ backgroundImage: `url(${fileUrl(voiceWave)})`, backgroundSize: `${Math.max(20, (voiceDur || 2) * pps)}px 100%` }} />
                    : <div className="wave" />}<Mic size={13} /><span>{voice.name}</span>
                  <button className="mclip-x" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); pushHistory(); setVoice(null); setVoiceDur(0); setVoiceOffset(0) }} title={t('bg_remove')}><X size={12} /></button>
                </div>
              </div>
            )}
            {overlays.length > 0 && (
              <div className="cc-track ovl">
                {overlays.map((o) => (
                  <div key={o.id} className={`cc-oclip ${selOv === o.id ? 'sel' : ''}`}
                    style={{ left: o.start * pps, width: Math.max((o.end - o.start) * pps, 18) }}
                    onMouseDown={(e) => startOvMove(o, e)} onClick={(e) => e.stopPropagation()} title={o.text}>
                    <div className="oh l" onMouseDown={(e) => startOvResize(o, 'l', e)} />
                    <span>{o.type === 'emoji' ? o.text : o.text}</span>
                    <div className="oh r" onMouseDown={(e) => startOvResize(o, 'r', e)} />
                  </div>
                ))}
              </div>
            )}
            {dragInsert != null && <div className="cc-drop-ind" style={{ left: (dragInsert < layout.length ? layout[dragInsert].start : totalDuration) * pps }} />}
            {hasClips && <div className="cc-playhead" style={{ left: current * pps }}><div className="head" onMouseDown={startScrub} /></div>}
          </div>
        </div>
      </div>

      {dragOver && <div className="cc-drop"><div>{t('drop_overlay')}</div></div>}

      <div className="cc-toasts">
        {toasts.map((n) => (
          <div key={n.id} className={`cc-toast ${n.type}`}>
            <span>{n.msg}</span>
            {n.action && <button className="act" onClick={() => { n.action.run(); closeToast(n.id) }}>{n.action.label}</button>}
            <button className="cap-del" onClick={() => closeToast(n.id)}><X size={12} /></button>
          </div>
        ))}
      </div>

      {showExport && (
        <ExportDialog
          ratio={ratio} extraRatios={extraRatios} toggleExtra={toggleExtra}
          mode={mode} setMode={changeMode} gpuEnc={gpuEnc} useGpu={useGpu} setUseGpu={setUseGpu}
          captionsCount={captions.length} burnCaptions={burnCaptions} setBurnCaptions={changeBurnCaptions}
          clipCount={clips.length} totalDuration={totalDuration}
          hasBurnStage={(burnCaptions && captions.length > 0) || overlays.length > 0}
          hasAudioStage={!!(music || voice)}
          exporting={exporting} progress={progress} stage={expStage} status={status}
          onStart={handleExport} onCancel={() => activeExportJobRef.current && window.taoclip.cancelExport?.(activeExportJobRef.current)}
          onClose={() => setShowExport(false)} />
      )}

      {showKeys && (
        <div className="cc-modal" onClick={() => setShowKeys(false)}>
          <div className="cc-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="cc-modal-head"><b>{t('keys_title')}</b><button className="cap-del" onClick={() => setShowKeys(false)}><X size={15} /></button></div>
            <div className="keys-grid">
              <kbd>Space</kbd><span>{t('sc_play')}</span>
              <kbd>← / →</kbd><span>{t('sc_frame')}</span>
              <kbd>Home / End</kbd><span>{t('sc_home')}</span>
              <kbd>I / O</kbd><span>{t('sc_io')}</span>
              <kbd>S</kbd><span>{t('sc_split')}</span>
              <kbd>Del</kbd><span>{t('sc_del')}</span>
              <kbd>+ / −</kbd><span>{t('sc_zoom')}</span>
              <kbd>Ctrl+Z / Y</kbd><span>{t('sc_undo')}</span>
              <kbd>Ctrl+🖱</kbd><span>{t('sc_wheel')}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

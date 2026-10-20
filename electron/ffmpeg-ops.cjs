// ============================================================
//  FFmpeg operations - tach rieng de TEST doc lap (khong can Electron)
//  probe, keyframe, thumbnail, toc do, smart-cut, auto-cut khoang lang,
//  da ti le khung (9:16 / 1:1 / 16:9 / 4:5 / goc)
// ============================================================
const ffmpeg = require('fluent-ffmpeg')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')
const { AsyncLocalStorage } = require('node:async_hooks')

let FFMPEG_PATH = null
let FFPROBE_PATH = null

function configure(ffmpegPath, ffprobePath) {
  FFMPEG_PATH = ffmpegPath
  FFPROBE_PATH = ffprobePath
  ffmpeg.setFfmpegPath(ffmpegPath)
  ffmpeg.setFfprobePath(ffprobePath)
}

// ---------- Job context: cancellation and encoder are isolated per export ----------
const JOB_SCOPE = new AsyncLocalStorage()
const JOBS = new Map()
const DEFAULT_JOB = { id: 'default', cancelled: false, kills: new Set(), encoder: 'cpu' }
function currentJob() { return JOB_SCOPE.getStore() || DEFAULT_JOB }
function beginJob(id) {
  if (!id) { DEFAULT_JOB.cancelled = false; DEFAULT_JOB.encoder = 'cpu'; return DEFAULT_JOB }
  const existing = JOBS.get(id)
  if (existing) return existing
  const job = { id, cancelled: false, kills: new Set(), encoder: 'cpu' }
  JOBS.set(id, job)
  return job
}
function runJob(job, task) { return JOB_SCOPE.run(job, task) }
function endJob(id) { if (id) JOBS.delete(id) }
function isCancelled() { return currentJob().cancelled }
function cancelJob(id) {
  const job = id ? JOBS.get(id) : currentJob()
  if (!job) return false
  job.cancelled = true
  for (const kill of [...job.kills]) { try { kill() } catch {} }
  return true
}
function guardCancel() { if (isCancelled()) { const e = new Error('CANCELLED'); e.cancelled = true; throw e } }
// Theo doi child_process (spawn)
function track(ps) {
  const job = currentJob()
  const kill = () => { try { ps.kill('SIGKILL') } catch {} }
  job.kills.add(kill)
  ps.on('close', () => job.kills.delete(kill))
  ps.on('error', () => job.kills.delete(kill))
  if (job.cancelled) kill()
  return ps
}
// Theo doi lenh fluent-ffmpeg
function trackCmd(cmd) {
  const job = currentJob()
  const kill = () => { try { cmd.kill('SIGKILL') } catch {} }
  job.kills.add(kill)
  cmd.on('end', () => job.kills.delete(kill)).on('error', () => job.kills.delete(kill))
  if (job.cancelled) setTimeout(kill, 50) // fluent chi spawn sau .save()
  return cmd
}

// ---------- Encoder video: CPU (libx264) hoac GPU (NVENC/QuickSync/AMF) ----------
const VENC_ARGS = {
  cpu: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p'],
  nvenc: ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '23', '-pix_fmt', 'yuv420p'],
  qsv: ['-c:v', 'h264_qsv', '-global_quality', '23', '-pix_fmt', 'yuv420p'],
  amf: ['-c:v', 'h264_amf', '-rc', 'cqp', '-qp_i', '23', '-qp_p', '23', '-quality', 'balanced', '-pix_fmt', 'yuv420p']
}
function setEncoder(name) { currentJob().encoder = VENC_ARGS[name] ? name : 'cpu' }
function vencArgs() { return VENC_ARGS[currentJob().encoder] || VENC_ARGS.cpu }
function getEncoder() { return currentJob().encoder }

// Thu encoder co chay duoc tren may nay khong (encode 1 khung test)
function testEncoder(name) {
  return new Promise((resolve) => {
    const args = ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=256x256:d=0.2', ...VENC_ARGS[name], '-f', 'null', '-']
    const ps = spawn(FFMPEG_PATH, args)
    ps.on('error', () => resolve(false))
    ps.on('close', (c) => resolve(c === 0))
  })
}
async function detectBestEncoder() {
  for (const name of ['nvenc', 'qsv', 'amf']) {
    try { if (await testEncoder(name)) return name } catch {}
  }
  return 'cpu'
}

// ---------- Ti le khung -> kich thuoc ----------
function ratioDims(ratio) {
  switch (ratio) {
    case '9:16': return [1080, 1920]
    case '1:1': return [1080, 1080]
    case '16:9': return [1920, 1080]
    case '4:5': return [1080, 1350]
    default: return null // 'original'
  }
}

// ---------- Probe ----------
function probe(input) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(input, (err, data) => {
      if (err) return reject(new Error(err.message))
      const v = data.streams.find((s) => s.codec_type === 'video') || {}
      const a = data.streams.find((s) => s.codec_type === 'audio')
      // Mot so container thieu format.duration -> lay tu stream
      const dur = Number(data.format.duration) || Number(v.duration) || (a && Number(a.duration)) || 0
      resolve({
        duration: dur,
        width: v.width || 0, height: v.height || 0,
        vcodec: v.codec_name || '', acodec: a ? a.codec_name : '',
        hasAudio: !!a, size: data.format.size ? Number(data.format.size) : 0
      })
    })
  })
}

// ---------- Keyframes (nhanh, khong giai ma) ----------
function getKeyframes(input) {
  return new Promise((resolve, reject) => {
    const args = ['-v', 'error', '-select_streams', 'v:0', '-show_packets',
      '-show_entries', 'packet=pts_time,flags', '-of', 'csv=p=0', input]
    const ps = spawn(FFPROBE_PATH, args)
    let out = '', errOut = ''
    ps.stdout.on('data', (d) => (out += d))
    ps.stderr.on('data', (d) => (errOut += d))
    ps.on('error', reject)
    ps.on('close', (code) => {
      if (code !== 0) return reject(new Error('ffprobe keyframes loi: ' + errOut))
      const kfs = out.trim().split('\n').map((line) => {
        const [pts, flags] = line.split(',')
        return { t: Number(pts), key: (flags || '').includes('K') }
      }).filter((p) => p.key && !Number.isNaN(p.t)).map((p) => p.t).sort((x, y) => x - y)
      resolve(kfs)
    })
  })
}

// ---------- Thumbnails (filmstrip) ----------
function extractFrame(input, t, out) {
  return new Promise((resolve, reject) => {
    ffmpeg(input).inputOptions(['-ss', String(t)])
      .outputOptions(['-frames:v', '1', '-vf', 'scale=160:-1', '-q:v', '5'])
      .on('end', () => resolve(out)).on('error', (e) => reject(new Error(e.message))).save(out)
  })
}
async function generateThumbnails(input, count = 12) {
  const info = await probe(input)
  const dur = info.duration || 1
  const hash = crypto.createHash('md5').update(input + info.size + 'x' + count).digest('hex').slice(0, 12)
  const dir = path.join(os.tmpdir(), 'taoclip-thumbs', hash)
  fs.mkdirSync(dir, { recursive: true })
  const paths = [], tasks = []
  for (let i = 0; i < count; i++) {
    const t = (dur * (i + 0.5)) / count
    const out = path.join(dir, `t${i}.jpg`)
    paths.push(out)
    if (!fs.existsSync(out)) tasks.push(extractFrame(input, t, out))
  }
  await Promise.all(tasks)
  return paths.filter((p) => fs.existsSync(p))
}

// ---------- Waveform PNG (hien tren timeline) ----------
// Ve dang song cua TOAN BO file (cache theo hash); UI tu crop theo in/out bang CSS
async function generateWaveform(input, width = 1200, height = 72) {
  const info = await probe(input)
  if (!info.hasAudio) return null
  const hash = crypto.createHash('md5').update('wave' + input + info.size).digest('hex').slice(0, 12)
  const dir = path.join(os.tmpdir(), 'taoclip-waves')
  fs.mkdirSync(dir, { recursive: true })
  const out = path.join(dir, hash + '.png')
  if (fs.existsSync(out)) return out
  await new Promise((resolve, reject) => {
    const args = ['-y', '-i', path.resolve(input), '-filter_complex',
      `aformat=channel_layouts=mono,showwavespic=s=${width}x${height}:colors=0xffffff`, '-frames:v', '1', out]
    const ps = spawn(FFMPEG_PATH, args)
    let err = ''
    ps.stderr.on('data', (d) => (err += d))
    ps.on('error', reject)
    ps.on('close', (c) => c === 0 ? resolve() : reject(new Error('waveform loi: ' + err.slice(-300))))
  })
  return out
}

// ---------- Trich audio ra WAV 16kHz mono (cho Whisper) ----------
function extractAudioWav(input, out) {
  return new Promise((resolve, reject) => {
    ffmpeg(input).noVideo().audioFrequency(16000).audioChannels(1).audioCodec('pcm_s16le').format('wav')
      .on('end', () => resolve(out)).on('error', (e) => reject(new Error(e.message))).save(out)
  })
}

// ---------- Trich audio 1 clip (trim+toc do) hoac im lang -> WAV 16k mono ----------
function clipAudioWav({ input, inPoint, outPoint, speed = 1, hasAudio, outDur, output }) {
  return new Promise((resolve, reject) => {
    const args = ['-y']
    if (hasAudio) {
      args.push('-ss', String(inPoint), '-t', String(outPoint - inPoint), '-i', path.resolve(input))
      const af = []
      if (speed !== 1) af.push(...buildAtempoChain(speed))
      af.push('aresample=16000')
      args.push('-af', af.join(','), '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-vn')
    } else {
      args.push('-f', 'lavfi', '-t', String(outDur), '-i', 'anullsrc=channel_layout=mono:sample_rate=16000', '-c:a', 'pcm_s16le')
    }
    args.push(path.resolve(output))
    const ps = spawn(FFMPEG_PATH, args)
    let err = ''
    ps.stderr.on('data', (d) => (err += d))
    ps.on('error', reject)
    ps.on('close', (c) => c === 0 ? resolve(output) : reject(new Error('clip audio loi: ' + err.slice(-300))))
  })
}

// ---------- Ghep audio toan timeline -> 1 WAV (de tao phu de da clip) ----------
async function buildTimelineAudioWav(clips, output) {
  const infos = await Promise.all(clips.map((c) => probe(c.input)))
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taoclip-tla-'))
  try {
    const parts = []
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i]
      const out = path.join(tmpDir, `a${i}.wav`)
      await clipAudioWav({ input: c.input, inPoint: c.in, outPoint: c.out, speed: c.speed || 1, hasAudio: infos[i].hasAudio, outDur: (c.out - c.in) / (c.speed || 1), output: out })
      parts.push(out)
    }
    if (parts.length === 1) { fs.copyFileSync(parts[0], path.resolve(output)); return output }
    const listFile = path.join(tmpDir, 'list.txt')
    fs.writeFileSync(listFile, parts.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'), 'utf8')
    await new Promise((resolve, reject) => {
      const ps = spawn(FFMPEG_PATH, ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', path.resolve(output)])
      let err = ''; ps.stderr.on('data', (d) => (err += d))
      ps.on('error', reject); ps.on('close', (c) => c === 0 ? resolve() : reject(new Error('concat audio loi: ' + err.slice(-300))))
    })
    return output
  } finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {} }
}

// ---------- Khac phu de (ASS) vao video ----------
// assFile dat cung thu muc lam cwd -> dung ten tuong doi, tranh escape duong dan Windows
function burnSubtitles({ input, assFile, output, onProgress }) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(assFile)
    const base = path.basename(assFile)
    // cwd doi sang thu muc ASS -> input/output PHAI tuyet doi
    input = path.resolve(input)
    output = path.resolve(output)
    const args = ['-y', '-i', input, '-vf', 'ass=' + base,
      ...vencArgs(), '-c:a', 'copy', '-movflags', '+faststart', output]
    const ps = track(spawn(FFMPEG_PATH, args, { cwd: dir }))
    let err = ''
    ps.stderr.on('data', (d) => { err += d; const m = /time=(\d+):(\d+):(\d+\.\d+)/.exec(d.toString()); if (m && onProgress) onProgress((+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])) })
    ps.on('error', reject)
    ps.on('close', (code) => code === 0 ? resolve(output) : reject(new Error('burn loi: ' + err.slice(-400))))
  })
}

// ---------- Encode 1 clip (cat/toc do/loc mau) -> chuan hoa kich thuoc+fps -> TS ----------
function encodeClipTS({ input, inPoint, outPoint, speed = 1, dims, colorFilter, hasAudio, anyAudio, fadeIn = false, fadeOut = false, fadeDur = 0.4, output, onProgress }) {
  return new Promise((resolve, reject) => {
    const dur = Math.max(0.05, outPoint - inPoint)
    const outDur = dur / speed
    const fd = Math.min(fadeDur, outDur / 2)
    const args = ['-y', '-ss', String(inPoint), '-t', String(dur), '-i', path.resolve(input)]
    const needSilent = anyAudio && !hasAudio
    if (needSilent) args.push('-f', 'lavfi', '-t', String(outDur + 0.2), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100')
    const vf = []
    if (speed !== 1) vf.push(`setpts=${(1 / speed).toFixed(6)}*PTS`)
    if (colorFilter) vf.push(colorFilter)
    vf.push(`scale=${dims[0]}:${dims[1]}:force_original_aspect_ratio=decrease`)
    vf.push(`pad=${dims[0]}:${dims[1]}:(ow-iw)/2:(oh-ih)/2:black`, 'fps=30', 'setsar=1')
    if (fadeIn) vf.push(`fade=t=in:st=0:d=${fd.toFixed(3)}`)
    if (fadeOut) vf.push(`fade=t=out:st=${Math.max(0, outDur - fd).toFixed(3)}:d=${fd.toFixed(3)}`)
    args.push('-vf', vf.join(','))
    if (anyAudio && hasAudio) {
      const af = []
      if (speed !== 1) af.push(...buildAtempoChain(speed))
      if (fadeIn) af.push(`afade=t=in:st=0:d=${fd.toFixed(3)}`)
      if (fadeOut) af.push(`afade=t=out:st=${Math.max(0, outDur - fd).toFixed(3)}:d=${fd.toFixed(3)}`)
      if (af.length) args.push('-af', af.join(','))
    }
    args.push('-map', '0:v:0')
    if (anyAudio) args.push('-map', needSilent ? '1:a:0' : '0:a:0')
    args.push(...vencArgs(), '-r', '30')
    if (anyAudio) args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '44100'); else args.push('-an')
    args.push('-bsf:v', 'h264_mp4toannexb', '-f', 'mpegts')
    if (needSilent) args.push('-shortest')
    args.push(path.resolve(output))
    const ps = track(spawn(FFMPEG_PATH, args))
    let err = ''
    ps.stderr.on('data', (d) => { err += d; const m = /time=(\d+):(\d+):(\d+\.\d+)/.exec(d.toString()); if (m && onProgress) onProgress((+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])) })
    ps.on('error', reject)
    ps.on('close', (c) => c === 0 ? resolve(output) : reject(new Error('clip encode loi: ' + err.slice(-400))))
  })
}

// ---------- Ma hoa 1 ANH tinh thanh 1 doan .ts (slideshow) ----------
// dur: thoi luong hien; kenBurns: zoom/pan nhe; anyAudio: co clip nao co tieng -> them track im lang de concat
function encodeImageTS({ input, dur, dims, colorFilter, kenBurns = false, anyAudio = false,
                        fadeIn = false, fadeOut = false, fadeDur = 0.4, output, onProgress }) {
  return new Promise((resolve, reject) => {
    const [W, H] = dims
    const outDur = Math.max(0.3, dur)
    const fps = 30
    const fd = Math.min(fadeDur, outDur / 2)
    const args = ['-y', '-loop', '1', '-t', String(outDur), '-i', path.resolve(input)]
    if (anyAudio) args.push('-f', 'lavfi', '-t', String(outDur), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100')
    const vf = []
    if (colorFilter) vf.push(colorFilter)
    if (kenBurns) {
      // Phu kin khung roi zoom/pan nhe. Pre-scale lon de bot vo/nhiem.
      const frames = Math.max(1, Math.round(fps * outDur))
      vf.push(`scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase`, `crop=${W * 2}:${H * 2}`)
      vf.push(`zoompan=z='min(zoom+0.0006,1.15)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${fps}`)
    } else {
      vf.push(`scale=${W}:${H}:force_original_aspect_ratio=decrease`, `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black`)
    }
    vf.push('setsar=1', 'format=yuv420p')
    if (fadeIn) vf.push(`fade=t=in:st=0:d=${fd.toFixed(3)}`)
    if (fadeOut) vf.push(`fade=t=out:st=${Math.max(0, outDur - fd).toFixed(3)}:d=${fd.toFixed(3)}`)
    args.push('-vf', vf.join(','))
    args.push('-map', '0:v:0')
    if (anyAudio) args.push('-map', '1:a:0')
    args.push(...vencArgs(), '-r', String(fps))
    if (anyAudio) args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '44100'); else args.push('-an')
    args.push('-t', String(outDur), '-bsf:v', 'h264_mp4toannexb', '-f', 'mpegts', path.resolve(output))
    const ps = track(spawn(FFMPEG_PATH, args))
    let err = ''
    ps.stderr.on('data', (d) => { err += d; const m = /time=(\d+):(\d+):(\d+\.\d+)/.exec(d.toString()); if (m && onProgress) onProgress((+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])) })
    ps.on('error', reject)
    ps.on('close', (c) => c === 0 ? resolve(output) : reject(new Error('anh encode loi: ' + err.slice(-400))))
  })
}

// ---------- Noi cac doan bang CROSSFADE (hoa tan chong nhau) - 1 pass filtergraph ----------
// inputs: cac .ts da chuan hoa (dims/fps30/sar1); durs: thoi luong tung doan; dur: do dai hoa tan
function crossfadeChain({ inputs, durs, dur, output, hasAudio, onProgress }) {
  return new Promise((resolve, reject) => {
    const n = inputs.length
    const D = dur
    const args = ['-y']
    inputs.forEach((f) => args.push('-i', path.resolve(f)))
    const fc = []
    // Chuoi xfade video: offset = tong do dai da ghep - D
    let cur = '[0:v]', combined = durs[0]
    for (let i = 1; i < n; i++) {
      const off = Math.max(0, combined - D)
      const out = i === n - 1 ? '[vout]' : `[v${i}]`
      fc.push(`${cur}[${i}:v]xfade=transition=fade:duration=${D.toFixed(3)}:offset=${off.toFixed(3)}${out}`)
      cur = out; combined += durs[i] - D
    }
    // Chuoi acrossfade audio (neu co tieng)
    if (hasAudio) {
      let ca = '[0:a]'
      for (let i = 1; i < n; i++) {
        const out = i === n - 1 ? '[aout]' : `[a${i}]`
        fc.push(`${ca}[${i}:a]acrossfade=d=${D.toFixed(3)}${out}`)
        ca = out
      }
    }
    args.push('-filter_complex', fc.join(';'), '-map', '[vout]')
    if (hasAudio) args.push('-map', '[aout]')
    args.push(...vencArgs(), '-r', '30')
    if (hasAudio) args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '44100'); else args.push('-an')
    args.push('-movflags', '+faststart', path.resolve(output))
    const ps = track(spawn(FFMPEG_PATH, args))
    let err = ''
    ps.stderr.on('data', (d) => { err += d; const m = /time=(\d+):(\d+):(\d+\.\d+)/.exec(d.toString()); if (m && onProgress) onProgress((+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])) })
    ps.on('error', reject)
    ps.on('close', (c) => c === 0 ? resolve(output) : reject(new Error('crossfade loi: ' + err.slice(-400))))
  })
}

// ---------- Ghep nhieu clip thanh 1 video (tung clip cat/toc do/loc mau rieng) ----------
async function exportClips({ clips, output, ratio, colorFilter, transition, onProgress }) {
  const fade = transition && transition.type === 'fade'
  const xfade = transition && transition.type === 'crossfade'
  const fadeDur = (transition && transition.dur) || 0.4
  const infos = await Promise.all(clips.map((c) => probe(c.input)))
  let dims = ratioDims(ratio)
  if (!dims) dims = [infos[0].width || 1080, infos[0].height || 1920]
  dims = [dims[0] - (dims[0] % 2), dims[1] - (dims[1] % 2)]
  const anyAudio = infos.some((i) => i.hasAudio)
  const totalOut = clips.reduce((a, c) => a + (c.out - c.in) / (c.speed || 1), 0) || 1
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taoclip-clips-'))
  try {
    const parts = []
    let done = 0
    for (let i = 0; i < clips.length; i++) {
      guardCancel()
      const c = clips[i]
      const out = path.join(tmpDir, `c${i}.ts`)
      const onSeg = (sec) => onProgress && onProgress(Math.round(((done + sec) / totalOut) * 100))
      if (c.kind === 'image') {
        await encodeImageTS({
          input: c.input, dur: (c.out - c.in) || 3, dims, colorFilter, kenBurns: c.kenBurns !== false, anyAudio,
          fadeIn: fade && i > 0, fadeOut: fade && i < clips.length - 1, fadeDur, output: out, onProgress: onSeg
        })
      } else {
        await encodeClipTS({
          input: c.input, inPoint: c.in, outPoint: c.out, speed: c.speed || 1, dims, colorFilter,
          hasAudio: infos[i].hasAudio, anyAudio, output: out,
          fadeIn: fade && i > 0, fadeOut: fade && i < clips.length - 1, fadeDur, onProgress: onSeg
        })
      }
      done += (c.out - c.in) / (c.speed || 1)
      parts.push(out)
    }
    if (xfade && parts.length > 1) {
      const durs = clips.map((c) => (c.out - c.in) / (c.speed || 1))
      const D = Math.max(0.1, Math.min(fadeDur, Math.min(...durs) / 2))
      const xtot = Math.max(0.1, totalOut - D * (parts.length - 1))
      await crossfadeChain({ inputs: parts, durs, dur: D, output, hasAudio: anyAudio, onProgress: (sec) => onProgress && onProgress(Math.min(99, Math.round((sec / xtot) * 100))) })
    } else {
      await concatTS({ inputs: parts, output, hasAudio: anyAudio })
    }
    onProgress && onProgress(100)
    return { ok: true, output, method: xfade ? 'multi-clip-xfade' : 'multi-clip', clips: clips.length }
  } finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {} }
}

// ---------- Tron them 1 track am thanh (nhac nen / long tieng) vao video ----------
// hasOrigAudio: video co san tieng khong; loop: lap audio (nhac nen) hay khong (long tieng)
function mixAudio({ video, audio, output, videoVol = 1, audioVol = 1, hasOrigAudio = true, loop = false, onProgress }) {
  return new Promise((resolve, reject) => {
    video = path.resolve(video); audio = path.resolve(audio); output = path.resolve(output)
    const args = ['-y', '-i', video]
    if (loop) args.push('-stream_loop', '-1')
    args.push('-i', audio)
    const fc = hasOrigAudio
      ? `[0:a]volume=${videoVol}[a0];[1:a]volume=${audioVol}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`
      : `[1:a]volume=${audioVol},apad[a]`
    args.push('-filter_complex', fc, '-map', '0:v', '-map', '[a]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', output)
    const ps = track(spawn(FFMPEG_PATH, args))
    let err = ''
    ps.stderr.on('data', (d) => { err += d; const m = /time=(\d+):(\d+):(\d+\.\d+)/.exec(d.toString()); if (m && onProgress) onProgress((+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])) })
    ps.on('error', reject)
    ps.on('close', (code) => code === 0 ? resolve(output) : reject(new Error('mix loi: ' + err.slice(-400))))
  })
}

// ---------- Tron NHIEU track am thanh (nhac nen + long tieng CUNG LUC) ----------
// tracks: [{path, volume=1, loop=false, role:'music'|'voice', delay?:ms}]
// delay: lui diem bat dau track (vd giong doc bat dau giua video)
// ducking: tu ha nhac xuong khi giong noi vang len (sidechaincompress)
function mixAudioTracks({ video, tracks, output, videoVol = 1, hasOrigAudio = true, ducking = false, onProgress }) {
  return new Promise((resolve, reject) => {
    video = path.resolve(video); output = path.resolve(output)
    const args = ['-y', '-i', video]
    tracks.forEach((tk) => {
      if (tk.loop) args.push('-stream_loop', '-1')
      args.push('-i', path.resolve(tk.path))
    })
    // Chuan hoa format truoc amix/sidechain (nguon mp3/wav/aac lech sample-rate/kenh)
    const norm = 'aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo'
    const musicIdx = tracks.findIndex((tk) => tk.role === 'music')
    const voiceIdx = tracks.findIndex((tk) => tk.role === 'voice')
    const duck = ducking && musicIdx >= 0 && voiceIdx >= 0
    const fc = [], labels = []
    tracks.forEach((tk, i) => {
      const vol = tk.volume ?? 1
      const dly = tk.delay > 0 ? `adelay=${Math.round(tk.delay)}:all=1,` : ''
      if (duck && i === voiceIdx) {
        // apad nhanh sidechain: neu khong, sidechaincompress ket thuc khi GIONG het -> nhac bi cat cut
        fc.push(`[${i + 1}:a]volume=${vol},${dly}${norm},asplit=2[vo][vsc0]`, '[vsc0]apad[vsc]')
        labels[i] = '[vo]'
      } else {
        fc.push(`[${i + 1}:a]volume=${vol},${dly}${norm}[t${i}]`)
        labels[i] = `[t${i}]`
      }
    })
    if (duck) {
      fc.push(`${labels[musicIdx]}[vsc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[md]`)
      labels[musicIdx] = '[md]'
    }
    const mixIns = []
    if (hasOrigAudio) { fc.push(`[0:a]volume=${videoVol},${norm}[a0]`); mixIns.push('[a0]') }
    mixIns.push(...labels)
    if (mixIns.length === 1) fc.push(`${mixIns[0]}apad[a]`)
    else fc.push(`${mixIns.join('')}amix=inputs=${mixIns.length}:duration=${hasOrigAudio ? 'first' : 'longest'}:dropout_transition=0:normalize=0[a]`)
    args.push('-filter_complex', fc.join(';'), '-map', '0:v', '-map', '[a]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', output)
    const ps = track(spawn(FFMPEG_PATH, args))
    let err = ''
    ps.stderr.on('data', (d) => { err += d; const m = /time=(\d+):(\d+):(\d+\.\d+)/.exec(d.toString()); if (m && onProgress) onProgress((+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])) })
    ps.on('error', reject)
    ps.on('close', (code) => code === 0 ? resolve(output) : reject(new Error('mix loi: ' + err.slice(-400))))
  })
}

// ---------- Ghep cac doan TTS thanh 1 track long tieng theo timeline (doi giong / re-dub) ----------
// parts: [{path, start, slot}] - start: giay tren timeline OUTPUT; slot: cho toi da (den cau ke tiep)
// Doan TTS dai hon slot -> tang toc (atempo, giu cao do) cho vua; ngan hon -> giu nguyen, phan du im lang
async function buildRedubTrack({ parts, totalDur, output }) {
  if (!parts || !parts.length) throw new Error('Khong co doan nao de ghep')
  const durs = await Promise.all(parts.map((pt) => probe(pt.path).then((i) => i.duration || 0)))
  return new Promise((resolve, reject) => {
    const args = ['-y']
    parts.forEach((pt) => args.push('-i', path.resolve(pt.path)))
    const norm = 'aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo'
    const fc = [], labels = []
    parts.forEach((pt, i) => {
      const f = []
      const slot = Math.max(0.2, pt.slot || totalDur - pt.start)
      const factor = durs[i] / slot
      // cap 4x: qua nhanh se khong nghe duoc, chap nhan tran nhe sang cau sau
      if (factor > 1.02) f.push(...buildAtempoChain(Math.min(factor, 4)))
      f.push(norm, `adelay=${Math.max(0, Math.round(pt.start * 1000))}:all=1`)
      fc.push(`[${i}:a]${f.join(',')}[s${i}]`)
      labels.push(`[s${i}]`)
    })
    const pad = `apad=whole_dur=${totalDur.toFixed(3)}`
    if (parts.length === 1) fc.push(`${labels[0]}${pad}[a]`)
    else fc.push(`${labels.join('')}amix=inputs=${parts.length}:duration=longest:dropout_transition=0:normalize=0,${pad}[a]`)
    // filter ghi ra file: nhieu cau -> chuoi filter dai, tranh gioi han command line Windows
    const fcFile = path.resolve(output) + '.fc.txt'
    fs.writeFileSync(fcFile, fc.join(';'), 'utf8')
    args.push('-filter_complex_script', fcFile, '-map', '[a]', '-t', String(totalDur),
      '-c:a', 'pcm_s16le', '-ar', '44100', '-ac', '2', path.resolve(output))
    const ps = spawn(FFMPEG_PATH, args)
    let err = ''
    ps.stderr.on('data', (d) => (err += d))
    ps.on('error', reject)
    ps.on('close', (c) => {
      try { fs.rmSync(fcFile, { force: true }) } catch {}
      c === 0 ? resolve(output) : reject(new Error('redub loi: ' + err.slice(-400)))
    })
  })
}

// ---------- atempo (giu cao do) ----------
function buildAtempoChain(factor) {
  const parts = []
  let f = factor
  while (f > 2.0 + 1e-9) { parts.push('atempo=2.0'); f /= 2 }
  while (f < 0.5 - 1e-9) { parts.push('atempo=0.5'); f *= 2 }
  parts.push('atempo=' + Number(f.toFixed(6)))
  return parts
}

// ---------- Phat hien khoang lang ----------
function detectSilence(input, { noise = '-30dB', minSilence = 0.4 } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['-i', input, '-af', `silencedetect=noise=${noise}:d=${minSilence}`, '-f', 'null', '-']
    const ps = spawn(FFMPEG_PATH, args)
    let err = ''
    ps.stderr.on('data', (d) => (err += d))
    ps.on('error', reject)
    ps.on('close', () => {
      const starts = [...err.matchAll(/silence_start:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]))
      const ends = [...err.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) => Number(m[1]))
      const silences = starts.map((s, i) => ({ start: Math.max(0, s), end: ends[i] ?? null }))
      resolve(silences)
    })
  })
}
// Tinh cac doan GIU LAI (bu cua khoang lang), chua le 'pad' giay
function computeKeep(duration, silences, pad = 0.06) {
  const sil = silences.filter((s) => s.end != null).sort((a, b) => a.start - b.start)
  const keep = []; let cur = 0
  for (const s of sil) {
    const segEnd = Math.min(duration, s.start + pad)
    if (segEnd - cur > 0.12) keep.push({ start: cur, end: segEnd })
    cur = Math.max(cur, s.end - pad)
  }
  if (duration - cur > 0.12) keep.push({ start: cur, end: duration })
  return keep
}

// ---------- Re-encode 1 doan (toc do + ti le khung) ----------
function reencodeSegment({ input, output, start, duration, speed = 1, dims = null,
                           colorFilter = null, hasAudio = true, format = null, onProgress }) {
  return new Promise((resolve, reject) => {
    let cmd = ffmpeg(input).inputOptions(['-ss', String(start), '-t', String(duration)])
    const vf = []
    if (speed !== 1) vf.push(`setpts=${(1 / speed).toFixed(6)}*PTS`)
    if (colorFilter) vf.push(colorFilter)
    if (dims) {
      const [w, h] = dims
      vf.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease`)
      vf.push(`pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black`)
    }
    if (vf.length) cmd = cmd.videoFilters(vf)
    if (hasAudio && speed !== 1) cmd = cmd.audioFilters(buildAtempoChain(speed))

    const opts = [...vencArgs()]
    if (hasAudio) opts.push('-c:a', 'aac', '-b:a', '192k'); else opts.push('-an')
    if (format === 'mpegts') opts.push('-bsf:v', 'h264_mp4toannexb', '-f', 'mpegts')
    else opts.push('-movflags', '+faststart')

    trackCmd(cmd).outputOptions(opts)
      .on('progress', (p) => onProgress && onProgress(p.percent || 0))
      .on('end', () => resolve(output)).on('error', (e) => reject(new Error(e.message))).save(output)
  })
}
function copySegmentTS({ input, output, start, duration }) {
  return new Promise((resolve, reject) => {
    trackCmd(ffmpeg(input).inputOptions(['-ss', String(start), '-t', String(duration)]))
      .outputOptions(['-c', 'copy', '-bsf:v', 'h264_mp4toannexb', '-f', 'mpegts'])
      .on('end', () => resolve(output)).on('error', (e) => reject(new Error(e.message))).save(output)
  })
}
function fastCopy({ input, output, start, duration }) {
  return new Promise((resolve, reject) => {
    trackCmd(ffmpeg(input).inputOptions(['-ss', String(start), '-t', String(duration)]))
      .outputOptions(['-c', 'copy', '-movflags', '+faststart'])
      .on('end', () => resolve(output)).on('error', (e) => reject(new Error(e.message))).save(output)
  })
}
function concatTS({ inputs, output, hasAudio = true }) {
  return new Promise((resolve, reject) => {
    const opts = ['-c', 'copy', '-movflags', '+faststart']
    if (hasAudio) opts.splice(2, 0, '-bsf:a', 'aac_adtstoasc')
    trackCmd(ffmpeg('concat:' + inputs.join('|'))).outputOptions(opts)
      .on('end', () => resolve(output)).on('error', (e) => reject(new Error(e.message))).save(output)
  })
}

// ============================================================
//  XUAT VIDEO - ho tro: segments[] (auto-cut), ratio, speed, mode
// ============================================================
async function exportVideo(opts) {
  const { input, output, start = 0, end, speed = 1, mode = 'smart', onProgress } = opts
  const info = await probe(input)
  const dur = info.duration
  const ratio = opts.ratio || (opts.vertical ? '9:16' : 'original')
  const dims = ratioDims(ratio)
  const colorFilter = opts.colorFilter || null
  const report = (p) => onProgress && onProgress(Math.max(0, Math.min(100, Math.round(p))))

  let segments = (opts.segments && opts.segments.length ? opts.segments : [{ start, end: end ?? dur }])
    .map((s) => ({ start: Math.max(0, s.start), end: Math.min(dur, s.end) }))
    .filter((s) => s.end - s.start > 0.05)
  if (!segments.length) throw new Error('Khong co doan nao de xuat')

  const single = segments.length === 1
  const needsTransform = speed !== 1 || !!dims || !!colorFilter

  // --- Truong hop 1 doan, khong bien doi -> smart/fast/accurate ---
  if (single && !needsTransform) {
    const s = segments[0], d = s.end - s.start
    if (mode === 'fast') { await fastCopy({ input, output, start: s.start, duration: d }); report(100); return { ok: true, output, method: 'fast-copy' } }
    if (mode === 'accurate') { await reencodeSegment({ input, output, start: s.start, duration: d, hasAudio: info.hasAudio, onProgress: report }); report(100); return { ok: true, output, method: 'reencode' } }
    // smart
    const audioOk = !info.hasAudio || info.acodec === 'aac'
    if (info.vcodec !== 'h264' || !audioOk) { await reencodeSegment({ input, output, start: s.start, duration: d, hasAudio: info.hasAudio, onProgress: report }); report(100); return { ok: true, output, method: 'reencode-fallback' } }
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taoclip-'))
    try {
      const kfs = await getKeyframes(input)
      const inner = kfs.filter((t) => t > s.start + 0.04 && t < s.end - 0.04)
      if (!inner.length) { await reencodeSegment({ input, output, start: s.start, duration: d, hasAudio: info.hasAudio, onProgress: report }); report(100); return { ok: true, output, method: 'reencode-nokf' } }
      const kfS = inner[0], kfE = inner[inner.length - 1]
      const parts = []
      const head = path.join(tmpDir, 'h.ts'), mid = path.join(tmpDir, 'm.ts'), tail = path.join(tmpDir, 't.ts')
      report(5)
      if (kfS - s.start > 0.04) { await reencodeSegment({ input, output: head, start: s.start, duration: kfS - s.start, hasAudio: info.hasAudio, format: 'mpegts', onProgress: (p) => report(5 + p * 0.25) }); parts.push(head) }
      report(35)
      // Chi copy doan giua khi co do dai thuc (tranh -t 0 sinh du frame)
      if (kfE - kfS > 0.04) { await copySegmentTS({ input, output: mid, start: kfS, duration: kfE - kfS }); parts.push(mid) }
      report(55)
      if (s.end - kfE > 0.04) { await reencodeSegment({ input, output: tail, start: kfE, duration: s.end - kfE, hasAudio: info.hasAudio, format: 'mpegts', onProgress: (p) => report(55 + p * 0.25) }); parts.push(tail) }
      // Clip qua ngan, khong tao duoc phan nao -> re-encode toan bo cho chac
      if (!parts.length) { await reencodeSegment({ input, output, start: s.start, duration: d, hasAudio: info.hasAudio, onProgress: report }); report(100); return { ok: true, output, method: 'reencode-tiny' } }
      report(85); await concatTS({ inputs: parts, output, hasAudio: info.hasAudio }); report(100)
      return { ok: true, output, method: 'smart-cut', parts: parts.length }
    } finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {} }
  }

  // --- Truong hop chung: nhieu doan / co bien doi -> reencode tung doan roi noi ---
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taoclip-'))
  try {
    const parts = []
    for (let i = 0; i < segments.length; i++) {
      guardCancel()
      const seg = segments[i]
      const out = path.join(tmpDir, `p${i}.ts`)
      await reencodeSegment({
        input, output: out, start: seg.start, duration: seg.end - seg.start,
        speed, dims, colorFilter, hasAudio: info.hasAudio, format: 'mpegts',
        onProgress: (p) => report(((i + p / 100) / segments.length) * 95)
      })
      parts.push(out)
    }
    await concatTS({ inputs: parts, output, hasAudio: info.hasAudio })
    report(100)
    return { ok: true, output, method: single ? 'reencode' : 'auto-cut', segments: segments.length }
  } finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {} }
}

module.exports = {
  configure, probe, getKeyframes, buildAtempoChain, exportVideo, vencArgs,
  generateThumbnails, generateWaveform, detectSilence, computeKeep, ratioDims,
  extractAudioWav, burnSubtitles, mixAudio, mixAudioTracks, exportClips, encodeImageTS, crossfadeChain,
  setEncoder, getEncoder, detectBestEncoder, buildTimelineAudioWav, buildRedubTrack,
  beginJob, runJob, endJob, cancelJob, isCancelled
}

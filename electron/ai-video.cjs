// ============================================================
//  AI video local (ONNX): doi nen / xoa phong bang Robust Video Matting
//  Model rvm_mobilenetv3_fp32.onnx (~15MB) tai ve lan dau vao modelDir.
//  Pipeline 2 pass:
//    1) decode rawvideo -> RVM tung frame (giu recurrent state) -> alpha (FFV1 lossless)
//    2) composite: [nen][goc + alpha]overlay -> mp4 (encoder GPU neu co)
//  Tach rieng de test doc lap (khong can Electron) - xem test-ai.cjs
// ============================================================
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const ops = require('./ffmpeg-ops.cjs')

let FFMPEG_PATH = null
let MODEL_DIR = null

function configure(ffmpegPath, modelDir) {
  FFMPEG_PATH = ffmpegPath
  MODEL_DIR = modelDir
}

const MODEL_FILE = 'rvm_mobilenetv3_fp32.onnx'
const MODEL_URLS = [
  'https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_mobilenetv3_fp32.onnx'
]

// Tai model neu chua co (luu .part roi rename de tranh file dut giua chung)
async function ensureModel(onStatus) {
  const dest = path.join(MODEL_DIR, MODEL_FILE)
  if (fs.existsSync(dest) && fs.statSync(dest).size > 10e6) return dest
  fs.mkdirSync(MODEL_DIR, { recursive: true })
  let lastErr = null
  for (const url of MODEL_URLS) {
    try {
      if (onStatus) onStatus({ phase: 'download', progress: 0 })
      const res = await fetch(url, { redirect: 'follow' })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const total = Number(res.headers.get('content-length')) || 0
      const tmp = dest + '.part'
      const out = fs.createWriteStream(tmp)
      let got = 0
      for await (const chunk of res.body) {
        out.write(Buffer.from(chunk))
        got += chunk.length
        if (onStatus && total) onStatus({ phase: 'download', progress: Math.round((got / total) * 100) })
      }
      await new Promise((resolve, reject) => out.end((e) => (e ? reject(e) : resolve())))
      fs.renameSync(tmp, dest)
      return dest
    } catch (e) { lastErr = e }
  }
  throw new Error('Tai model AI loi: ' + (lastErr && lastErr.message))
}

// ---------- Pass 1: video -> alpha matte (FFV1 gray, lossless) ----------
// Chay RVM tung frame qua pipe rawvideo; recurrent state giup nen on dinh giua cac frame.
function mattePass({ input, start, dur, pw, ph, fps, session, ort, output, onProgress }) {
  return new Promise((resolve, reject) => {
    let done = false
    const dec = spawn(FFMPEG_PATH, ['-v', 'error', '-ss', String(start), '-t', String(dur), '-i', path.resolve(input),
      '-vf', `fps=${fps},scale=${pw}:${ph}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'])
    const enc = spawn(FFMPEG_PATH, ['-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${pw}x${ph}`,
      '-r', String(fps), '-i', 'pipe:0', '-c:v', 'ffv1', path.resolve(output)])
    let decErr = '', encErr = ''
    dec.stderr.on('data', (d) => (decErr += d))
    enc.stderr.on('data', (d) => (encErr += d))
    const fail = (e) => { if (!done) { done = true; try { dec.kill() } catch {} try { enc.kill() } catch {} reject(e) } }
    dec.on('error', fail); enc.on('error', fail)
    enc.stdin.on('error', () => {}) // EPIPE khi enc chet -> close se bao loi

    const n = pw * ph
    const frameSize = n * 3
    const totalEst = Math.max(1, Math.ceil(dur * fps))
    const chw = new Float32Array(n * 3)
    const zero = () => new ort.Tensor('float32', new Float32Array(1), [1, 1, 1, 1])
    let r1 = zero(), r2 = zero(), r3 = zero(), r4 = zero()
    // downsample sao cho mang base chay o ~512px (theo huong dan RVM)
    const dsr = new ort.Tensor('float32', new Float32Array([Math.max(0.1, Math.min(1, 512 / pw))]), [1])
    let buf = Buffer.alloc(0)
    let frames = 0, processing = false, decEnded = false

    async function pump() {
      if (processing || done) return
      processing = true
      try {
        while (buf.length >= frameSize) {
          const frame = buf.subarray(0, frameSize)
          for (let i = 0; i < n; i++) {
            chw[i] = frame[3 * i] / 255
            chw[n + i] = frame[3 * i + 1] / 255
            chw[2 * n + i] = frame[3 * i + 2] / 255
          }
          buf = buf.subarray(frameSize)
          const out = await session.run({
            src: new ort.Tensor('float32', chw, [1, 3, ph, pw]),
            r1i: r1, r2i: r2, r3i: r3, r4i: r4, downsample_ratio: dsr
          })
          r1 = out.r1o; r2 = out.r2o; r3 = out.r3o; r4 = out.r4o
          const pha = out.pha.data
          const gray = Buffer.allocUnsafe(n)
          for (let i = 0; i < n; i++) { const v = pha[i]; gray[i] = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255) | 0 }
          if (!enc.stdin.write(gray)) await new Promise((r) => enc.stdin.once('drain', r))
          frames++
          if (onProgress) onProgress(frames, totalEst)
        }
      } catch (e) { processing = false; return fail(e) }
      processing = false
      dec.stdout.resume()
      if (decEnded && buf.length < frameSize) enc.stdin.end()
    }

    dec.stdout.on('data', (d) => {
      buf = buf.length ? Buffer.concat([buf, d]) : d
      if (buf.length >= frameSize * 4) dec.stdout.pause() // chan doc truoc, tranh phinh RAM
      pump()
    })
    dec.stdout.on('end', () => { decEnded = true; pump() })
    dec.on('close', (c) => { if (c !== 0) fail(new Error('decode loi: ' + decErr.slice(-300))) })
    enc.on('close', (c) => {
      if (done) return
      if (c === 0 && frames > 0) { done = true; resolve(frames) }
      else fail(new Error('alpha encode loi: ' + (encErr.slice(-300) || 'khong co frame nao')))
    })
  })
}

// ---------- Pass 2: composite goc + alpha len nen moi ----------
// bg: {type:'blur'} | {type:'color', color:'#rrggbb'} | {type:'image', path}
function compositePass({ input, start, dur, alpha, bg, W, H, fps, hasAudio, output, onProgress }) {
  return new Promise((resolve, reject) => {
    const args = ['-y', '-ss', String(start), '-t', String(dur), '-i', path.resolve(input), '-i', path.resolve(alpha)]
    const fc = []
    // [m] ep ve W:H (chan) de khop alpha da scale W:H -> alphamerge khong lech kich thuoc
    const mFg = `[0:v]fps=${fps},scale=${W}:${H},setsar=1`
    if (bg.type === 'image') {
      args.push('-loop', '1', '-t', String(dur), '-i', path.resolve(bg.path))
      fc.push(`[2:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${fps}[bg]`)
      fc.push(`${mFg}[m]`)
    } else if (bg.type === 'color') {
      const hex = /^#?([0-9a-f]{6})$/i.exec(bg.color || '')
      fc.push(`color=c=0x${hex ? hex[1] : '00c853'}:s=${W}x${H}:r=${fps}:d=${dur}[bg]`)
      fc.push(`${mFg}[m]`)
    } else { // blur (xoa phong)
      fc.push(`${mFg},split[m][bb]`)
      fc.push(`[bb]boxblur=20:2[bg]`)
    }
    fc.push(`[1:v]format=gray,scale=${W}:${H}[al]`)
    fc.push(`[m][al]alphamerge[cut]`)
    fc.push(`[bg][cut]overlay=shortest=1,format=yuv420p[v]`)
    args.push('-filter_complex', fc.join(';'), '-map', '[v]')
    if (hasAudio) args.push('-map', '0:a?', '-c:a', 'aac', '-b:a', '192k')
    else args.push('-an')
    args.push(...ops.vencArgs(), '-r', String(fps), '-movflags', '+faststart', path.resolve(output))
    const ps = spawn(FFMPEG_PATH, args)
    let err = ''
    ps.stderr.on('data', (d) => {
      err += d
      const m = /time=(\d+):(\d+):(\d+\.\d+)/.exec(d.toString())
      if (m && onProgress) onProgress(((+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])) / dur * 100)
    })
    ps.on('error', reject)
    ps.on('close', (c) => c === 0 ? resolve(output) : reject(new Error('composite loi: ' + err.slice(-400))))
  })
}

let sessionPromise = null
async function getSession(modelPath) {
  if (!sessionPromise) {
    const ort = require('onnxruntime-node')
    sessionPromise = ort.InferenceSession.create(modelPath).then((s) => ({ ort, session: s }))
  }
  return sessionPromise
}

// ---------- API chinh: thay nen 1 doan video ----------
// opts: { input, start, dur, bg, output, procWidth?, fps?, onStatus?, onProgress? }
// onProgress: 0-100 (matte chiem 80%, composite 20%)
async function replaceBackground({ input, start = 0, dur, bg, output, procWidth = 640, fps = 30, onStatus, onProgress }) {
  if (!FFMPEG_PATH || !MODEL_DIR) throw new Error('ai-video chua duoc configure')
  const modelPath = await ensureModel(onStatus)
  if (onStatus) onStatus({ phase: 'load' })
  const { ort, session } = await getSession(modelPath)
  const info = await ops.probe(input)
  if (!info.width || !info.height) throw new Error('Khong doc duoc kich thuoc video')
  // Chan kich thuoc CHAN (yuv420p yeu cau); composite ep foreground/alpha/bg ve W:H nay
  const W = info.width - (info.width % 2), H = info.height - (info.height % 2)
  if (!dur || dur <= 0) dur = Math.max(0.1, info.duration - start)
  // xu ly o do phan giai vua (toc do CPU), alpha se phong len kich thuoc goc khi ghep
  let pw = Math.min(procWidth, W)
  let ph = Math.round((pw * H) / W)
  pw -= pw % 2; ph -= ph % 2
  const tmpAlpha = path.resolve(output) + '.alpha.mkv'
  try {
    if (onStatus) onStatus({ phase: 'matte' })
    await mattePass({
      input, start, dur, pw, ph, fps, session, ort, output: tmpAlpha,
      onProgress: (f, tot) => onProgress && onProgress(Math.min(80, Math.round((f / tot) * 80)))
    })
    if (onStatus) onStatus({ phase: 'composite' })
    await compositePass({
      input, start, dur, alpha: tmpAlpha, bg, W, H, fps, hasAudio: info.hasAudio, output,
      onProgress: (p) => onProgress && onProgress(Math.min(100, Math.round(80 + p * 0.2)))
    })
    return { ok: true, output }
  } finally { try { fs.rmSync(tmpAlpha, { force: true }) } catch {} }
}

module.exports = { configure, ensureModel, replaceBackground }

// ============================================================
//  Tai video tu link (YouTube / TikTok / ...) bang yt-dlp
//  - yt-dlp.exe (~17MB) tai ve lan dau vao binDir, tu lam moi sau 30 ngay
//    (YouTube doi API lien tuc, ban cu de hong)
//  - Uu tien H.264/MP4 <=1080p de smart-cut + preview chay tot
//  Tach rieng de test doc lap (khong can Electron) - xem test-dl.cjs
// ============================================================
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

let BIN_DIR = null
let FFMPEG_PATH = null

function configure(binDir, ffmpegPath) {
  BIN_DIR = binDir
  FFMPEG_PATH = ffmpegPath
}

const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
const MAX_AGE_DAYS = 30

// Tai yt-dlp.exe neu chua co / da cu. Neu tai moi that bai nhung con ban cu -> dung ban cu.
async function ensureYtDlp(onStatus) {
  const dest = path.join(BIN_DIR, 'yt-dlp.exe')
  const exists = fs.existsSync(dest) && fs.statSync(dest).size > 1e6
  const fresh = exists && (Date.now() - fs.statSync(dest).mtimeMs) < MAX_AGE_DAYS * 86400e3
  if (fresh) return dest
  fs.mkdirSync(BIN_DIR, { recursive: true })
  try {
    if (onStatus) onStatus({ phase: 'tool', progress: 0 })
    const res = await fetch(YTDLP_URL, { redirect: 'follow' })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const total = Number(res.headers.get('content-length')) || 0
    const tmp = dest + '.part'
    const out = fs.createWriteStream(tmp)
    let got = 0
    for await (const chunk of res.body) {
      out.write(Buffer.from(chunk))
      got += chunk.length
      if (onStatus && total) onStatus({ phase: 'tool', progress: Math.round((got / total) * 100) })
    }
    await new Promise((resolve, reject) => out.end((e) => (e ? reject(e) : resolve())))
    try { fs.rmSync(dest, { force: true }) } catch {}
    fs.renameSync(tmp, dest)
    return dest
  } catch (e) {
    if (exists) return dest // mang loi nhung con ban cu -> van dung duoc
    throw new Error('Tai yt-dlp loi: ' + e.message)
  }
}

function checkUrl(url) {
  let u
  try { u = new URL(String(url).trim()) } catch { throw new Error('Link khong hop le') }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Chi ho tro link http/https')
  return u.toString()
}

// Tai video ve outDir. Tra ve { path }. onProgress: 0-100.
// opts.maxRes: gioi han chieu cao (mac dinh 1080)
async function download(url, outDir, { maxRes = 1080, onStatus, onProgress } = {}) {
  url = checkUrl(url)
  const ytdlp = await ensureYtDlp(onStatus)
  fs.mkdirSync(outDir, { recursive: true })
  if (onStatus) onStatus({ phase: 'start' })
  return new Promise((resolve, reject) => {
    const args = [
      // uu tien h264+aac mp4, gioi han do phan giai; van tai duoc neu nguon chi co vp9...
      '-S', `res:${maxRes},vcodec:h264,acodec:aac,ext:mp4`,
      '--no-playlist', '--merge-output-format', 'mp4', '--windows-filenames',
      '--ffmpeg-location', FFMPEG_PATH,
      '-o', path.join(path.resolve(outDir), '%(title).60s [%(id)s].%(ext)s'),
      '--print', 'after_move:filepath', '--no-simulate', '--newline', '--progress',
      '--', url // '--' chan URL bat dau bang '-' bi hieu thanh flag
    ]
    const ps = spawn(ytdlp, args)
    let err = '', filePath = null
    const onLine = (line) => {
      line = line.trim()
      if (!line) return
      const m = /\[download\]\s+([\d.]+)%/.exec(line)
      if (m) { if (onProgress) onProgress(Math.min(100, Math.round(parseFloat(m[1])))); return }
      // dong khong phai log [xxx] -> co the la duong dan file cuoi (tu --print)
      if (!line.startsWith('[') && /^[a-z]:\\/i.test(line)) filePath = line
    }
    let bufOut = '', bufErr = ''
    ps.stdout.on('data', (d) => { bufOut += d; const ls = bufOut.split(/\r?\n/); bufOut = ls.pop(); ls.forEach(onLine) })
    ps.stderr.on('data', (d) => { bufErr += d; err += d; const ls = bufErr.split(/\r?\n/); bufErr = ls.pop(); ls.forEach(onLine) })
    ps.on('error', reject)
    ps.on('close', (c) => {
      if (bufOut) onLine(bufOut)
      if (c !== 0) {
        const msg = (err.match(/ERROR:?\s*(.+)/) || [])[1] || err.slice(-300) || ('yt-dlp thoat ma ' + c)
        return reject(new Error(msg.trim()))
      }
      if (filePath && fs.existsSync(filePath)) return resolve({ path: filePath })
      reject(new Error('Tai xong nhung khong tim thay file'))
    })
  })
}

module.exports = { configure, ensureYtDlp, download }

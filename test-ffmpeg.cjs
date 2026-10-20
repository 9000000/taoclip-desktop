// ============================================================
//  Bo test engine xu ly video (FFmpeg ops) - chay bang Node, khong can mo app
//    node test-ffmpeg.cjs
//  Tu tao video test trong .testout/, kiem tra tung chuc nang, in PASS/FAIL.
//  (Whisper/TTS KHONG test o day vi can tai model ~120MB - xem cuoi file.)
// ============================================================
const path = require('path')
const fs = require('fs')
const { spawnSync } = require('child_process')
const ops = require('./electron/ffmpeg-ops.cjs')
const caps = require('./electron/captions.cjs')

const ffmpegPath = require('ffmpeg-static')
ops.configure(ffmpegPath, require('ffprobe-static').path)

const dir = path.join(__dirname, '.testout')
fs.mkdirSync(dir, { recursive: true })
const p = (f) => path.join(dir, f)

let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + name + (extra ? '  ' + extra : '')) }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + name + (extra ? '  ' + extra : '')) }
}
const near = (a, b, tol = 0.6) => Math.abs(a - b) < tol

function gen(file, args) {
  const r = spawnSync(ffmpegPath, ['-y', ...args, p(file)], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error('gen ' + file + ': ' + r.stderr)
}

async function run() {
  console.log('1) Tao video test...')
  // co tieng, keyframe moi 1s, im lang 3-5s & 7-8s
  gen('main.mp4', ['-f', 'lavfi', '-i', 'testsrc=duration=9:size=640x480:rate=30', '-f', 'lavfi', '-i',
    'sine=frequency=440:duration=9', '-af', "volume=enable='between(t,3,5)+between(t,7,8)':volume=0",
    '-c:v', 'libx264', '-g', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac'])
  gen('noaudio.mp4', ['-f', 'lavfi', '-i', 'testsrc=duration=6:size=640x480:rate=30', '-c:v', 'libx264', '-g', '30', '-pix_fmt', 'yuv420p'])
  gen('music.mp3', ['-f', 'lavfi', '-i', 'sine=frequency=300:duration=3'])
  const SRC = p('main.mp4'), NA = p('noaudio.mp4')

  console.log('\n2) probe')
  const info = await ops.probe(SRC)
  check('duration ~9s', near(info.duration, 9), `(${info.duration})`)
  check('co audio + h264', info.hasAudio && info.vcodec === 'h264')

  console.log('\n3) Cat clip (smart / fast / accurate)')
  for (const [mode, exp] of [['smart', 4.4], ['fast', 4.0], ['accurate', 4.4]]) {
    const o = p(`cut_${mode}.mp4`)
    await ops.exportVideo({ input: SRC, output: o, start: 2.3, end: 6.7, mode, onProgress: () => {} })
    check(`cut ${mode}`, near((await ops.probe(o)).duration, exp, 0.7), `(${(await ops.probe(o)).duration.toFixed(2)})`)
  }

  console.log('\n4) Toc do (giu pitch)')
  for (const [sp, exp] of [[2, 5], [0.5, 4]]) {
    const o = p(`spd_${sp}.mp4`)
    await ops.exportVideo({ input: SRC, output: o, start: sp === 2 ? 0 : 2, end: sp === 2 ? 10 : 4, speed: sp, onProgress: () => {} })
    check(`speed ${sp}x`, near((await ops.probe(o)).duration, exp), `(${(await ops.probe(o)).duration.toFixed(2)})`)
  }

  console.log('\n5) Ti le khung')
  for (const [r, w, h] of [['9:16', 1080, 1920], ['1:1', 1080, 1080], ['16:9', 1920, 1080], ['4:5', 1080, 1350]]) {
    const o = p('r.mp4')
    await ops.exportVideo({ input: SRC, output: o, start: 0, end: 2, ratio: r, onProgress: () => {} })
    const oi = await ops.probe(o)
    check(`ratio ${r}`, oi.width === w && oi.height === h, `(${oi.width}x${oi.height})`)
  }

  console.log('\n6) Bo loc mau (6 preset)')
  const FF = { bright: 'eq=brightness=0.06:contrast=1.1', warm: 'colorbalance=rm=0.12:gm=0.04:bm=-0.12', cool: 'colorbalance=rm=-0.1:bm=0.12', vivid: 'eq=saturation=1.5', bw: 'hue=s=0', vintage: 'curves=preset=vintage' }
  for (const [k, ff] of Object.entries(FF)) {
    const o = p('f.mp4'); let ok = true
    try { await ops.exportVideo({ input: SRC, output: o, start: 0, end: 1.5, colorFilter: ff, onProgress: () => {} }) } catch { ok = false }
    check('filter ' + k, ok && (await ops.probe(o)).duration > 0)
  }

  console.log('\n7) Thumbnails')
  const th = await ops.generateThumbnails(SRC, 8)
  check('8 thumbnails', th.length === 8)

  console.log('\n7b) Waveform (showwavespic)')
  const wv = await ops.generateWaveform(SRC)
  const wvi = wv ? await ops.probe(wv) : null
  check('waveform PNG hop le', !!wv && wvi.width === 1200, wv ? `(${wvi.width}x${wvi.height})` : '(null)')
  check('video khong tieng -> null', (await ops.generateWaveform(NA)) === null)

  console.log('\n8) Tu xoa khoang lang')
  const sil = await ops.detectSilence(SRC, { noise: '-30dB', minSilence: 0.4 })
  const keep = ops.computeKeep(info.duration, sil)
  check('phat hien 2 khoang lang', sil.length === 2, `(${sil.length})`)
  check('giu lai 3 doan', keep.length === 3, `(${keep.length})`)

  console.log('\n9) Tron am thanh (nhac nen)')
  await ops.mixAudio({ video: SRC, audio: p('music.mp3'), output: p('mix.mp4'), videoVol: 0.6, audioVol: 0.3, hasOrigAudio: true, loop: true })
  const mx = await ops.probe(p('mix.mp4'))
  check('mix giu do dai + co audio', near(mx.duration, 9) && mx.hasAudio, `(${mx.duration.toFixed(2)})`)
  await ops.mixAudio({ video: NA, audio: p('music.mp3'), output: p('mix2.mp4'), audioVol: 0.5, hasOrigAudio: false, loop: false })
  check('mix vao video khong tieng', near((await ops.probe(p('mix2.mp4'))).duration, 6))

  console.log('\n9b) Tron NHIEU track (nhac + giong + ducking)')
  gen('voice.wav', ['-f', 'lavfi', '-i', 'sine=frequency=880:duration=3', '-c:a', 'pcm_s16le'])
  const trk = [
    { path: p('music.mp3'), volume: 0.4, loop: true, role: 'music' },
    { path: p('voice.wav'), volume: 1, loop: false, role: 'voice' }
  ]
  await ops.mixAudioTracks({ video: SRC, tracks: trk, output: p('mixmt.mp4'), videoVol: 0.8, hasOrigAudio: true, ducking: true })
  const mm = await ops.probe(p('mixmt.mp4'))
  check('2 track + ducking, giu do dai', near(mm.duration, 9) && mm.hasAudio, `(${mm.duration.toFixed(2)})`)
  await ops.mixAudioTracks({ video: NA, tracks: trk, output: p('mixmt2.mp4'), hasOrigAudio: false, ducking: true })
  check('2 track vao video khong tieng', near((await ops.probe(p('mixmt2.mp4'))).duration, 6))
  await ops.mixAudioTracks({ video: NA, tracks: [trk[1]], output: p('mixmt3.mp4'), hasOrigAudio: false, ducking: true })
  check('1 track (giong) - nhanh apad', near((await ops.probe(p('mixmt3.mp4'))).duration, 6))
  await ops.mixAudioTracks({ video: SRC, tracks: [{ ...trk[1], delay: 2000 }], output: p('mixmt4.mp4'), hasOrigAudio: true, ducking: false })
  check('giong co delay 2s (adelay)', near((await ops.probe(p('mixmt4.mp4'))).duration, 9))

  console.log('\n9c) Doi giong (re-dub): ghep TTS theo timeline')
  // cau 1: 1.5s vao slot 3s (giu nguyen); cau 2: 3s vao slot 2s (phai atempo 1.5x -> ~2s)
  gen('seg0.wav', ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.5', '-c:a', 'pcm_s16le'])
  gen('seg1.wav', ['-f', 'lavfi', '-i', 'sine=frequency=660:duration=3', '-c:a', 'pcm_s16le'])
  await ops.buildRedubTrack({
    parts: [{ path: p('seg0.wav'), start: 0.5, slot: 3 }, { path: p('seg1.wav'), start: 4, slot: 2 }],
    totalDur: 8, output: p('redub.wav')
  })
  const rd = await ops.probe(p('redub.wav'))
  check('track redub dai dung timeline (8s)', near(rd.duration, 8, 0.15), `(${rd.duration.toFixed(2)})`)
  await ops.mixAudioTracks({
    video: SRC, tracks: [{ path: p('redub.wav'), volume: 1, loop: false, role: 'voice' }],
    output: p('redubmix.mp4'), videoVol: 0, hasOrigAudio: true, ducking: false
  })
  const rm = await ops.probe(p('redubmix.mp4'))
  check('tron redub vao video (tat tieng goc)', near(rm.duration, 9) && rm.hasAudio, `(${rm.duration.toFixed(2)})`)
  await ops.mixAudioTracks({ video: SRC, tracks: [], output: p('mute-original.mp4'), videoVol: 0, hasOrigAudio: true })
  const mutedProbe = await ops.probe(p('mute-original.mp4'))
  const mutedCheck = spawnSync(ffmpegPath, ['-i', p('mute-original.mp4'), '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' })
  const maxVolume = Number((mutedCheck.stderr.match(/max_volume:\s*(-?[\d.]+) dB/) || [])[1])
  check('original volume 0 khong can track them', mutedProbe.hasAudio && near(mutedProbe.duration, 9) && (!Number.isFinite(maxVolume) || maxVolume < -60),
    `(max=${Number.isFinite(maxVolume) ? maxVolume : '-inf'}dB)`)
  await ops.buildRedubTrack({ parts: [{ path: p('seg0.wav'), start: 1, slot: 5 }], totalDur: 6, output: p('redub1.wav') })
  check('redub 1 cau (khong amix)', near((await ops.probe(p('redub1.wav'))).duration, 6, 0.15))

  console.log('\n10) Ghep nhieu clip (+ chuyen canh fade)')
  const clips = [{ input: SRC, in: 1, out: 4, speed: 1 }, { input: NA, in: 0, out: 4, speed: 2 }]
  await ops.exportClips({ clips, output: p('multi.mp4'), ratio: '9:16', transition: { type: 'fade', dur: 0.4 }, onProgress: () => {} })
  const mc = await ops.probe(p('multi.mp4'))
  check('ghep 2 clip -> 9:16, co audio', mc.width === 1080 && mc.hasAudio && near(mc.duration, 4.5))

  console.log('\n11) Audio timeline (cho phu de da clip)')
  await ops.buildTimelineAudioWav(clips, p('tl.wav'))
  check('timeline audio ~4.5s', near((await ops.probe(p('tl.wav'))).duration, 4.5))

  console.log('\n12) Phu de: ASS + map + burn')
  check('rgbToAss(#ff0000)=0000FF', caps.rgbToAss('#ff0000') === '0000FF')
  const mapped = caps.mapToOutput([{ start: 3, end: 5, text: 'x' }], [{ start: 2, end: 6 }], 2)
  check('mapToOutput cat2-6 speed2 -> 0.5..1.5', near(mapped[0].start, 0.5, 0.1) && near(mapped[0].end, 1.5, 0.1))
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'tc-'))
  await ops.exportVideo({ input: SRC, output: p('core.mp4'), start: 0, end: 4, ratio: '9:16', onProgress: () => {} })
  const d = await ops.probe(p('core.mp4'))
  const ass = caps.toAss([{ start: 1, end: 3, text: 'Phụ đề' }, { start: 0, end: 4, text: 'Tiêu đề', pos: { x: d.width / 2, y: d.height / 4 }, fs: 80, color: 'FFD34E' }], { width: d.width, height: d.height })
  fs.writeFileSync(path.join(tmp, 's.ass'), ass, 'utf8')
  await ops.burnSubtitles({ input: p('core.mp4'), assFile: path.join(tmp, 's.ass'), output: p('burn.mp4') })
  check('khac phu de + chu', (await ops.probe(p('burn.mp4'))).width === 1080)
  fs.rmSync(tmp, { recursive: true, force: true })

  console.log('\n13) Encoder (GPU neu co)')
  const enc = await ops.detectBestEncoder()
  check('detect encoder', ['cpu', 'nvenc', 'qsv', 'amf'].includes(enc), `(${enc})`)

  console.log(`\n================  ${pass} PASS / ${fail} FAIL  ================`)
  if (fail) process.exit(1)
}

run().catch((e) => { console.error('\x1b[31mLOI TEST:\x1b[0m', e.message || e); process.exit(1) })

// Ghi chu: de test Whisper (phu de) + TTS (long tieng) - can mang tai model lan dau:
//   node -e "require('./electron/ffmpeg-ops.cjs').configure(require('ffmpeg-static'),require('ffprobe-static').path); require('./electron/tts.cjs').synthesize('Xin chào', './.testout/v.wav').then(r=>console.log('TTS OK', r.duration))"

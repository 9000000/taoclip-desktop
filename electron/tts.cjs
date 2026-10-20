// ============================================================
//  Lồng tiếng AI (TTS) tiếng Việt - transformers.js MMS-TTS, chạy local
//  Model: Xenova/mms-tts-vie (lần đầu tự tải về cache)
// ============================================================
const fs = require('fs')

let ttsPromise = null

async function getTts(onStatus) {
  if (ttsPromise) return ttsPromise
  ttsPromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers')
    env.allowLocalModels = false
    const opts = {}
    if (onStatus) opts.progress_callback = (p) => {
      if (p && p.status === 'progress' && p.file) onStatus({ phase: 'download', file: p.file, progress: Math.round(p.progress || 0) })
      else if (p && p.status) onStatus({ phase: p.status })
    }
    return pipeline('text-to-speech', 'Xenova/mms-tts-vie', opts)
  })()
  return ttsPromise
}

// Float32 [-1,1] -> WAV PCM 16-bit mono
function encodeWav(float32, sr) {
  const n = float32.length
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8)
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34)
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2)
  }
  return buf
}

async function synthesize(text, outWav, { onStatus } = {}) {
  const tts = await getTts(onStatus)
  if (onStatus) onStatus({ phase: 'synthesize' })
  const out = await tts(String(text).trim())
  fs.writeFileSync(outWav, encodeWav(out.audio, out.sampling_rate))
  return { path: outWav, duration: out.audio.length / out.sampling_rate }
}

module.exports = { synthesize }

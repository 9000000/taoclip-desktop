// ============================================================
//  Long tieng Google Cloud Text-to-Speech (REST API, xac thuc bang API key)
//  Khong them dependency: dung global fetch cua Node 18+ (may user Node 24).
//  Doc: https://cloud.google.com/text-to-speech/docs/reference/rest
// ============================================================
const fs = require('fs')

const BASE = 'https://texttospeech.googleapis.com/v1'

// Phan loai giong theo ten (de UI gom nhom)
function voiceType(name) {
  if (/Chirp3-HD|Chirp-HD|Chirp/i.test(name)) return 'Chirp3-HD'
  if (/Neural2/i.test(name)) return 'Neural2'
  if (/Studio/i.test(name)) return 'Studio'
  if (/Wavenet/i.test(name)) return 'WaveNet'
  if (/Polyglot/i.test(name)) return 'Polyglot'
  if (/Standard/i.test(name)) return 'Standard'
  return 'Khac'
}

// Chirp/Chirp3-HD khong ho tro pitch (Google tra loi 400 neu gui). Bo pitch cho nhom nay.
function supportsPitch(name) {
  return !/Chirp/i.test(name)
}

async function errMsg(res) {
  let detail = ''
  try {
    const j = await res.json()
    detail = (j.error && j.error.message) || JSON.stringify(j)
  } catch (e) {
    detail = await res.text().catch(() => '')
  }
  return `Google TTS ${res.status}: ${detail || res.statusText}`
}

// Liet ke giong doc. langCode rong => tra ve tat ca ngon ngu.
async function listVoices(apiKey, langCode = 'vi-VN') {
  if (!apiKey) throw new Error('Chua co Google API key')
  let url = `${BASE}/voices?key=${encodeURIComponent(apiKey)}`
  if (langCode) url += `&languageCode=${encodeURIComponent(langCode)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(await errMsg(res))
  const data = await res.json()
  const voices = (data.voices || []).map((v) => ({
    name: v.name,
    lang: (v.languageCodes && v.languageCodes[0]) || langCode,
    gender: v.ssmlGender || 'NEUTRAL',
    type: voiceType(v.name)
  }))
  // Sap xep: theo loai (chat luong cao truoc) roi theo ten
  const order = { 'Chirp3-HD': 0, Neural2: 1, Studio: 2, WaveNet: 3, Polyglot: 4, Standard: 5, Khac: 6 }
  voices.sort((a, b) => (order[a.type] - order[b.type]) || a.name.localeCompare(b.name))
  return voices
}

// Chuyen text (hoac SSML) thanh file audio. Tra ve { path }.
// opts: { apiKey, voiceName, langCode, rate, pitch, encoding, ssml }
async function synthesize(text, outFile, opts = {}) {
  const {
    apiKey, voiceName, langCode = 'vi-VN',
    rate = 1.0, pitch = 0.0, encoding = 'MP3', ssml = false
  } = opts
  if (!apiKey) throw new Error('Chua co Google API key')
  if (!voiceName) throw new Error('Chua chon giong doc')

  const audioConfig = { audioEncoding: encoding, speakingRate: rate }
  if (supportsPitch(voiceName)) audioConfig.pitch = pitch

  const body = {
    input: ssml ? { ssml: String(text) } : { text: String(text) },
    voice: { languageCode: langCode, name: voiceName },
    audioConfig
  }
  const res = await fetch(`${BASE}/text:synthesize?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(await errMsg(res))
  const data = await res.json()
  if (!data.audioContent) throw new Error('Google TTS: khong nhan duoc audio')
  fs.writeFileSync(outFile, Buffer.from(data.audioContent, 'base64'))
  return { path: outFile }
}

module.exports = { listVoices, synthesize, voiceType }

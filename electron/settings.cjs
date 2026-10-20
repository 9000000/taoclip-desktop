// ============================================================
//  Cai dat cuc bo (userData). Luu Google TTS API key co MA HOA
//  bang Electron safeStorage (dua tren keychain/DPAPI cua OS).
//  Neu OS khong ho tro safeStorage -> luu base64 (khong an toan, chi de chay).
// ============================================================
const { app, safeStorage } = require('electron')
const path = require('path')
const fs = require('fs')

function file() {
  return path.join(app.getPath('userData'), 'taoclip-settings.json')
}

function readRaw() {
  try { return JSON.parse(fs.readFileSync(file(), 'utf8')) } catch (e) { return {} }
}

function writeRaw(obj) {
  try { fs.writeFileSync(file(), JSON.stringify(obj), 'utf8') } catch (e) {}
}

function setApiKey(key) {
  const obj = readRaw()
  if (!key) {
    delete obj.googleTtsKey
    delete obj.googleTtsKeyEnc
    writeRaw(obj)
    return
  }
  if (safeStorage.isEncryptionAvailable()) {
    obj.googleTtsKey = safeStorage.encryptString(String(key)).toString('base64')
    obj.googleTtsKeyEnc = true
  } else {
    obj.googleTtsKey = Buffer.from(String(key), 'utf8').toString('base64')
    obj.googleTtsKeyEnc = false
  }
  writeRaw(obj)
}

function getApiKey() {
  const obj = readRaw()
  if (!obj.googleTtsKey) return ''
  try {
    const buf = Buffer.from(obj.googleTtsKey, 'base64')
    if (obj.googleTtsKeyEnc && safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(buf)
    return buf.toString('utf8')
  } catch (e) { return '' }
}

function hasApiKey() { return !!readRaw().googleTtsKey }

module.exports = { setApiKey, getApiKey, hasApiKey }

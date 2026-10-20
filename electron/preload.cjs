const { contextBridge, ipcRenderer, webUtils } = require('electron')

// Cau noi an toan giua UI (React) va Node/FFmpeg (main process).
// UI chi goi duoc dung nhung ham duoc khai bao o day.
contextBridge.exposeInMainWorld('taoclip', {
  openVideo: () => ipcRenderer.invoke('dialog:openVideo'),
  getEncoder: () => ipcRenderer.invoke('system:encoder'),
  openVideos: () => ipcRenderer.invoke('dialog:openVideos'),
  openImages: () => ipcRenderer.invoke('dialog:openImages'),
  saveProject: (data) => ipcRenderer.invoke('project:save', data),
  openProject: () => ipcRenderer.invoke('project:open'),
  relinkMedia: (kind) => ipcRenderer.invoke('dialog:relinkMedia', kind),
  // Lay duong dan that cua file keo-tha (Electron 32+ da go File.path)
  getDroppedPath: (file) => webUtils.getPathForFile(file),
  probe: (filePath) => ipcRenderer.invoke('video:probe', filePath),
  thumbnails: (filePath, count) => ipcRenderer.invoke('video:thumbnails', filePath, count),
  waveform: (filePath) => ipcRenderer.invoke('video:waveform', filePath),
  detectSilence: (filePath, opts) => ipcRenderer.invoke('video:detectSilence', filePath, opts),
  generateCaptions: (filePath, opts) => ipcRenderer.invoke('captions:generate', filePath, opts),
  onCaptionProgress: (cb) => {
    const handler = (_e, s) => cb(s)
    ipcRenderer.on('captions:progress', handler)
    return () => ipcRenderer.removeListener('captions:progress', handler)
  },
  openAudio: () => ipcRenderer.invoke('dialog:openAudio'),
  generateTTS: (text, opts) => ipcRenderer.invoke('tts:generate', text, opts),
  getVoices: (langCode) => ipcRenderer.invoke('tts:voices', langCode),
  setApiKey: (key) => ipcRenderer.invoke('settings:setApiKey', key),
  hasApiKey: () => ipcRenderer.invoke('settings:hasApiKey'),
  onTtsProgress: (cb) => {
    const handler = (_e, s) => cb(s)
    ipcRenderer.on('tts:progress', handler)
    return () => ipcRenderer.removeListener('tts:progress', handler)
  },
  downloadVideo: (url) => ipcRenderer.invoke('dl:video', url),
  onDlProgress: (cb) => {
    const handler = (_e, s) => cb(s)
    ipcRenderer.on('dl:progress', handler)
    return () => ipcRenderer.removeListener('dl:progress', handler)
  },
  replaceBg: (opts) => ipcRenderer.invoke('ai:replaceBg', opts),
  faceSwap: (opts) => ipcRenderer.invoke('ai:faceSwap', opts),
  openFaceImage: () => ipcRenderer.invoke('dialog:openFaceImage'),
  onFaceProgress: (cb) => {
    const handler = (_e, s) => cb(s)
    ipcRenderer.on('face:progress', handler)
    return () => ipcRenderer.removeListener('face:progress', handler)
  },
  onAiProgress: (cb) => {
    const handler = (_e, s) => cb(s)
    ipcRenderer.on('ai:progress', handler)
    return () => ipcRenderer.removeListener('ai:progress', handler)
  },
  redub: (payload) => ipcRenderer.invoke('redub:generate', payload),
  onRedubProgress: (cb) => {
    const handler = (_e, s) => cb(s)
    ipcRenderer.on('redub:progress', handler)
    return () => ipcRenderer.removeListener('redub:progress', handler)
  },
  showInFolder: (p) => ipcRenderer.invoke('shell:showInFolder', p),
  saveVideo: (defaultName) => ipcRenderer.invoke('dialog:saveVideo', defaultName),
  exportVideo: (opts) => ipcRenderer.invoke('video:export', opts),
  cancelExport: (jobId) => ipcRenderer.invoke('export:cancel', jobId),
  onExportProgress: (cb) => {
    const handler = (_e, pct) => cb(pct)
    ipcRenderer.on('video:export:progress', handler)
    return () => ipcRenderer.removeListener('video:export:progress', handler)
  },
  onExportStage: (cb) => {
    const handler = (_e, name) => cb(name)
    ipcRenderer.on('video:export:stage', handler)
    return () => ipcRenderer.removeListener('video:export:stage', handler)
  }
})

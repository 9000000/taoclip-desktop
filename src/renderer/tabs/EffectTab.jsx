import React, { useState } from 'react'
import { ImageIcon, ChevronDown, ChevronRight } from 'lucide-react'
import { useI18n } from '../i18n.jsx'

const BG_COLORS = ['#00c853', '#3a7afe', '#ffd600', '#ff4081', '#ffffff', '#000000']

function Sec({ id, title, acc, setAcc, children }) {
  const on = !!acc[id]
  return (
    <div className={`acc ${on ? 'open' : ''}`}>
      <button className="acc-head" onClick={() => setAcc((a) => ({ ...a, [id]: !a[id] }))}>
        {on ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<span>{title}</span>
      </button>
      {on && <div className="acc-body">{children}</div>}
    </div>
  )
}

// Tab Hieu ung: doi nen (RVM) + doi khuon mat (insightface), ca hai chay local (ONNX).
// Ap dung cho CLIP VIDEO dang chon; ket qua thay clip trong timeline (undo duoc).
export default function EffectTab({
  hasClips, selectedClip, selIsImage,
  aiBusy, aiStatus, applyReplaceBg, pickBgImage,
  faceBusy, faceStatus, applyFaceSwap, pickFaceImage
}) {
  const { t } = useI18n()
  const [acc, setAcc] = useState({ bg: true, face: false })
  // --- doi nen ---
  const [mode, setMode] = useState('blur')
  const [color, setColor] = useState('#00c853')
  const [img, setImg] = useState(null)
  // --- doi mat ---
  const [faceImg, setFaceImg] = useState(null)
  const [consent, setConsent] = useState(false)

  const ready = !!selectedClip && !selIsImage
  const busy = aiBusy || faceBusy
  const canBg = ready && !busy && (mode !== 'image' || !!img)
  const bg = mode === 'color' ? { type: 'color', color } : mode === 'image' ? { type: 'image', path: img } : { type: 'blur' }
  const canFace = ready && !busy && !!faceImg && consent

  return (
    <div className="cc-cap">
      {!ready && <small className="cap-hint">⚠ {hasClips ? (selIsImage ? t('ai_bg_video_only') : t('select_clip')) : t('drop_title')}</small>}

      <Sec id="bg" title={t('ai_bg_title')} acc={acc} setAcc={setAcc}>
        <small className="cap-hint">{t('ai_bg_hint')}</small>
        <label className="vlbl">{t('ai_bg_mode')}</label>
        <div className="seg">
          <button className={mode === 'blur' ? 'on' : ''} onClick={() => setMode('blur')} disabled={busy}>{t('ai_bg_blur')}</button>
          <button className={mode === 'color' ? 'on' : ''} onClick={() => setMode('color')} disabled={busy}>{t('ai_bg_color')}</button>
          <button className={mode === 'image' ? 'on' : ''} onClick={() => setMode('image')} disabled={busy}>{t('ai_bg_image')}</button>
        </div>
        {mode === 'color' && (
          <div className="key-row" style={{ alignItems: 'center' }}>
            {BG_COLORS.map((c) => (
              <button key={c} className="swatch" style={{ background: c, outline: color === c ? '2px solid #3a7afe' : 'none' }}
                onClick={() => setColor(c)} disabled={busy} title={c} />
            ))}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} disabled={busy} />
          </div>
        )}
        {mode === 'image' && (
          <button className="cc-import" onClick={async () => { const p = await pickBgImage(); if (p) setImg(p) }} disabled={busy}>
            <ImageIcon size={14} /> {img ? img.split(/[\\/]/).pop() : t('ai_bg_pick')}
          </button>
        )}
        <button className="cc-auto" disabled={!canBg} onClick={() => applyReplaceBg(bg)}>
          {aiBusy ? (aiStatus || '...') : t('ai_bg_apply')}
        </button>
        {!aiBusy && aiStatus && <small className="cap-hint">{aiStatus}</small>}
        <small className="cap-hint">{t('ai_local_hint')}</small>
      </Sec>

      <Sec id="face" title={t('face_title')} acc={acc} setAcc={setAcc}>
        <small className="cap-hint">{t('face_hint')}</small>
        <label className="vlbl">{t('face_source')}</label>
        <button className="cc-import" onClick={async () => { const p = await pickFaceImage(); if (p) setFaceImg(p) }} disabled={busy}>
          <ImageIcon size={14} /> {faceImg ? faceImg.split(/[\\/]/).pop() : t('face_pick')}
        </button>
        {faceImg && <img className="face-preview" src={'file:///' + encodeURI(faceImg.replace(/\\/g, '/'))} alt="" />}
        <label className="chk consent"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy} /> {t('face_consent')}</label>
        <button className="cc-auto" disabled={!canFace} onClick={() => applyFaceSwap(faceImg)}>
          {faceBusy ? (faceStatus || '...') : t('face_apply')}
        </button>
        {!faceBusy && faceStatus && <small className="cap-hint">{faceStatus}</small>}
        <small className="cap-hint">{t('face_dl_hint')}</small>
        <small className="cap-hint">⚠ {t('face_ai_label')}</small>
      </Sec>
    </div>
  )
}

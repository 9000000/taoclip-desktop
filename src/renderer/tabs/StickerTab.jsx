import React from 'react'
import { X } from 'lucide-react'
import { useI18n } from '../i18n.jsx'

const EMOJIS = ['😀', '😂', '😍', '😎', '🥰', '😱', '🤔', '👍', '👏', '🙌', '🔥', '✨', '⭐', '❤️', '💯', '🎉', '🎬', '📌', '✅', '❌', '⚡', '💡', '🚀', '🏆']

// Tab Sticker: luoi emoji + danh sach sticker da them
export default function StickerTab({ hasClips, overlays, selOv, setSelOv, addEmoji, updateOverlay, delOverlay, seekGlobal, current, beginEdit = () => {} }) {
  const { t } = useI18n()
  return (
    <div className="cc-cap">
      <label className="grp-lbl">{t('sticker_pick')}</label>
      <div className="emoji-grid">
        {EMOJIS.map((em) => (
          <button key={em} className="emoji-btn" onClick={() => addEmoji(em)} disabled={!hasClips}>{em}</button>
        ))}
      </div>
      <div className="cap-list">
        {overlays.filter((o) => o.type === 'emoji').map((o) => (
          <div key={o.id} className={`ov-row ${selOv === o.id ? 'on' : ''}`} onClick={() => { setSelOv(o.id); seekGlobal(o.start) }}>
            <span className="ov-em">{o.text}</span>
            <button className="cap-del" onClick={(e) => { e.stopPropagation(); delOverlay(o.id) }}><X size={13} /></button>
            <div className="ov-sub">
              <span>{t('ov_size')}</span><input type="range" min={0.05} max={0.4} step={0.01} value={o.size} onMouseDown={beginEdit} onFocus={beginEdit} onChange={(e) => updateOverlay(o.id, { size: Number(e.target.value) })} />
              <button onClick={(e) => { e.stopPropagation(); beginEdit(); updateOverlay(o.id, { start: current }) }}>⏱{t('trim_in')}</button>
              <button onClick={(e) => { e.stopPropagation(); beginEdit(); updateOverlay(o.id, { end: current }) }}>⏱{t('trim_out')}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

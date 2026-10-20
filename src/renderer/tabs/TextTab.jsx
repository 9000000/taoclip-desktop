import React from 'react'
import { X } from 'lucide-react'
import { useI18n } from '../i18n.jsx'
import { fmt } from '../utils.js'

// Tab Van ban: phu de tu dong (Whisper) + chu/tieu de overlay
export default function TextTab({
  hasClips, anyAudio, captions, setCaptions, capBusy, capStatus, capLang, setCapLang,
  burnCaptions, setBurnCaptions, activeCaption, genCaptions, editCaption, delCaption,
  overlays, selOv, setSelOv, addText, updateOverlay, delOverlay, seekGlobal, current,
  beginEdit = () => {}
}) {
  const { t } = useI18n()
  return (
    <div className="cc-cap">
      <button className="cc-import" onClick={genCaptions} disabled={!hasClips || capBusy || !anyAudio}>
        {capBusy ? capStatus || '...' : (captions.length ? t('cap_regenerate') : t('cap_generate'))}
      </button>
      {!anyAudio && hasClips && <small className="cap-warn">{t('cap_no_audio')}</small>}
      <div className="cap-lang">
        <label>{t('cap_lang')}</label>
        <select value={capLang} onChange={(e) => setCapLang(e.target.value)} disabled={capBusy}>
          <option value="vietnamese">{t('cap_lang_vi')}</option>
          <option value="english">{t('cap_lang_en')}</option>
          <option value="">{t('cap_lang_auto')}</option>
        </select>
      </div>
      <small className="cap-hint">{t('cap_hint')}</small>
      {captions.length > 0 && (
        <>
          <label className="chk"><input type="checkbox" checked={burnCaptions} onChange={(e) => setBurnCaptions(e.target.checked)} /> {t('cap_burn')}</label>
          <div className="cap-head"><span>{t('cap_count', { n: captions.length })}</span><button className="cap-clear" onClick={() => { beginEdit(); setCaptions([]) }}>{t('cap_clear')}</button></div>
          <div className="cap-list">
            {captions.map((c, i) => (
              <div key={i} className={`cap-row ${activeCaption === c ? 'on' : ''}`}>
                <span className="cap-t" onClick={() => seekGlobal(c.start)}>{fmt(c.start).slice(0, 5)}</span>
                <input value={c.text} onFocus={beginEdit} onChange={(e) => editCaption(i, e.target.value)} />
                <button className="cap-del" onClick={() => delCaption(i)}><X size={13} /></button>
              </div>
            ))}
          </div>
        </>
      )}
      <label className="grp-lbl">{t('ov_text_title')}</label>
      <button className="cc-auto" onClick={addText} disabled={!hasClips}>{t('ov_add_text')}</button>
      <div className="cap-list">
        {overlays.filter((o) => o.type === 'text').map((o) => (
          <div key={o.id} className={`ov-row ${selOv === o.id ? 'on' : ''}`} onClick={() => { setSelOv(o.id); seekGlobal(o.start) }}>
            <input value={o.text} onFocus={beginEdit} onChange={(e) => updateOverlay(o.id, { text: e.target.value })} />
            <input type="color" value={o.color || '#ffffff'} onFocus={beginEdit} onChange={(e) => updateOverlay(o.id, { color: e.target.value })} title={t('ov_color')} />
            <button className="cap-del" onClick={(e) => { e.stopPropagation(); delOverlay(o.id) }}><X size={13} /></button>
            <div className="ov-sub">
              <span>{t('ov_size')}</span><input type="range" min={0.03} max={0.2} step={0.005} value={o.size} onMouseDown={beginEdit} onFocus={beginEdit} onChange={(e) => updateOverlay(o.id, { size: Number(e.target.value) })} />
              <button onClick={(e) => { e.stopPropagation(); beginEdit(); updateOverlay(o.id, { start: current }) }} title={t('ov_set_in')}>⏱{t('trim_in')}</button>
              <button onClick={(e) => { e.stopPropagation(); beginEdit(); updateOverlay(o.id, { end: current }) }} title={t('ov_set_out')}>⏱{t('trim_out')}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

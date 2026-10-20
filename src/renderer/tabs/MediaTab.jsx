import React, { useState } from 'react'
import { Link } from 'lucide-react'
import { useI18n } from '../i18n.jsx'
import { fmt, fileUrl, isImg, clipOut } from '../utils.js'

// Tab Media: nhap video/anh + tai tu link (YouTube/TikTok) + luoi thumbnail
export default function MediaTab({ clips, selId, setSelId, layout, seekGlobal, onImport, onImportImages,
  dlBusy, dlStatus, downloadFromUrl }) {
  const { t } = useI18n()
  const [url, setUrl] = useState('')
  const go = async () => { if (url.trim() && !dlBusy && await downloadFromUrl(url.trim())) setUrl('') }
  return (
    <>
      <div className="cc-import-row">
        <button className="cc-import" onClick={onImport}>{t('import_video')}</button>
        <button className="cc-import alt" onClick={onImportImages}>{t('import_image')}</button>
      </div>
      <div className="key-row" style={{ marginBottom: 6 }}>
        <input className="cc-key" value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder={t('dl_ph')} disabled={dlBusy} onKeyDown={(e) => { if (e.key === 'Enter') go() }} />
        <button className="cc-mini" onClick={go} disabled={dlBusy || !url.trim()} title={t('dl_btn')}>
          {dlBusy ? '...' : <Link size={14} />}
        </button>
      </div>
      {dlStatus && <small className="cap-hint">{dlStatus}</small>}
      <small className="cap-hint" style={{ marginBottom: 10 }}>{t('dl_hint')}</small>
      <div className="cc-grid">
        {clips.map((m) => (
          <div key={m.id} className={`cc-card ${selId === m.id ? 'on' : ''}`} onClick={() => { setSelId(m.id); seekGlobal((layout.find((s) => s.id === m.id) || {}).start || 0) }}>
            <div className="thumb" style={m.thumbs?.[0] ? { backgroundImage: `url(${fileUrl(m.thumbs[0])})` } : undefined}>{!m.thumbs?.length && '🎬'}{isImg(m) && <em className="badge">IMG</em>}<span>{fmt(isImg(m) ? clipOut(m) : m.src.duration)}</span></div>
            <div className="nm" title={m.name}>{m.name}</div>
          </div>
        ))}
        {!clips.length && <div className="cc-hint">{t('drop_hint')}<br />{t('drop_hint2')}</div>}
      </div>
    </>
  )
}

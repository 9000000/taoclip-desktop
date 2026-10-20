import React from 'react'
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { useI18n } from './i18n.jsx'
import { fmt, isImg, clipOut, SPEEDS, SLIDE_DURS } from './utils.js'

// Bang thuoc tinh ben phai: ti le khung, clip dang chon, che do xuat,
// chuyen canh, GPU, auto-cut, xuat them ti le
export default function Inspector({
  width, hasClips, single, ratio, setRatio, safeZone, setSafeZone,
  selectedClip, moveClip, deleteClip, updateClip, pushHistory, setAllSlideDur,
  onDetectSilence, busy, canDetectSilence, autoInfo, autoCut, setAutoCut, status
}) {
  const { t } = useI18n()
  const style = width ? { width } : undefined
  if (!hasClips) return <aside className="cc-insp" style={style}><div className="cc-soon"><div className="big">⚙️</div>{t('select_clip')}<small>{t('props_here')}</small></div></aside>
  return (
    <aside className="cc-insp" style={style}>
      <div className="sec-title">{t('clip_props')}</div>
      <div className="grp">
        <label>{t('aspect')}</label>
        <div className="seg wrap">
          {['9:16', '1:1', '4:5', '16:9', 'original'].map((r) => (<button key={r} className={ratio === r ? 'on' : ''} onClick={() => setRatio(r)}>{r === 'original' ? t('ratio_original') : r}</button>))}
        </div>
        <label className="chk"><input type="checkbox" checked={safeZone} onChange={(e) => setSafeZone(e.target.checked)} /> {t('safezone')}</label>
      </div>

      {selectedClip && (
        <div className="grp">
          <label>{t('clip_selected')}: <b>{selectedClip.name}</b></label>
          <div className="seg"><button onClick={() => moveClip(selectedClip.id, -1)} title={t('move_left')}><ChevronLeft size={15} /></button><button onClick={() => moveClip(selectedClip.id, 1)} title={t('move_right')}><ChevronRight size={15} /></button><button onClick={() => deleteClip(selectedClip.id)} title={t('del_clip')}><Trash2 size={15} /></button></div>
          {isImg(selectedClip) ? (
            <>
              <label style={{ marginTop: 8 }}>{t('slide_dur')} <b>{clipOut(selectedClip).toFixed(1)}s</b></label>
              <div className="seg wrap">{SLIDE_DURS.map((s) => <button key={s} className={Math.abs(clipOut(selectedClip) - s) < 0.05 ? 'on' : ''} onClick={() => { pushHistory(); updateClip(selectedClip.id, { in: 0, out: s }) }}>{s}s</button>)}</div>
              <input type="range" min={0.5} max={15} step={0.5} value={clipOut(selectedClip)} onChange={(e) => updateClip(selectedClip.id, { in: 0, out: Number(e.target.value) })} onMouseDown={pushHistory} />
              <button className="cc-auto" onClick={() => setAllSlideDur(clipOut(selectedClip))}>{t('apply_all')}</button>
              <label className="chk"><input type="checkbox" checked={selectedClip.kenBurns !== false} onChange={(e) => { pushHistory(); updateClip(selectedClip.id, { kenBurns: e.target.checked }) }} /> {t('kenburns')}</label>
            </>
          ) : (
            <>
              <label style={{ marginTop: 8 }}>{t('speed')} <b>{(selectedClip.speed || 1).toFixed(2)}×</b></label>
              <div className="seg wrap">{SPEEDS.map((s) => <button key={s} className={selectedClip.speed === s ? 'on' : ''} onClick={() => { pushHistory(); updateClip(selectedClip.id, { speed: s }) }}>{s}×</button>)}</div>
              <div className="kv"><span>{t('trim_in')}</span><b>{fmt(selectedClip.in)}</b></div>
              <div className="kv"><span>{t('trim_out')}</span><b>{fmt(selectedClip.out)}</b></div>
              <div className="kv"><span>{t('trim_len')}</span><b>{fmt(clipOut(selectedClip))}</b></div>
            </>
          )}
        </div>
      )}

      {single && (
        <div className="grp">
          <label>{t('auto')}</label>
          <button className="cc-auto" onClick={onDetectSilence} disabled={busy || !canDetectSilence}>{busy ? t('analyzing') : t('remove_silence')}</button>
          {autoInfo && (<label className="chk"><input type="checkbox" checked={autoCut} onChange={(e) => setAutoCut(e.target.checked)} /> {t('removed_segs', { n: autoInfo.removed, s: autoInfo.saved.toFixed(1) })}</label>)}
        </div>
      )}

      {status && <p className="status">{status}</p>}
    </aside>
  )
}

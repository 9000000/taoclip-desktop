import React from 'react'
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { useI18n } from './i18n.jsx'
import { fmt, isImg, clipOut, SPEEDS, SLIDE_DURS } from './utils.js'

// Bang thuoc tinh ben phai: ti le khung, clip dang chon, che do xuat,
// chuyen canh, GPU, auto-cut, xuat them ti le
export default function Inspector({
  width, hasClips, single, ratio, setRatio, safeZone, setSafeZone,
  selectedClip, moveClip, deleteClip, updateClip, pushHistory, beginEdit, endEdit, setAllSlideDur,
  onDetectSilence, busy, canDetectSilence, autoInfo, autoCut, setAutoCut, status,
  silenceParams, updateSilenceAnalysis, applySilenceAnalysis, onPreviewSilence, silenceStale
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
          <small className="cap-hint">Vùng hướng dẫn chỉ hiển thị trong preview, không xuất vào video.</small>
      </div>

      {selectedClip && (
        <div className="grp">
          <label>{t('clip_selected')}: <b>{selectedClip.name}</b></label>
          <div className="seg"><button onClick={() => moveClip(selectedClip.id, -1)} title={t('move_left')}><ChevronLeft size={15} /></button><button onClick={() => moveClip(selectedClip.id, 1)} title={t('move_right')}><ChevronRight size={15} /></button><button onClick={() => deleteClip(selectedClip.id)} title={t('del_clip')}><Trash2 size={15} /></button></div>
          {isImg(selectedClip) ? (
            <>
              <label style={{ marginTop: 8 }}>{t('slide_dur')} <b>{clipOut(selectedClip).toFixed(1)}s</b></label>
              <div className="seg wrap">{SLIDE_DURS.map((s) => <button key={s} className={Math.abs(clipOut(selectedClip) - s) < 0.05 ? 'on' : ''} disabled={Math.abs(clipOut(selectedClip) - s) < 0.05} onClick={() => { pushHistory(); updateClip(selectedClip.id, { in: 0, out: s }) }}>{s}s</button>)}</div>
              <input type="range" min={0.5} max={15} step={0.5} value={clipOut(selectedClip)} onChange={(e) => updateClip(selectedClip.id, { in: 0, out: Number(e.target.value) })} onPointerDown={beginEdit} onFocus={beginEdit} onBlur={endEdit} />
              <button className="cc-auto" onClick={() => setAllSlideDur(clipOut(selectedClip))}>{t('apply_all')}</button>
              <label className="chk"><input type="checkbox" checked={selectedClip.kenBurns !== false} onChange={(e) => { pushHistory(); updateClip(selectedClip.id, { kenBurns: e.target.checked }) }} /> {t('kenburns')}</label>
            </>
          ) : (
            <>
              <label style={{ marginTop: 8 }}>{t('speed')} <b>{(selectedClip.speed || 1).toFixed(2)}×</b></label>
              <div className="seg wrap">{SPEEDS.map((s) => <button key={s} className={selectedClip.speed === s ? 'on' : ''} disabled={selectedClip.speed === s} onClick={() => { pushHistory(); updateClip(selectedClip.id, { speed: s }) }}>{s}×</button>)}</div>
              <label className="num-field"><span>{t('speed')} (×)</span><input type="number" min="0.05" max="16" step="0.05" value={selectedClip.speed || 1} onFocus={beginEdit} onBlur={endEdit} onChange={(e) => {
                if (e.target.value === '') return
                const value = Number(e.target.value)
                if (Number.isFinite(value) && value >= 0.05 && value <= 16) updateClip(selectedClip.id, { speed: value })
              }} /></label>
              <label className="num-field"><span>{t('trim_in')} (s)</span><input type="number" min="0" max={Math.max(0, selectedClip.out - 0.1)} step="0.01" value={selectedClip.in} onFocus={beginEdit} onBlur={endEdit} onChange={(e) => {
                if (e.target.value === '') return
                const value = Number(e.target.value)
                if (Number.isFinite(value) && value >= 0 && value <= selectedClip.out - 0.1) updateClip(selectedClip.id, { in: value })
              }} /></label>
              <label className="num-field"><span>{t('trim_out')} (s)</span><input type="number" min={selectedClip.in + 0.1} max={selectedClip.src?.duration || selectedClip.out} step="0.01" value={selectedClip.out} onFocus={beginEdit} onBlur={endEdit} onChange={(e) => {
                if (e.target.value === '') return
                const value = Number(e.target.value)
                const max = selectedClip.src?.duration || selectedClip.out
                if (Number.isFinite(value) && value >= selectedClip.in + 0.1 && value <= max) updateClip(selectedClip.id, { out: value })
              }} /></label>
              <div className="kv"><span>{t('trim_len')}</span><b>{fmt(clipOut(selectedClip))}</b></div>
            </>
          )}
          <label style={{ marginTop: 10 }}>Cách đặt hình trong khung (riêng clip)</label>
          <div className="seg"><button className={(selectedClip.cropMode || 'fit') === 'fit' ? 'on' : ''} disabled={(selectedClip.cropMode || 'fit') === 'fit'} onClick={() => { pushHistory(); updateClip(selectedClip.id, { cropMode: 'fit' }) }}>Fit · giữ trọn hình</button>
            <button className={selectedClip.cropMode === 'fill' ? 'on' : ''} disabled={selectedClip.cropMode === 'fill'} onClick={() => { pushHistory(); updateClip(selectedClip.id, { cropMode: 'fill' }) }}>Fill · lấp đầy khung</button></div>
          {selectedClip.cropMode === 'fill' && <>
            <label className="num-field"><span>Tâm crop ngang</span><input type="range" min="0" max="1" step="0.01" value={selectedClip.cropX ?? 0.5} onPointerDown={beginEdit} onFocus={beginEdit} onBlur={endEdit} onChange={(e) => updateClip(selectedClip.id, { cropX: Number(e.target.value) })} /></label>
            <label className="num-field"><span>Tâm crop dọc</span><input type="range" min="0" max="1" step="0.01" value={selectedClip.cropY ?? 0.5} onPointerDown={beginEdit} onFocus={beginEdit} onBlur={endEdit} onChange={(e) => updateClip(selectedClip.id, { cropY: Number(e.target.value) })} /></label>
          </>}
        </div>
      )}

      {single && (
        <div className="grp">
          <label>{t('auto')}</label>
          <label className="num-field"><span>Ngưỡng âm thanh</span><input type="number" min="-60" max="-10" step="1" value={silenceParams.threshold} disabled={busy} onFocus={beginEdit} onBlur={endEdit} onChange={(event) => updateSilenceAnalysis({ threshold: Math.min(-10, Math.max(-60, Number(event.target.value) || -30)) })} /> dB</label>
          <label className="num-field"><span>Im lặng tối thiểu</span><input type="number" min="0.1" max="5" step="0.1" value={silenceParams.minSilence} disabled={busy} onFocus={beginEdit} onBlur={endEdit} onChange={(event) => updateSilenceAnalysis({ minSilence: Math.min(5, Math.max(0.1, Number(event.target.value) || 0.1)) })} /> s</label>
          <label className="num-field"><span>Giữ mép mỗi khoảng</span><input type="number" min="0" max="1" step="0.01" value={silenceParams.pad} disabled={busy} onFocus={beginEdit} onBlur={endEdit} onChange={(event) => updateSilenceAnalysis({ pad: Math.min(1, Math.max(0, Number(event.target.value) || 0)) })} /> s</label>
          <button className="cc-auto" onClick={onDetectSilence} disabled={busy || !canDetectSilence}>{busy ? t('analyzing') : t('remove_silence')}</button>
          {autoInfo && <>
            <p className="cap-hint">Giữ {autoInfo.kept?.toFixed(2) ?? '0.00'}s · bỏ {autoInfo.saved.toFixed(2)}s · nguồn {autoInfo.duration.toFixed(2)}s. Thay đổi ngưỡng rồi phân tích lại để cập nhật kết quả.</p>
            {autoInfo.options && (autoInfo.options.noise !== `${silenceParams.threshold}dB` || autoInfo.options.minSilence !== silenceParams.minSilence) &&
              <small className="cap-hint">Thông số phân tích đã đổi; hãy phân tích lại trước khi áp dụng.</small>}
            <small className="cap-hint">Các đoạn đang giữ: {autoInfo.keep?.length ? autoInfo.keep.map((range) => `${range.start.toFixed(2)}–${range.end.toFixed(2)}s`).join(' · ') : 'không có'}</small>
            {autoInfo.keep?.map((range, index) => <button key={`keep-${index}`} className="cc-mini" onClick={() => onPreviewSilence?.(range.start)}>Tới đoạn giữ {index + 1} ({range.start.toFixed(2)}–{range.end.toFixed(2)}s)</button>)}
            {autoInfo.silences?.map((silence, index) => <div className="bg-box" key={`${silence.start}-${index}`}>
              <label className="chk"><input type="checkbox" checked={silence.remove !== false} onChange={(event) => { pushHistory(); updateSilenceAnalysis({ remove: event.target.checked }, index) }} /> Bỏ im lặng {index + 1}</label>
              <div className="key-row">
                <label>Từ <input type="number" min="0" max={autoInfo.duration} step="0.01" value={silence.start} onFocus={beginEdit} onBlur={endEdit} onChange={(event) => updateSilenceAnalysis({ start: Math.max(0, Number(event.target.value) || 0) }, index)} /></label>
                <label>Đến <input type="number" min="0" max={autoInfo.duration} step="0.01" value={silence.end} onFocus={beginEdit} onBlur={endEdit} onChange={(event) => updateSilenceAnalysis({ end: Math.max(silence.start, Number(event.target.value) || 0) }, index)} /></label>
                <button className="cc-mini" onClick={() => onPreviewSilence?.(silence.start)}>Tới khoảng này</button>
              </div>
            </div>)}
            {silenceStale && <small className="cap-hint">Clip, trim hoặc tốc độ đã đổi; hãy phân tích lại trước khi áp dụng.</small>}
            {!autoInfo.keep?.length && <small className="cap-hint">Không còn đoạn có tiếng để giữ. Hãy bỏ chọn khoảng im lặng phù hợp hoặc chỉnh ngưỡng trước khi áp dụng.</small>}
            <button className="cc-auto" disabled={!autoInfo.keep?.length || silenceStale || autoInfo.options?.noise !== `${silenceParams.threshold}dB` || autoInfo.options?.minSilence !== silenceParams.minSilence} onClick={applySilenceAnalysis}>Áp dụng các khoảng đã chọn</button>
            {autoCut && <label className="chk"><input type="checkbox" checked onChange={() => setAutoCut(false)} /> Đang cắt theo danh sách đoạn giữ</label>}
          </>}
        </div>
      )}

      {status && <p className="status">{status}</p>}
    </aside>
  )
}

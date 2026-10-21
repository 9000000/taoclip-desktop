import React, { useState } from 'react'
import { X, ChevronDown, ChevronRight } from 'lucide-react'
import { useI18n } from '../i18n.jsx'
import { SLIDE_DURS } from '../utils.js'

// Muc gap/mo cho tab Am thanh (tab dai, chia section de de quet)
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

// Tab Am thanh: nhac nen + long tieng AI (2 track DOC LAP, tron cung luc khi xuat)
export default function AudioTab({
  hasClips, anyAudio, imageCount,
  // slideshow sync
  syncMode, setSyncMode, bgDur, setSlideDur, setAllSlideDur, fitSlideDuration = 0, fitMusicDuration = 0, hasFitMusic = false, timelineDuration = 0,
  // 2 track
  music, setMusic, voice, setVoice, musicVol, setMusicVol, voiceVol, setVoiceVol,
  origVolume, setOrigVolume, bgLoop, setBgLoop, ducking, setDucking, importMusic,
  audioItems = [], addAudioItems, updateAudioItem, removeAudioItem,
  // TTS
  ttsText, setTtsText, ttsBusy, ttsStatus, ttsEngine, setTtsEngine,
  ttsVoice, setTtsVoice, ttsVoices, ttsRate, setTtsRate, ttsPitch, setTtsPitch,
  apiKeyInput, setApiKeyInput, hasKey, apiKeyStatus = {}, removeApiKey = () => {}, voicesLoading,
  localTtsModel, refreshLocalTtsModel = () => {},
  saveApiKey, loadVoices, previewVoice, genTTS, ttsPreviewRef,
  // doi giong video (re-dub)
  redubBusy, redubStatus, redubVideo, redubSegments = [], setRedubSegments = () => {}, generateRedubSegment = () => {},
  applyRedub = () => {}, previewRedubSegment = () => {}, redubKeepOriginal = false, setRedubKeepOriginal = () => {}, beginEdit = () => {}, endEdit = () => {}, pushHistory = () => {}
}) {
  const { t } = useI18n()
  const [acc, setAcc] = useState({ music: true, tts: true, redub: false, slide: true })
  const hasMusicTrack = !!music || audioItems.some((item) => item.track === 'music')
  const hasVoiceTrack = !!voice || audioItems.some((item) => item.track === 'voice')
  const selectedVoice = ttsVoices.find((v) => v.name === ttsVoice)
  return (
    <div className="cc-cap">
      <small className="cap-hint">{t('audio_hint')}</small>

      {imageCount > 0 && (
        <Sec id="slide" title={t('slide_sync')} acc={acc} setAcc={setAcc}>
          <div className="seg">
            <button className={syncMode === 'fit' ? 'on' : ''} onClick={() => setSyncMode('fit')} disabled={!hasFitMusic || !fitMusicDuration}>{t('sync_fit')}</button>
            <button className={syncMode === 'fixed' ? 'on' : ''} onClick={() => setSyncMode('fixed')}>{t('sync_fixed')}</button>
          </div>
          {syncMode === 'fit'
            ? <><small className="cap-hint">{hasFitMusic && fitMusicDuration ? t('sync_fit_info', { d: fitMusicDuration.toFixed(1), n: imageCount, p: fitSlideDuration.toFixed(1) }) : t('sync_need_music')}</small>
                {hasFitMusic && fitMusicDuration > 0 && <small className="cap-hint">Canvas: {timelineDuration.toFixed(1)}s · mục tiêu nhạc: {fitMusicDuration.toFixed(1)}s</small>}</>
            : <><label className="vlbl" style={{ marginTop: 6 }}>{t('slide_dur')}</label>
              <div className="seg wrap">{SLIDE_DURS.map((s) => <button key={s} onClick={() => setSlideDur(s)}>{s}s</button>)}</div></>}
        </Sec>
      )}

      <Sec id="music" title={t('audio_music_title')} acc={acc} setAcc={setAcc}>
        <button className="cc-import" onClick={importMusic} disabled={!hasClips}>{t('music_import')}</button>
        {music && (
          <div className="bg-box">
            <div className="bg-name">🎧 {t('bg_added', { name: music.name })}<button className="cap-del" onClick={() => setMusic(null)}><X size={13} /></button></div>
            <label className="vlbl">{t('vol_music')} <b>{Math.round(musicVol * 100)}%</b></label>
            <input type="range" min={0} max={1} step={0.05} value={musicVol} onMouseDown={beginEdit} onFocus={beginEdit} onBlur={endEdit} onChange={(e) => setMusicVol(Number(e.target.value))} />
            <label className="chk"><input type="checkbox" checked={bgLoop} onChange={(e) => { pushHistory(); setBgLoop(e.target.checked) }} /> {t('bg_loop')}</label>
          </div>
        )}
      </Sec>

      <Sec id="audio-items" title="Các đoạn âm thanh trên timeline" acc={acc} setAcc={setAcc}>
        <div className="cc-import-row">
          <button className="cc-import" onClick={() => addAudioItems('music')} disabled={!hasClips}>+ Nhiều đoạn nhạc</button>
          <button className="cc-import alt" onClick={() => addAudioItems('voice')} disabled={!hasClips}>+ Nhiều đoạn voice</button>
        </div>
        {audioItems.map((item) => <div className={`cc-audio-item ${item.track}`} key={item.id}>
          <div className="cc-audio-item-head"><strong title={item.path}>{item.name}</strong>
            <button className="cap-del" onClick={() => removeAudioItem(item.id)}><X size={13} /></button></div>
          <label>Vị trí <input type="number" min="0" step="0.1" value={item.start}
            onFocus={beginEdit} onBlur={endEdit} onChange={(event) => updateAudioItem(item.id, { start: Math.max(0, Number(event.target.value) || 0) })} /> giây</label>
          <label>Trim vào <input type="number" min="0" max={Math.max(0, item.out - 0.05)} step="0.1" value={item.in}
            onFocus={beginEdit} onBlur={endEdit} onChange={(event) => updateAudioItem(item.id, { in: Math.min(item.out - 0.05, Math.max(0, Number(event.target.value) || 0)) })} /> giây</label>
          <label>Trim ra <input type="number" min={item.in + 0.05} max={item.sourceDuration || 600} step="0.1" value={item.out}
            onFocus={beginEdit} onBlur={endEdit} onChange={(event) => updateAudioItem(item.id, { out: Math.min(item.sourceDuration || 600, Math.max(item.in + 0.05, Number(event.target.value) || item.in + 0.05)) })} /> giây</label>
          <label>Gain <b>{Math.round(item.gain * 100)}%</b></label>
          <input type="range" min="0" max="2" step="0.05" value={item.gain} onPointerDown={beginEdit} onFocus={beginEdit} onBlur={endEdit}
            onChange={(event) => updateAudioItem(item.id, { gain: Number(event.target.value) })} />
          <div className="cc-audio-item-fades">
            <label>Fade in <input type="number" min="0" max="10" step="0.1" value={item.fadeIn}
              onFocus={beginEdit} onBlur={endEdit} onChange={(event) => updateAudioItem(item.id, { fadeIn: Math.max(0, Number(event.target.value) || 0) })} /></label>
            <label>Fade out <input type="number" min="0" max="10" step="0.1" value={item.fadeOut}
              onFocus={beginEdit} onBlur={endEdit} onChange={(event) => updateAudioItem(item.id, { fadeOut: Math.max(0, Number(event.target.value) || 0) })} /></label>
          </div>
          <div className="cc-audio-item-fades">
            <label><input type="checkbox" checked={item.loop} onChange={(event) => { pushHistory(); updateAudioItem(item.id, { loop: event.target.checked }) }} /> Lặp</label>
            <label><input type="checkbox" checked={item.muted} onChange={(event) => { pushHistory(); updateAudioItem(item.id, { muted: event.target.checked }) }} /> Tắt tiếng</label>
          </div>
        </div>)}
        {!audioItems.length && <small className="cap-hint">Thêm các đoạn nhạc hoặc voice độc lập, kéo chúng trên timeline để đặt vị trí.</small>}
      </Sec>

      <Sec id="tts" title={t('tts_label')} acc={acc} setAcc={setAcc}>
        <label className="vlbl">{t('tts_engine')}</label>
        <select className="cc-select" value={ttsEngine} onChange={(e) => setTtsEngine(e.target.value)} disabled={ttsBusy}>
          <option value="local">{t('tts_eng_local')}</option>
          <option value="google">{t('tts_eng_google')}</option>
        </select>
        {ttsEngine === 'google' && (
          <div className="bg-box">
            <label className="vlbl">{t('tts_key_label')} — <b>{hasKey ? t('tts_key_saved') : t('tts_key_none')}</b></label>
            <div className="key-row">
              <input type="password" className="cc-key" value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} placeholder={t('tts_key_ph')} disabled={ttsBusy} />
              <button className="cc-mini" onClick={saveApiKey} disabled={!apiKeyInput.trim() || ttsBusy}>{hasKey ? t('tts_key_change') : t('tts_key_save')}</button>
              {hasKey && <button className="cc-mini" onClick={removeApiKey} disabled={ttsBusy}>Xóa key</button>}
            </div>
            {hasKey && <small className="cap-hint">{apiKeyStatus.persistent ? 'Key được lưu mã hóa trên thiết bị.' : 'Key chỉ được giữ trong phiên hiện tại; cần nhập lại khi mở app.'}</small>}
            {apiKeyStatus.needsReentry && <small className="cap-hint">Key cũ không được mã hóa nên đã bỏ qua. Hãy nhập lại để dùng Google TTS.</small>}
            {hasKey && <>
              <label className="vlbl" style={{ marginTop: 6 }}>{t('tts_voice')}</label>
              <div className="key-row">
                <select className="cc-select" value={ttsVoice} onChange={(e) => setTtsVoice(e.target.value)} disabled={ttsBusy || !ttsVoices.length}>
                  {!ttsVoices.length && <option value="">{voicesLoading ? t('tts_voices_loading') : t('tts_no_voices')}</option>}
                  {ttsVoices.map((v) => <option key={v.name} value={v.name}>{v.name.replace('vi-VN-', '')} · {v.gender === 'FEMALE' ? '♀' : v.gender === 'MALE' ? '♂' : '·'} · {v.type}</option>)}
                </select>
                <button className="cc-mini" onClick={loadVoices} disabled={voicesLoading} title={t('tts_load_voices')}>↻</button>
              </div>
              <label className="vlbl">{t('tts_rate')} <b>{ttsRate.toFixed(2)}×</b></label>
              <input type="range" min={0.25} max={2} step={0.05} value={ttsRate} disabled={selectedVoice?.capabilities?.speakingRate === false} onMouseDown={beginEdit} onFocus={beginEdit} onBlur={endEdit} onChange={(e) => setTtsRate(Number(e.target.value))} />
              <label className="vlbl">{t('tts_pitch')} <b>{ttsPitch > 0 ? '+' : ''}{ttsPitch}</b></label>
              <input type="range" min={-20} max={20} step={1} value={ttsPitch} disabled={selectedVoice?.capabilities?.pitch === false} onMouseDown={beginEdit} onFocus={beginEdit} onBlur={endEdit} onChange={(e) => setTtsPitch(Number(e.target.value))} />
              {selectedVoice?.capabilities?.speakingRate === false && <small className="cap-hint">Google không hỗ trợ chỉnh tốc độ hoặc cao độ với dòng giọng này; giá trị sẽ bị bỏ qua.</small>}
            </>}
            <small className="cap-hint">{t('tts_google_hint')}</small>
          </div>
        )}
        <textarea className="cc-tts" value={ttsText} onChange={(e) => setTtsText(e.target.value)} placeholder={t('tts_ph')} rows={3} disabled={ttsBusy} />
        <div className="key-row">
          <button className="cc-auto" onClick={genTTS} disabled={!ttsText.trim() || ttsBusy}>{ttsBusy ? (ttsStatus || '...') : t('tts_generate')}</button>
          <button className="cc-mini" onClick={previewVoice} disabled={ttsBusy || (ttsEngine === 'google' && !ttsVoice)}>{t('tts_preview')}</button>
        </div>
        {ttsEngine !== 'google' && <div className="bg-box">
          <div className="key-row"><small className="cap-hint">Model tiếng Việt: {localTtsModel?.cached ? 'đã có trên máy, dùng offline' : localTtsModel?.state === 'check-failed' ? 'chưa kiểm tra được' : 'chưa tải về; lần tạo đầu cần internet'} </small>
            <button className="cc-mini" onClick={refreshLocalTtsModel} disabled={ttsBusy}>Kiểm tra</button></div>
          <small className="cap-hint">{t('tts_hint')}</small>
        </div>}
        {voice && (
          <div className="bg-box">
            <div className="bg-name">🎙️ {t('bg_added', { name: voice.name })}<button className="cap-del" onClick={() => setVoice(null)}><X size={13} /></button></div>
            <label className="vlbl">{t('vol_voice')} <b>{Math.round(voiceVol * 100)}%</b></label>
            <input type="range" min={0} max={1} step={0.05} value={voiceVol} onMouseDown={beginEdit} onFocus={beginEdit} onBlur={endEdit} onChange={(e) => setVoiceVol(Number(e.target.value))} />
          </div>
        )}
      </Sec>

      <Sec id="redub" title={t('redub_title')} acc={acc} setAcc={setAcc}>
        <small className="cap-hint">{t('redub_hint')}</small>
        <button className="cc-auto" onClick={redubVideo}
          disabled={!hasClips || !anyAudio || redubBusy || ttsBusy || (ttsEngine === 'google' && !ttsVoice)}>
          {redubBusy ? (redubStatus || '...') : redubSegments.length ? 'Tạo lại transcript' : '1. Nhận dạng và chuẩn bị câu'}
        </button>
        {!!redubSegments.length && <>
          <small className="cap-hint">Sửa nội dung hoặc thời gian trước khi tạo. Câu dài hơn slot được đánh dấu; hãy sửa nội dung hoặc thời gian nếu không muốn tăng tốc khi ghép.</small>
          {redubSegments.map((segment, index) => {
            const slot = Math.max(0.3, (redubSegments[index + 1]?.start ?? timelineDuration) - segment.start)
            const over = segment.audioDuration > slot + 0.05
            return <div className="bg-box" key={segment.id}>
              <div className="key-row"><strong>Câu {index + 1}</strong><small>{Number(segment.start).toFixed(2)}–{Number(segment.end).toFixed(2)}s · slot {slot.toFixed(2)}s</small></div>
              <div className="key-row">
                <label>Vào <input type="number" min="0" step="0.05" value={segment.start} disabled={redubBusy} onChange={(event) => { const start = Math.max(0, Number(event.target.value) || 0); setRedubSegments((items) => items.map((item, i) => i === index ? { ...item, start } : item)) }} /></label>
                <label>Ra <input type="number" min="0.05" step="0.05" value={segment.end} disabled={redubBusy} onChange={(event) => { const end = Math.max(segment.start + 0.05, Number(event.target.value) || segment.start + 0.05); setRedubSegments((items) => items.map((item, i) => i === index ? { ...item, end } : item)) }} /></label>
              </div>
              <textarea className="cc-tts" rows={2} value={segment.text} disabled={redubBusy}
                onChange={(event) => { const text = event.target.value; setRedubSegments((items) => items.map((item, i) => i === index ? { ...item, text, audioPath: '', audioDuration: 0 } : item)) }} />
              {segment.audioDuration > 0 && <small className="cap-hint">Voice {segment.audioDuration.toFixed(2)}s{over ? ` · dài hơn slot (${slot.toFixed(2)}s), sẽ bị co khoảng ${Math.min(4, segment.audioDuration / slot).toFixed(2)}× khi ghép` : ''}</small>}
              <div className="key-row">
                <button className="cc-mini" disabled={redubBusy || !segment.text.trim()} onClick={() => generateRedubSegment(index)}>{segment.audioPath ? 'Tạo lại câu' : 'Tạo câu'}</button>
                <button className="cc-mini" disabled={!segment.audioPath} onClick={() => previewRedubSegment(segment.audioPath)}>Nghe câu</button>
              </div>
            </div>
          })}
          <label className="chk"><input type="checkbox" checked={redubKeepOriginal} onChange={(event) => setRedubKeepOriginal(event.target.checked)} /> Giữ tiếng gốc khi áp dụng</label>
          <button className="cc-auto" disabled={redubBusy || redubSegments.some((segment) => !segment.audioPath)} onClick={applyRedub}>Áp dụng lồng tiếng đã duyệt</button>
        </>}
        {!anyAudio && hasClips && <small className="cap-hint">{t('cap_no_audio')}</small>}
        {!redubBusy && redubStatus && <small className="cap-hint">{redubStatus}</small>}
      </Sec>

      <audio ref={ttsPreviewRef} style={{ display: 'none' }} />

      {hasMusicTrack && hasVoiceTrack && (
        <label className="chk"><input type="checkbox" checked={ducking} onChange={(e) => { pushHistory(); setDucking(e.target.checked) }} /> {t('ducking')}</label>
      )}
      {anyAudio && (
        <div className="bg-box">
          <label className="vlbl">{t('vol_video')} <b>{Math.round(origVolume * 100)}%</b></label>
          <input type="range" min={0} max={1} step={0.05} value={origVolume} onMouseDown={beginEdit} onFocus={beginEdit} onBlur={endEdit} onChange={(e) => setOrigVolume(Number(e.target.value))} />
          <small className="cap-hint">{t('audio_orig_volume_hint')}</small>
        </div>
      )}
    </div>
  )
}

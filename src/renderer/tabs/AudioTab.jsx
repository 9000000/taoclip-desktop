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
  syncMode, setSyncMode, bgDur, setSlideDur, setAllSlideDur,
  // 2 track
  music, setMusic, voice, setVoice, musicVol, setMusicVol, voiceVol, setVoiceVol,
  origVolume, setOrigVolume, bgLoop, setBgLoop, ducking, setDucking, importMusic,
  // TTS
  ttsText, setTtsText, ttsBusy, ttsStatus, ttsEngine, setTtsEngine,
  ttsVoice, setTtsVoice, ttsVoices, ttsRate, setTtsRate, ttsPitch, setTtsPitch,
  apiKeyInput, setApiKeyInput, hasKey, voicesLoading,
  saveApiKey, loadVoices, previewVoice, genTTS, ttsPreviewRef,
  // doi giong video (re-dub)
  redubBusy, redubStatus, redubVideo, beginEdit = () => {}
}) {
  const { t } = useI18n()
  const [acc, setAcc] = useState({ music: true, tts: true, redub: false, slide: true })
  return (
    <div className="cc-cap">
      <small className="cap-hint">{t('audio_hint')}</small>

      {imageCount > 0 && (
        <Sec id="slide" title={t('slide_sync')} acc={acc} setAcc={setAcc}>
          <div className="seg">
            <button className={syncMode === 'fit' ? 'on' : ''} onClick={() => { if (syncMode !== 'fit') beginEdit(); setSyncMode('fit') }} disabled={!music || !bgDur}>{t('sync_fit')}</button>
            <button className={syncMode === 'fixed' ? 'on' : ''} onClick={() => { if (syncMode !== 'fixed') beginEdit(); setSyncMode('fixed') }}>{t('sync_fixed')}</button>
          </div>
          {syncMode === 'fit'
            ? <small className="cap-hint">{bgDur ? t('sync_fit_info', { d: bgDur.toFixed(0), n: imageCount, p: (bgDur / imageCount).toFixed(1) }) : t('sync_need_music')}</small>
            : <><label className="vlbl" style={{ marginTop: 6 }}>{t('slide_dur')}</label>
              <div className="seg wrap">{SLIDE_DURS.map((s) => <button key={s} onClick={() => { setSlideDur(s); setAllSlideDur(s) }}>{s}s</button>)}</div></>}
        </Sec>
      )}

      <Sec id="music" title={t('audio_music_title')} acc={acc} setAcc={setAcc}>
        <button className="cc-import" onClick={importMusic} disabled={!hasClips}>{t('music_import')}</button>
        {music && (
          <div className="bg-box">
            <div className="bg-name">🎧 {t('bg_added', { name: music.name })}<button className="cap-del" onClick={() => setMusic(null)}><X size={13} /></button></div>
            <label className="vlbl">{t('vol_music')} <b>{Math.round(musicVol * 100)}%</b></label>
            <input type="range" min={0} max={1} step={0.05} value={musicVol} onMouseDown={beginEdit} onFocus={beginEdit} onChange={(e) => setMusicVol(Number(e.target.value))} />
            <label className="chk"><input type="checkbox" checked={bgLoop} onChange={(e) => { beginEdit(); setBgLoop(e.target.checked) }} /> {t('bg_loop')}</label>
          </div>
        )}
      </Sec>

      <Sec id="tts" title={t('tts_label')} acc={acc} setAcc={setAcc}>
        <label className="vlbl">{t('tts_engine')}</label>
        <select className="cc-select" value={ttsEngine} onChange={(e) => { beginEdit(); setTtsEngine(e.target.value) }} disabled={ttsBusy}>
          <option value="local">{t('tts_eng_local')}</option>
          <option value="google">{t('tts_eng_google')}</option>
        </select>
        {ttsEngine === 'google' && (
          <div className="bg-box">
            <label className="vlbl">{t('tts_key_label')} — <b>{hasKey ? t('tts_key_saved') : t('tts_key_none')}</b></label>
            <div className="key-row">
              <input type="password" className="cc-key" value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} placeholder={t('tts_key_ph')} disabled={ttsBusy} />
              <button className="cc-mini" onClick={saveApiKey} disabled={!apiKeyInput.trim() || ttsBusy}>{hasKey ? t('tts_key_change') : t('tts_key_save')}</button>
            </div>
            {hasKey && <>
              <label className="vlbl" style={{ marginTop: 6 }}>{t('tts_voice')}</label>
              <div className="key-row">
                <select className="cc-select" value={ttsVoice} onChange={(e) => { beginEdit(); setTtsVoice(e.target.value) }} disabled={ttsBusy || !ttsVoices.length}>
                  {!ttsVoices.length && <option value="">{voicesLoading ? t('tts_voices_loading') : t('tts_no_voices')}</option>}
                  {ttsVoices.map((v) => <option key={v.name} value={v.name}>{v.name.replace('vi-VN-', '')} · {v.gender === 'FEMALE' ? '♀' : v.gender === 'MALE' ? '♂' : '·'} · {v.type}</option>)}
                </select>
                <button className="cc-mini" onClick={loadVoices} disabled={voicesLoading} title={t('tts_load_voices')}>↻</button>
              </div>
              <label className="vlbl">{t('tts_rate')} <b>{ttsRate.toFixed(2)}×</b></label>
              <input type="range" min={0.25} max={2} step={0.05} value={ttsRate} onMouseDown={beginEdit} onFocus={beginEdit} onChange={(e) => setTtsRate(Number(e.target.value))} />
              <label className="vlbl">{t('tts_pitch')} <b>{ttsPitch > 0 ? '+' : ''}{ttsPitch}</b></label>
              <input type="range" min={-10} max={10} step={1} value={ttsPitch} onMouseDown={beginEdit} onFocus={beginEdit} onChange={(e) => setTtsPitch(Number(e.target.value))} />
            </>}
            <small className="cap-hint">{t('tts_google_hint')}</small>
          </div>
        )}
        <textarea className="cc-tts" value={ttsText} onChange={(e) => setTtsText(e.target.value)} placeholder={t('tts_ph')} rows={3} disabled={ttsBusy} />
        <div className="key-row">
          <button className="cc-auto" onClick={genTTS} disabled={!ttsText.trim() || ttsBusy}>{ttsBusy ? (ttsStatus || '...') : t('tts_generate')}</button>
          <button className="cc-mini" onClick={previewVoice} disabled={ttsBusy || (ttsEngine === 'google' && !ttsVoice)}>{t('tts_preview')}</button>
        </div>
        {ttsEngine !== 'google' && <small className="cap-hint">{t('tts_hint')}</small>}
        {voice && (
          <div className="bg-box">
            <div className="bg-name">🎙️ {t('bg_added', { name: voice.name })}<button className="cap-del" onClick={() => setVoice(null)}><X size={13} /></button></div>
            <label className="vlbl">{t('vol_voice')} <b>{Math.round(voiceVol * 100)}%</b></label>
            <input type="range" min={0} max={1} step={0.05} value={voiceVol} onMouseDown={beginEdit} onFocus={beginEdit} onChange={(e) => setVoiceVol(Number(e.target.value))} />
          </div>
        )}
      </Sec>

      <Sec id="redub" title={t('redub_title')} acc={acc} setAcc={setAcc}>
        <small className="cap-hint">{t('redub_hint')}</small>
        <button className="cc-auto" onClick={redubVideo}
          disabled={!hasClips || !anyAudio || redubBusy || ttsBusy || (ttsEngine === 'google' && !ttsVoice)}>
          {redubBusy ? (redubStatus || '...') : t('redub_btn')}
        </button>
        {!anyAudio && hasClips && <small className="cap-hint">{t('cap_no_audio')}</small>}
        {!redubBusy && redubStatus && <small className="cap-hint">{redubStatus}</small>}
      </Sec>

      <audio ref={ttsPreviewRef} style={{ display: 'none' }} />

      {music && voice && (
        <label className="chk"><input type="checkbox" checked={ducking} onChange={(e) => { beginEdit(); setDucking(e.target.checked) }} /> {t('ducking')}</label>
      )}
      {(music || voice) && anyAudio && (
        <div className="bg-box">
          <label className="vlbl">{t('vol_video')} <b>{Math.round(origVolume * 100)}%</b></label>
          <input type="range" min={0} max={1} step={0.05} value={origVolume} onMouseDown={beginEdit} onFocus={beginEdit} onChange={(e) => setOrigVolume(Number(e.target.value))} />
        </div>
      )}
    </div>
  )
}

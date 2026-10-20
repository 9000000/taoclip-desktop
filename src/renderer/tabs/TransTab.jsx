import React from 'react'
import { useI18n } from '../i18n.jsx'

// Tab Chuyen canh: chon hieu ung noi giua cac clip (ap dung khi xuat >1 clip)
export default function TransTab({ clipCount, transition, setTransition }) {
  const { t } = useI18n()
  return (
    <div className="cc-cap">
      <label className="grp-lbl">{t('transition_label')}</label>
      <div className="seg vert">
        <button className={transition === 'none' ? 'on' : ''} onClick={() => setTransition('none')}>{t('trans_none')}</button>
        <button className={transition === 'fade' ? 'on' : ''} onClick={() => setTransition('fade')}>{t('trans_fade')}</button>
        <button className={transition === 'cross' ? 'on' : ''} onClick={() => setTransition('cross')}>{t('trans_cross')}</button>
      </div>
      {clipCount < 2 && <small className="cap-hint">{t('trans_need_multi')}</small>}
    </div>
  )
}

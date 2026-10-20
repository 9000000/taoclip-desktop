import React from 'react'
import { useI18n } from '../i18n.jsx'
import { FILTERS } from '../utils.js'

// Tab Bo loc mau: preview bang CSS filter, xuat bang FFmpeg
export default function FilterTab({ filterKey, setFilterKey }) {
  const { t } = useI18n()
  return (
    <div className="cc-cap">
      <label className="grp-lbl">{t('filter_title')}</label>
      <div className="filter-grid">
        {FILTERS.map((f) => (
          <button key={f.k} className={`filter-item ${filterKey === f.k ? 'on' : ''}`} onClick={() => setFilterKey(f.k)}>
            <div className="fi-prev" style={{ filter: f.css === 'none' ? undefined : f.css }} />
            <span>{t('f_' + f.k)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

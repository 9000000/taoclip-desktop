// ============================================================
//  Phu de (captions): sinh file ASS kieu CapCut + anh xa thoi gian
//  theo cac doan giu lai (cat/auto-cut) va toc do.
// ============================================================

function fmtAssTime(t) {
  if (!t || t < 0) t = 0
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = Math.floor(t % 60)
  const cs = Math.round((t % 1) * 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

function escapeText(s) {
  return String(s).trim().replace(/\r/g, '').replace(/\n/g, '\\N').replace(/\{/g, '(').replace(/\}/g, ')')
}

// Anh xa phu de tu thoi gian NGUON -> thoi gian OUTPUT (sau khi cat + tang toc)
// segments: cac doan giu lai (nguon), theo thu tu phat
function mapToOutput(captions, segments, speed = 1) {
  const out = []
  let acc = 0
  for (const seg of segments) {
    const segDur = (seg.end - seg.start) / speed
    for (const c of captions) {
      const a = Math.max(c.start, seg.start)
      const b = Math.min(c.end, seg.end)
      if (b - a > 0.05) {
        out.push({ start: acc + (a - seg.start) / speed, end: acc + (b - seg.start) / speed, text: c.text })
      }
    }
    acc += segDur
  }
  return out.sort((x, y) => x.start - y.start)
}

// Mau '#RRGGBB' -> ASS 'BBGGRR'
function rgbToAss(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return 'FFFFFF'
  const h = m[1]
  return (h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2)).toUpperCase()
}

// 1 dong Dialogue. event.pos (px) -> overlay co dinh vi; khong -> phu de duoi-giua
function eventLine(e) {
  const txt = escapeText(e.text)
  let ov = ''
  if (e.pos) {
    ov = `{\\an5\\pos(${Math.round(e.pos.x)},${Math.round(e.pos.y)})`
    if (e.fs) ov += `\\fs${e.fs}`
    if (e.color) ov += `\\1c&H${e.color}&`
    ov += '}'
  }
  return `Dialogue: 0,${fmtAssTime(e.start)},${fmtAssTime(e.end)},Default,,0,0,0,,${ov}${txt}`
}

// Sinh ASS cho phu de + chu/sticker. events: [{start,end,text, pos?:{x,y}, fs?, color?}]
function toAss(events, opts = {}) {
  const { width = 1080, height = 1920, fontName = 'Arial', fontScale = 1, marginRatio = 0.12 } = opts
  const fs = Math.max(16, Math.round(height * 0.052 * fontScale))
  const outline = Math.max(2, Math.round(fs * 0.09))
  const marginV = Math.round(height * marginRatio)
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fs},&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,${outline},1,2,60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`
  const lines = events.filter((e) => e.text && String(e.text).trim()).map(eventLine).join('\n')
  return header + lines + '\n'
}

// Sinh SRT (xuat file phu de roi - de import noi khac)
function toSrt(captions) {
  const ft = (t) => {
    if (!t || t < 0) t = 0
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60), ms = Math.round((t % 1) * 1000)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
  }
  return captions.filter((c) => c.text && c.text.trim())
    .map((c, i) => `${i + 1}\n${ft(c.start)} --> ${ft(c.end)}\n${c.text.trim()}\n`).join('\n')
}

module.exports = { mapToOutput, toAss, toSrt, fmtAssTime, rgbToAss }

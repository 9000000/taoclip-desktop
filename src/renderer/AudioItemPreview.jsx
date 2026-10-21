import { useEffect, useRef } from 'react'
import { fileUrl } from './utils.js'

export default function AudioItemPreview({ item, current, playing, totalDuration }) {
  const ref = useRef(null)
  useEffect(() => {
    const audio = ref.current
    if (!audio || item.muted) return
    const sourceSpan = Math.max(0.001, item.out - item.in)
    const elapsed = current - item.start
    const activeSpan = item.loop ? Math.max(0, totalDuration - item.start) : sourceSpan
    const active = elapsed >= 0 && elapsed < activeSpan
    if (!active) { if (!audio.paused) audio.pause(); return }
    const local = item.loop ? elapsed % sourceSpan : elapsed
    const target = Math.min(item.out - 0.02, item.in + local)
    try { if (Math.abs(audio.currentTime - target) > 0.2) audio.currentTime = Math.max(0, target) } catch {}
    const fadeInGain = item.fadeIn > 0 ? Math.min(1, elapsed / item.fadeIn) : 1
    const untilEnd = activeSpan - elapsed
    const fadeOutGain = item.fadeOut > 0 ? Math.min(1, untilEnd / item.fadeOut) : 1
    audio.volume = Math.max(0, Math.min(1, item.gain * fadeInGain * fadeOutGain))
    if (playing && audio.paused) audio.play().catch(() => {})
    else if (!playing && !audio.paused) audio.pause()
  }, [current, item, playing, totalDuration])
  return <audio ref={ref} src={fileUrl(item.path)} preload="auto" />
}

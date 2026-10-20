// Hang so + helper dung chung giua App va cac tab
import {
  Film, Music, Type, Smile, Sparkles, ArrowLeftRight, SlidersHorizontal
} from 'lucide-react'

export function fmt(t) {
  if (!t || t < 0) t = 0
  const m = Math.floor(t / 60), s = Math.floor(t % 60), f = Math.floor((t % 1) * 30)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`
}
export const fileUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F')
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
export const FRAME = 1 / 30
export const SPEEDS = [0.5, 1, 1.5, 2, 4]
export const SLIDE_DURS = [2, 3, 4, 5]
export const RE_VIDEO = /\.(mp4|mov|mkv|avi|webm|m4v)$/i
export const RE_IMAGE = /\.(jpe?g|png|webp|bmp|gif)$/i
export const RE_AUDIO = /\.(mp3|wav|m4a|aac|ogg|flac)$/i
export const isImg = (c) => c && c.kind === 'image'
export const clipOut = (c) => (c.out - c.in) / (c.speed || 1)
export const FILTERS = [
  { k: 'none', css: 'none', ff: null },
  { k: 'bright', css: 'brightness(1.12) contrast(1.05)', ff: 'eq=brightness=0.06:contrast=1.1' },
  { k: 'warm', css: 'saturate(1.15) sepia(0.18)', ff: 'colorbalance=rm=0.12:gm=0.04:bm=-0.12' },
  { k: 'cool', css: 'saturate(1.1) hue-rotate(-12deg)', ff: 'colorbalance=rm=-0.1:bm=0.12' },
  { k: 'vivid', css: 'saturate(1.5) contrast(1.12)', ff: 'eq=saturation=1.5:contrast=1.12' },
  { k: 'bw', css: 'grayscale(1)', ff: 'hue=s=0' },
  { k: 'vintage', css: 'sepia(0.45) contrast(0.92) saturate(1.1)', ff: 'curves=preset=vintage' }
]
export const TABS = [
  { k: 'media', Icon: Film }, { k: 'audio', Icon: Music }, { k: 'text', Icon: Type },
  { k: 'sticker', Icon: Smile }, { k: 'effect', Icon: Sparkles }, { k: 'trans', Icon: ArrowLeftRight }, { k: 'filter', Icon: SlidersHorizontal }
]

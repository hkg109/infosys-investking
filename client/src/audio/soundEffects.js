import { useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'investking:sound-muted'
const patterns = {
  notification: [[660, .05], [880, .09]],
  breaking: [[1046, .36], [1046, .36], [1046, .36]],
  orderSuccess: [[520, .06], [780, .12]],
  purchaseSuccess: [[590, .06], [740, .06], [990, .13]],
  error: [[240, .09], [180, .16]],
  monthClose: [[520, .08], [390, .08], [780, .18]],
}

let context = null
let unlocked = false
function audioContext() {
  if (typeof window === 'undefined') return null
  const AudioContext = window.AudioContext || window.webkitAudioContext
  if (!AudioContext) return null
  context ||= new AudioContext()
  return context
}
export function unlockSounds() {
  const audio = audioContext()
  if (!audio) return
  audio.resume().then(() => { unlocked = true }).catch(() => {})
}
export function playSound(name, muted = false) {
  const audio = audioContext(), pattern = patterns[name]
  if (!audio || !unlocked || muted || !pattern) return
  let at = audio.currentTime
  pattern.forEach(([frequency, duration], index) => {
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.type = name === 'breaking' ? 'sine' : index % 2 ? 'sine' : 'triangle'
    oscillator.frequency.setValueAtTime(frequency, at)
    gain.gain.setValueAtTime(.0001, at)
    gain.gain.exponentialRampToValueAtTime(.055, at + .012)
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration)
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start(at); oscillator.stop(at + duration + .02)
    at += duration + (name === 'breaking' ? .15 : 0)
  })
}

export function useSoundEffects({ game, notices = [], orderResult, purchases = [], error = '' }) {
  const [muted, setMuted] = useState(() => { try { return localStorage.getItem(STORAGE_KEY) === 'true' } catch { return false } })
  const previous = useRef({ phase: game?.phase, noticeIds: new Set(), orderId: null, purchases: purchases.length, error: '' })
  useEffect(() => {
    const unlock = () => unlockSounds()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock) }
  }, [])
  useEffect(() => {
    for (const notice of notices) {
      if (notice.state !== 'WARNING') continue
      const key = `${game?.startedAt || 'game'}:${notice.gameEventId}`
      if (previous.current.noticeIds.has(key)) continue
      previous.current.noticeIds.add(key)
      let heard = false
      try { heard = sessionStorage.getItem(`investking:heard:${key}`) === '1'; sessionStorage.setItem(`investking:heard:${key}`, '1') } catch {}
      if (!heard) playSound('breaking', muted)
    }
  }, [notices, muted, game?.startedAt])
  useEffect(() => {
    if (orderResult?.orderId && previous.current.orderId !== orderResult.orderId) playSound('orderSuccess', muted)
    previous.current.orderId = orderResult?.orderId || null
  }, [orderResult, muted])
  useEffect(() => {
    if (purchases.length > previous.current.purchases) playSound('purchaseSuccess', muted)
    previous.current.purchases = purchases.length
  }, [purchases, muted])
  useEffect(() => {
    if (previous.current.phase === 'TRADING' && game?.phase === 'RESULT') playSound('monthClose', muted)
    previous.current.phase = game?.phase
  }, [game?.phase, muted])
  useEffect(() => {
    if (error && error !== previous.current.error) playSound('error', muted)
    previous.current.error = error
  }, [error, muted])
  const toggleMuted = () => setMuted(value => {
    const next = !value
    try { localStorage.setItem(STORAGE_KEY, String(next)) } catch {}
    if (!next) { unlockSounds(); playSound('notification', false) }
    return next
  })
  return { muted, toggleMuted }
}

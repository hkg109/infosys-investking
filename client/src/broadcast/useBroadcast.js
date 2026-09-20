import { useEffect, useRef, useState } from 'react'
import { getBroadcast, broadcastError } from './api.js'
import { broadcastSeconds, nextSpotlight, retryDelay } from './model.js'

export function useBroadcast() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [spotlight, setSpotlight] = useState(null)
  const [now, setNow] = useState(Date.now())
  const previous = useRef(null)
  useEffect(() => {
    let active = true
    let failures = 0
    let timer
    let controller
    const poll = async () => {
      controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)
      let delay
      try {
        const next = await getBroadcast(controller.signal)
        if (!active) return
        const receivedAt = Date.now()
        const nextData = { ...next, receivedAt }
        const arrival = nextSpotlight(previous.current, next, receivedAt)
        setSpotlight(current => next.game.status === 'WAITING' ? null : arrival || current)
        previous.current = next
        setData(nextData)
        setError('')
        failures = 0
        delay = next.pollAfterMs
      } catch (failure) {
        if (!active) return
        failures += 1
        setError(broadcastError(failure))
        delay = retryDelay(failures)
      } finally {
        clearTimeout(timeout)
        if (active) timer = setTimeout(poll, delay)
      }
    }
    poll()
    const tick = setInterval(() => setNow(Date.now()), 250)
    return () => { active = false; clearTimeout(timer); clearInterval(tick); controller?.abort() }
  }, [])
  const visibleSpotlight = spotlight?.until > now ? spotlight : null
  return { data, error, spotlight: visibleSpotlight, remainingSeconds: error ? null : broadcastSeconds(data, now) }
}

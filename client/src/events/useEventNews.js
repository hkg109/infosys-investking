import { useEffect, useState } from 'react'
import { eventRequest } from './api'

export function currentEvents(data, round) {
  const events = Array.isArray(data?.events) ? data.events : data?.event ? [data.event] : []
  return events.filter(event => event.round === round)
}

export default function useEventNews({ game, revision, enabled = true }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(enabled)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!enabled) return undefined
    let active = true
    setLoading(true)
    eventRequest('/current').then(next => {
      if (active) {
        setData(next)
        setError('')
      }
    }).catch(() => {
      if (active) setError('뉴스를 불러오지 못했습니다. 다시 확인해 주세요.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [enabled, revision, retry])

  return {
    events: currentEvents(data, game?.currentRound),
    error,
    loading,
    refresh: () => setRetry(value => value + 1),
  }
}

const integer = value => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value))
export function validateConstraints(value) {
  if (!value || !Number.isSafeInteger(value.totalRounds) || value.totalRounds < 1 || !Number.isSafeInteger(value.tradingDurationMs) || value.tradingDurationMs < 1 || !Number.isSafeInteger(value.haltDurationMs) || value.haltDurationMs < 0) throw new Error('INVALID_RESPONSE')
  return value
}
export function scheduleDraft(schedule) {
  return schedule.map(item => ({ eventId: item.eventId, round: String(item.round), displayOrder: String(item.displayOrder), triggerPhase: item.triggerPhase,
    triggerOffsetSeconds: String(item.triggerOffsetSeconds ?? ''), newsRevealOffsetSeconds: String(item.newsRevealOffsetSeconds ?? (item.triggerPhase === 'INTRADAY'
      ? Math.max(0, (item.triggerOffsetSeconds ?? 0) - Math.max(1, item.preannounceSeconds ?? 1))
      : 0)) }))
}
export function eligibleEvents(events, companies) {
  const active = new Set(companies.filter(c => c.isActive).map(c => c.companyId))
  return events.filter(e => e.effects.every(effect => active.has(effect.companyId)))
}
export function scheduleInput(rows, constraints, eligible) {
  validateConstraints(constraints)
  const seen = new Set(), rounds = new Map()
  for (const row of rows) {
    if (!eligible.some(e => e.eventId === row.eventId)) throw new Error('EVENT_NOT_FOUND')
    if (seen.has(row.eventId)) throw new Error('DUPLICATE_EVENT_ASSIGNMENT')
    seen.add(row.eventId)
    if (!integer(row.round) || Number(row.round) < 1 || Number(row.round) > constraints.totalRounds || !integer(row.displayOrder) || Number(row.displayOrder) < 1) throw new Error('INVALID_EVENT_SCHEDULE')
    const round = Number(row.round), displayOrder = Number(row.displayOrder)
    const event = eligible.find(e=>e.eventId===row.eventId)
    if(event.eventType && event.eventType!==row.triggerPhase) throw new Error('EVENT_TYPE_MISMATCH')
    if(event.effects.some(e=>Math.abs(e.changeRate)>(round<=6?30:50))) throw new Error('EVENT_RATE_LIMIT')
    const group = rounds.get(round) || []
    if (group.length >= 10 || group.some(e => e.displayOrder === displayOrder)) throw new Error('INVALID_EVENT_SCHEDULE')
    let item = { eventId: row.eventId, displayOrder, triggerPhase: row.triggerPhase }
    const legacyReveal = row.triggerPhase === 'INTRADAY' && integer(row.triggerOffsetSeconds)
      ? Math.max(0, Number(row.triggerOffsetSeconds) - Math.max(1, integer(row.preannounceSeconds) ? Number(row.preannounceSeconds) : 1))
      : 0
    const revealInput = row.newsRevealOffsetSeconds ?? String(legacyReveal)
    if (row.triggerPhase === 'INTRADAY') {
      if (!integer(row.triggerOffsetSeconds) || !integer(revealInput)) throw new Error('INVALID_EVENT_SCHEDULE')
      if(group.filter(e=>e.triggerPhase==='INTRADAY').length>=4) throw new Error('INTRADAY_COUNT_REQUIRED')
      const offset = Number(row.triggerOffsetSeconds), reveal = Number(revealInput)
      if (offset < 1 || offset * 1000 + constraints.haltDurationMs >= constraints.tradingDurationMs || reveal >= offset ||
          (row.newsRevealOffsetSeconds === undefined && row.preannounceSeconds !== undefined && (!integer(row.preannounceSeconds) || Number(row.preannounceSeconds) < 1 || Number(row.preannounceSeconds) >= offset))) throw new Error('INVALID_EVENT_SCHEDULE')
      const start = reveal * 1000, end = offset * 1000 + constraints.haltDurationMs
      // Shared news releases may overlap; the trading halts must not.
      if (group.some(e => e.triggerPhase === 'INTRADAY' && (reveal === e.newsRevealOffsetSeconds
        ? offset * 1000 < e.triggerOffsetSeconds * 1000 + constraints.haltDurationMs && end > e.triggerOffsetSeconds * 1000
        : start < e.triggerOffsetSeconds * 1000 + constraints.haltDurationMs && end > e.newsRevealOffsetSeconds * 1000))) throw new Error('EVENT_SCHEDULE_CONFLICT')
      item = { ...item, triggerOffsetSeconds: offset, newsRevealOffsetSeconds: reveal }
    } else if (row.triggerPhase !== 'CLOSE' || !integer(revealInput) || Number(revealInput) * 1000 >= constraints.tradingDurationMs) throw new Error('INVALID_EVENT_SCHEDULE')
    else item = { ...item, newsRevealOffsetSeconds: Number(revealInput) }
    rounds.set(round, [...group, item])
  }
  return { rounds: Array.from(rounds, ([round, events]) => ({ round, events: events.sort((a,b) => a.displayOrder - b.displayOrder) })).sort((a,b) => a.round - b.round) }
}
export function eventTiming(event) {
  return event.triggerPhase === 'INTRADAY'
    ? `뉴스 공개 ${event.newsRevealOffsetSeconds}초 · 주가 변동 ${event.triggerOffsetSeconds}초`
    : `뉴스 공개 ${event.newsRevealOffsetSeconds}초 · 주가 변동 거래 마감`
}

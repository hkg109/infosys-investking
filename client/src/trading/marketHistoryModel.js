const snapshotLabels = { OPEN: '시가', INTRADAY_EVENT: '장중 사건', CLOSE: '종가' }

export function priceSeries(history, selectedRound = null) {
  if (!Array.isArray(history)) return []
  return history
    .filter(period => selectedRound === null || period.round === selectedRound)
    .flatMap(period => period.snapshots.map((snapshot, index) => ({
      ...snapshot, round: period.round, key: `${period.round}-${snapshot.snapshotType}-${snapshot.recordedAt}-${index}`,
      label: `${period.round}월 ${snapshotLabels[snapshot.snapshotType] || snapshot.snapshotType}`,
    })))
}

export function chartGeometry(series, width = 640, height = 240) {
  if (!series.length) return { points: [], polyline: '', minimum: null, maximum: null }
  const padding = { left: 54, right: 18, top: 20, bottom: 36 }
  const prices = series.map(item => item.price)
  const minimum = Math.min(...prices)
  const maximum = Math.max(...prices)
  const range = Math.max(1, maximum - minimum)
  const usableWidth = width - padding.left - padding.right
  const usableHeight = height - padding.top - padding.bottom
  const points = series.map((item, index) => ({
    ...item,
    x: padding.left + (series.length === 1 ? usableWidth / 2 : index * usableWidth / (series.length - 1)),
    y: maximum === minimum ? padding.top + usableHeight / 2 : padding.top + (maximum - item.price) * usableHeight / range,
  }))
  return { points, polyline: points.map(point => `${point.x},${point.y}`).join(' '), minimum, maximum }
}

export const companyChartStyles = {
  A: { color: '#c93434', dash: '' },
  B: { color: '#2563c9', dash: '10 4' },
  C: { color: '#21835a', dash: '3 3' },
  D: { color: '#9a7411', dash: '14 4 3 4' },
  E: { color: '#7651b5', dash: '8 3 2 3' },
  F: { color: '#c66124', dash: '2 3' },
  G: { color: '#167c83', dash: '12 3' },
}

export function multiPriceSeries(companies, selectedRound = null) {
  if (!Array.isArray(companies)) return []
  return companies.map(item => ({
    company: item.company,
    series: priceSeries(item.history, selectedRound),
    style: companyChartStyles[item.company.companyId] || { color: '#475569', dash: '6 3' },
  }))
}

export function multiChartGeometry(groups, width = 760, height = 320) {
  const padding = { left: 62, right: 24, top: 22, bottom: 42 }
  const all = groups.flatMap(group => group.series)
  if (!all.length) return { groups: [], minimum: null, maximum: null }
  const prices = all.map(item => item.price)
  const minimum = Math.min(...prices)
  const maximum = Math.max(...prices)
  const range = Math.max(1, maximum - minimum)
  const times = all.map(item => Date.parse(item.recordedAt)).filter(Number.isFinite)
  const firstTime = Math.min(...times)
  const lastTime = Math.max(...times)
  const timeRange = Math.max(1, lastTime - firstTime)
  const usableWidth = width - padding.left - padding.right
  const usableHeight = height - padding.top - padding.bottom
  return {
    minimum, maximum,
    groups: groups.map(group => ({ ...group, points: group.series.map((item, index) => ({
      ...item,
      x: Number.isFinite(Date.parse(item.recordedAt)) && lastTime !== firstTime
        ? padding.left + (Date.parse(item.recordedAt) - firstTime) * usableWidth / timeRange
        : padding.left + (group.series.length === 1 ? usableWidth / 2 : index * usableWidth / Math.max(1, group.series.length - 1)),
      y: maximum === minimum ? padding.top + usableHeight / 2 : padding.top + (maximum - item.price) * usableHeight / range,
    })) })),
  }
}

export function signedMoney(value) {
  if (!Number.isSafeInteger(value)) return '—'
  return `${value > 0 ? '+' : value < 0 ? '-' : ''}${Math.abs(value).toLocaleString('ko-KR')}원`
}

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

export function signedMoney(value) {
  if (!Number.isSafeInteger(value)) return '—'
  return `${value > 0 ? '+' : value < 0 ? '-' : ''}${Math.abs(value).toLocaleString('ko-KR')}원`
}

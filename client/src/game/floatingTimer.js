export const TIMER_STORAGE_KEY = 'investking:floating-timer:v1'
export const TIMER_LIMITS = { minWidth: 260, minHeight: 142, maxWidth: 480, maxHeight: 320, margin: 12 }

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback
}

export function viewportSize(source = globalThis) {
  return {
    width: Math.max(1, finite(source?.innerWidth, 1280)),
    height: Math.max(1, finite(source?.innerHeight, 720)),
  }
}

export function clampTimerRect(rect = {}, viewport = viewportSize()) {
  const { margin, minWidth, minHeight, maxWidth, maxHeight } = TIMER_LIMITS
  const availableWidth = Math.max(1, finite(viewport.width, 1280) - margin * 2)
  const availableHeight = Math.max(1, finite(viewport.height, 720) - margin * 2)
  const lowerWidth = Math.min(minWidth, availableWidth)
  const lowerHeight = Math.min(minHeight, availableHeight)
  const width = Math.min(Math.max(finite(rect.width, 304), lowerWidth), Math.min(maxWidth, availableWidth))
  const height = Math.min(Math.max(finite(rect.height, 166), lowerHeight), Math.min(maxHeight, availableHeight))
  const maxX = Math.max(margin, finite(viewport.width, 1280) - width - margin)
  const maxY = Math.max(margin, finite(viewport.height, 720) - height - margin)
  return {
    x: Math.min(Math.max(finite(rect.x, maxX), margin), maxX),
    y: Math.min(Math.max(finite(rect.y, 88), margin), maxY),
    width,
    height,
  }
}

export function defaultTimerRect(viewport = viewportSize()) {
  return clampTimerRect({ x: viewport.width - 316, y: 88, width: 304, height: 166 }, viewport)
}

export function loadTimerRect(storage, viewport = viewportSize()) {
  try {
    const value = storage?.getItem(TIMER_STORAGE_KEY)
    return value ? clampTimerRect(JSON.parse(value), viewport) : defaultTimerRect(viewport)
  } catch {
    return defaultTimerRect(viewport)
  }
}

export function saveTimerRect(storage, rect) {
  try {
    storage?.setItem(TIMER_STORAGE_KEY, JSON.stringify(rect))
    return true
  } catch {
    return false
  }
}

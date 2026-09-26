export const NEWS_STORAGE_KEY = 'investking:floating-news:v1'
export const NEWS_LIMITS = { minWidth: 320, minHeight: 280, maxWidth: 620, maxHeight: 680, margin: 12 }

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback
}

export function newsViewportSize(source = globalThis) {
  return {
    width: Math.max(1, finite(source?.innerWidth, 1280)),
    height: Math.max(1, finite(source?.innerHeight, 720)),
  }
}

export function clampNewsRect(rect = {}, viewport = newsViewportSize()) {
  const { margin, minWidth, minHeight, maxWidth, maxHeight } = NEWS_LIMITS
  const availableWidth = Math.max(1, finite(viewport.width, 1280) - margin * 2)
  const availableHeight = Math.max(1, finite(viewport.height, 720) - margin * 2)
  const lowerWidth = Math.min(minWidth, availableWidth)
  const lowerHeight = Math.min(minHeight, availableHeight)
  const width = Math.min(Math.max(finite(rect.width, 440), lowerWidth), Math.min(maxWidth, availableWidth))
  const height = Math.min(Math.max(finite(rect.height, 420), lowerHeight), Math.min(maxHeight, availableHeight))
  const maxX = Math.max(margin, finite(viewport.width, 1280) - width - margin)
  const maxY = Math.max(margin, finite(viewport.height, 720) - height - margin)
  return {
    x: Math.min(Math.max(finite(rect.x, maxX), margin), maxX),
    y: Math.min(Math.max(finite(rect.y, maxY), margin), maxY),
    width,
    height,
  }
}

export function defaultNewsRect(viewport = newsViewportSize()) {
  return clampNewsRect({ x: viewport.width - 452, y: viewport.height - 432, width: 440, height: 420 }, viewport)
}

export function loadNewsRect(storage, viewport = newsViewportSize()) {
  try {
    const value = storage?.getItem(NEWS_STORAGE_KEY)
    return value ? clampNewsRect(JSON.parse(value), viewport) : defaultNewsRect(viewport)
  } catch {
    return defaultNewsRect(viewport)
  }
}

export function saveNewsRect(storage, rect) {
  try {
    storage?.setItem(NEWS_STORAGE_KEY, JSON.stringify(rect))
    return true
  } catch {
    return false
  }
}

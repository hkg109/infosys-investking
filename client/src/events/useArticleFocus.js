import { useEffect, useRef } from 'react'

// Wait for a requested article to arrive, then leave scrolling to the reader.
export function focusRequestedArticle(articles, request, handled) {
  if (!request?.gameEventId) return
  if (handled.current?.gameEventId === request.gameEventId && handled.current?.requestId === request.requestId) return
  const article = articles.get(request.gameEventId)
  if (!article) return
  handled.current = { gameEventId: request.gameEventId, requestId: request.requestId }
  article.focus({ preventScroll: true })
  article.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default function useArticleFocus(events, request) {
  const articles = useRef(new Map())
  const handled = useRef(null)
  useEffect(() => { focusRequestedArticle(articles.current, request, handled) }, [events, request])
  return articles
}

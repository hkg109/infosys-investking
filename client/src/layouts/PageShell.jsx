import { NavLink, useLocation } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import PageLayout from './PageLayout'
import GameConnection from '../components/GameConnection'
export default function PageShell({ area, menu, gameState, actions, children }) {
  const { pathname } = useLocation()
  const heading = useRef(null)
  const navigation = useRef(null)
  const title = menu.find(([path]) => pathname === `/${area}/${path}`)?.[1] || (area === 'admin' ? '관리자' : '게임')
  useEffect(() => {
    heading.current?.focus()
    window.scrollTo(0, 0)
    const active = navigation.current?.querySelector('[aria-current="page"]')
    if (active) navigation.current.scrollLeft = Math.max(0, active.offsetLeft - 8)
  }, [pathname])
  return <PageLayout wide title={title} headingRef={heading} actions={actions} subtitle={area === 'admin' ? '관리자 작업 공간' : '나의 투자 게임'}>
    <nav ref={navigation} className="section-navigation" aria-label={area === 'admin' ? '관리자 메뉴' : '게임 메뉴'}>
      {menu.map(([path, label]) => <NavLink key={path} to={`/${area}/${path}`} end>{label}</NavLink>)}
    </nav>
    <GameConnection {...gameState} />
    <div className="route-content">{children}</div>
  </PageLayout>
}

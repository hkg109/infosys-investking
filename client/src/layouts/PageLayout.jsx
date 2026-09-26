import { Link } from 'react-router-dom'

function PageLayout({ actions, area = 'public', children, title, subtitle, wide = false, headingRef }) {
  return (
    <div className={`app-shell app-shell--${area}`}>
      <header className="site-header">
        <Link className="brand" to="/"><span>INFOSYS</span> InvestKing</Link>
        <nav aria-label="주요 메뉴">
          <Link to="/game">게임</Link>
          <Link to="/admin">관리자</Link>
          {actions}
        </nav>
      </header>

      <main className={`page-container${wide ? ' page-container--wide' : ''}`}>
        <section className="page-heading">
          <p className="eyebrow">INVESTKING</p>
          <h1 ref={headingRef} tabIndex={headingRef ? -1 : undefined}>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </section>
        {children}
      </main>
      <footer className="site-footer">
        <span>Infosys InvestKing</span>
        <span>한양대학교 정보시스템학과 16대 학생회 휘연 주최</span>
      </footer>
    </div>
  )
}

export default PageLayout

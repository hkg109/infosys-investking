import { Link } from 'react-router-dom'

function PageLayout({ actions, children, title, subtitle, wide = false }) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" to="/">Infosys InvestKing</Link>
        <nav aria-label="주요 메뉴">
          <Link to="/game">게임</Link>
          <Link to="/admin">관리자</Link>
          {actions}
        </nav>
      </header>

      <main className={`page-container${wide ? ' page-container--wide' : ''}`}>
        <section className="page-heading">
          <p className="eyebrow">INVESTKING</p>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </section>
        {children}
      </main>
    </div>
  )
}

export default PageLayout

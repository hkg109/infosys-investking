import { Link } from 'react-router-dom'

function PageLayout({ children, title, subtitle }) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" to="/">Infosys InvestKing</Link>
        <nav aria-label="주요 메뉴">
          <Link to="/game">게임</Link>
          <Link to="/admin">관리자</Link>
        </nav>
      </header>

      <main className="page-container">
        <section className="page-heading">
          <p className="eyebrow">MOCK SCREEN</p>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </section>
        {children}
      </main>
    </div>
  )
}

export default PageLayout

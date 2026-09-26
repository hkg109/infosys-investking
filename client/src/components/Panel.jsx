function Panel({ children, title, className = '' }) {
  return (
    <section className={`panel${className ? ` ${className}` : ''}`}>
      <h2>{title}</h2>
      {children}
    </section>
  )
}

export default Panel

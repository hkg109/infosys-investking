export default function RefreshIconButton({ label = '업데이트', loading = false, className = '', ...props }) {
  return <button type="button" className={`refresh-icon-button${loading ? ' is-loading' : ''}${className ? ` ${className}` : ''}`} aria-label={loading ? `${label} 중` : label} title={loading ? `${label} 중` : label} {...props}>
    <img src="/icons/refresh.svg" alt="" aria-hidden="true" />
  </button>
}

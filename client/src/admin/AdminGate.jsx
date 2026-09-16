import { useEffect, useRef, useState } from 'react'
import PageLayout from '../layouts/PageLayout'
import { adminAuthError, verifyAdmin } from './api'

export default function AdminGate({ children }) {
  const [password, setPassword] = useState('')
  const [verifiedPassword, setVerifiedPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(null)
  useEffect(() => () => { request.current?.abort(); request.current = null }, [])
  const submit = async event => {
    event.preventDefault()
    if (request.current) return
    if (!password) { setError('관리자 비밀번호를 입력해 주세요.'); return }
    const controller = new AbortController()
    request.current = controller
    const timeout = setTimeout(() => controller.abort(), 8000)
    setPending(true); setError('')
    try {
      await verifyAdmin(password, controller.signal)
      if (!controller.signal.aborted) { setVerifiedPassword(password); setPassword('') }
    } catch (failure) {
      if (request.current === controller) setError(adminAuthError(failure))
    } finally {
      clearTimeout(timeout)
      if (request.current === controller) { request.current = null; setPending(false) }
    }
  }
  if (verifiedPassword) return children(verifiedPassword, () => { setVerifiedPassword(''); setPassword(''); setError('') })
  return <PageLayout title="관리자 로그인" subtitle="관리자 비밀번호를 확인한 뒤 관리 화면으로 이동합니다.">
    <section className="panel admin-login" aria-label="관리자 인증">
      <h2>관리자 비밀번호 확인</h2>
      <form className="entry-form" onSubmit={submit} aria-busy={pending}>
        <label htmlFor="admin-password">관리자 비밀번호</label>
        <input id="admin-password" type="password" autoComplete="off" autoFocus disabled={pending} value={password} onChange={event => { setPassword(event.target.value); setError('') }} aria-describedby="admin-password-help" />
        <p id="admin-password-help" className="trading-help">비밀번호는 저장하지 않습니다. 새로고침하거나 페이지를 나가면 다시 인증해야 합니다.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={pending}>{pending ? '확인 중...' : '관리자 로그인'}</button>
      </form>
    </section>
  </PageLayout>
}

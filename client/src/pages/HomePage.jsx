import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/users'
import { useSession } from '../auth/SessionContext'

const errorMessages = {
  INVALID_INPUT: '닉네임과 숫자 4자리 PIN을 확인해 주세요.',
  NICKNAME_TAKEN: '이미 사용 중인 닉네임입니다. 기존 참가자는 계정 복구를 이용해 주세요.',
  INVALID_CREDENTIALS: '닉네임 또는 PIN이 올바르지 않습니다.',
  DATABASE_UNAVAILABLE: '참가 서버가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.',
  SERVICE_UNAVAILABLE: '서버에서 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  ORIGIN_NOT_ALLOWED: '현재 주소에서는 참가할 수 없습니다. 운영자에게 접속 주소를 확인해 주세요.',
  NETWORK_ERROR: '서버에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.',
}

function messageFor(error) {
  if (error instanceof ApiError) return errorMessages[error.code] || '요청을 처리하지 못했습니다.'
  return '예상하지 못한 오류가 발생했습니다.'
}

function HomePage() {
  const navigate = useNavigate()
  const { join, recover, sessionError, status, user } = useSession()
  const [mode, setMode] = useState('join')
  const [nickname, setNickname] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (status === 'ready' && user) navigate('/game', { replace: true })
  }, [navigate, status, user])

  const handlePinChange = (event) => {
    setPin(event.target.value.replace(/\D/g, '').slice(0, 4))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!nickname.trim()) {
      setError('닉네임을 입력해 주세요.')
      return
    }

    if (!/^\d{4}$/.test(pin)) {
      setError('PIN은 숫자 4자리로 입력해 주세요.')
      return
    }

    setError('')
    setIsSubmitting(true)

    try {
      const action = mode === 'join' ? join : recover
      await action(nickname, pin)
      navigate('/game', { replace: true })
    } catch (requestError) {
      setError(messageFor(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  const changeMode = (nextMode) => {
    setMode(nextMode)
    setError('')
  }

  return (
    <main className="home-page">
      <section className="hero-card">
        <p className="eyebrow">INFORMATION SYSTEMS FESTIVAL</p>
        <h1>Infosys InvestKing</h1>
        <p className="hero-copy">
          뉴스와 사건을 읽고 가상 기업에 투자하며 최고의 투자왕에 도전하는 실시간 모의투자 게임입니다.
        </p>

        <div className="entry-tabs" role="tablist" aria-label="참가 방법">
          <button className={mode === 'join' ? 'entry-tab entry-tab--active' : 'entry-tab'} type="button" role="tab" aria-selected={mode === 'join'} onClick={() => changeMode('join')}>처음 참가</button>
          <button className={mode === 'recover' ? 'entry-tab entry-tab--active' : 'entry-tab'} type="button" role="tab" aria-selected={mode === 'recover'} onClick={() => changeMode('recover')}>계정 복구</button>
        </div>

        <p className="entry-help">
          {mode === 'join' ? '사용할 닉네임과 복구용 PIN을 등록합니다.' : '처음 등록한 닉네임과 PIN으로 기존 계정을 불러옵니다.'}
        </p>

        <form className="entry-form" onSubmit={handleSubmit} noValidate aria-busy={isSubmitting}>
          <label htmlFor="nickname">닉네임</label>
          <input id="nickname" name="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="게임에서 사용할 이름" autoComplete="nickname" />

          <label htmlFor="pin">4자리 PIN</label>
          <input id="pin" name="pin" value={pin} onChange={handlePinChange} placeholder="숫자 4자리" inputMode="numeric" pattern="[0-9]{4}" type="password" autoComplete="off" />

          {(error || (sessionError && !user)) && <p className="form-error" role="alert">{error || errorMessages[sessionError] || '참가 정보를 확인하지 못했습니다.'}</p>}
          <button className="primary-button" type="submit" disabled={isSubmitting || status === 'loading'}>
            {isSubmitting ? '처리 중...' : mode === 'join' ? '게임 참가' : '계정 복구'}
          </button>
        </form>

        <Link className="text-link" to="/admin">관리자 페이지로 이동</Link>
        <p className="mock-note">PIN은 계정 복구에 필요합니다. 다른 사람에게 알려주지 마세요.</p>
      </section>
    </main>
  )
}

export default HomePage

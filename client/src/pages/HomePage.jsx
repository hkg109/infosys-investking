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
      <section className="home-studio" aria-labelledby="home-title">
        <div className="home-story">
          <p className="eyebrow">INFORMATION SYSTEMS FESTIVAL · LIVE MARKET</p>
          <h1 id="home-title"><span>뉴스를 읽고,</span> 시장을 움직여라.</h1>
          <p className="hero-copy">학과의 사건이 뉴스가 되고, 선택이 수익률이 되는 실시간 모의투자 게임입니다.</p>
          <section className="game-rules" aria-label="게임 규칙">
            <div className="rules-heading"><span>01—05</span><h2>게임 방법</h2></div>
            <ol>
              <li>닉네임과 숫자 4자리 PIN으로 참가하세요. 다시 접속할 때 같은 정보로 계정을 복구할 수 있습니다.</li>
              <li>뉴스와 사건을 읽고, 거래 가능한 시간에 주식을 매수하거나 매도하세요.</li>
              <li>보유 현금 범위에서 매수하고, 보유한 수량만 매도할 수 있습니다.</li>
              <li>사건에 따라 주가가 변합니다. 일시정지·거래 마감·게임 종료 중에는 주문할 수 없습니다.</li>
              <li>게임 종료 시 현금과 주식 평가액을 합한 총자산으로 최종 순위를 정합니다.</li>
            </ol>
            <p>실제 돈을 사용하지 않습니다. 진행 시간과 참가 조건은 운영자의 안내를 확인하세요.</p>
          </section>
        </div>
        <section className="hero-card" aria-label="게임 참가">
          <p className="entry-index">SESSION ENTRY / 2026</p>
          <h2>{mode === 'join' ? '시장에 입장하기' : '계정 다시 불러오기'}</h2>
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

          <p className="form-error" role={error || (sessionError && !user) ? 'alert' : undefined}>
            {error || (sessionError && !user ? errorMessages[sessionError] || '참가 정보를 확인하지 못했습니다.' : '\u00A0')}
          </p>
          <button className="primary-button" type="submit" disabled={isSubmitting || status === 'loading'}>
            {isSubmitting ? '처리 중...' : mode === 'join' ? '게임 참가' : '계정 복구'}
          </button>
        </form>

        <div className="entry-links">
          <Link className="text-link" to="/admin">관리자 페이지</Link>
          <Link className="text-link" to="/broadcast">대형 화면 중계</Link>
        </div>
        <p className="mock-note">PIN은 계정 복구에 필요합니다. 다른 사람에게 알려주지 마세요.</p>
      </section>
      </section>
    </main>
  )
}

export default HomePage

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

function HomePage() {
  const navigate = useNavigate()
  const [nickname, setNickname] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  const handlePinChange = (event) => {
    setPin(event.target.value.replace(/\D/g, '').slice(0, 4))
  }

  const handleSubmit = (event) => {
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
    navigate('/game')
  }

  return (
    <main className="home-page">
      <section className="hero-card">
        <p className="eyebrow">INFORMATION SYSTEMS FESTIVAL</p>
        <h1>Infosys InvestKing</h1>
        <p className="hero-copy">
          뉴스와 사건을 읽고 가상 기업에 투자하며 최고의 투자왕에 도전하는 실시간 모의투자 게임입니다.
        </p>

        <form className="entry-form" onSubmit={handleSubmit} noValidate>
          <label htmlFor="nickname">닉네임</label>
          <input id="nickname" name="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="게임에서 사용할 이름" autoComplete="nickname" />

          <label htmlFor="pin">4자리 PIN</label>
          <input id="pin" name="pin" value={pin} onChange={handlePinChange} placeholder="숫자 4자리" inputMode="numeric" pattern="[0-9]{4}" type="password" autoComplete="off" />

          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit">게임 참가</button>
        </form>

        <Link className="text-link" to="/admin">관리자 페이지로 이동</Link>
        <p className="mock-note">현재는 화면 확인 단계이며 입력 정보가 서버에 저장되지 않습니다.</p>
      </section>
    </main>
  )
}

export default HomePage

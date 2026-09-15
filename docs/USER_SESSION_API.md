# 2단계 사용자 세션 Backend

담당: 지석 / 브랜치: `feat/user-session` / 협업 가이드 작업 번호 4.
실제 GitHub Issue 번호는 가이드 번호와 별개입니다.
이번 작업의 실제 추적 Issue: [#4 사용자 세션 Backend](https://github.com/hkg109/infosys-investking/issues/4).

## API

기본 주소: `http://localhost:3000`. JSON으로 요청합니다.

| 요청 | 입력 | 성공 | 실패 |
|---|---|---|---|
| POST /api/users/join | nickname, pin | 201, user와 세션 쿠키 | 400 입력 오류, 409 닉네임 중복 |
| POST /api/users/recover | nickname, pin | 200, 기존 user와 새 세션 쿠키 | 400 입력 오류, 401 인증 실패 |
| GET /api/users/me | 세션 쿠키 | 200, user | 401 미인증·만료 |
| POST /api/users/logout | 세션 쿠키 | 204, 현재 세션 폐기 | DB 장애 시 503 |

user 응답 필드: `userId`, `nickname`, `role`, `createdAt`.
실패 응답 형식: `{ "error": "NICKNAME_TAKEN" }` 등 코드만 제공합니다.
입력 오류 코드는 `INVALID_INPUT`, 복구 실패는 `INVALID_CREDENTIALS`, 세션 미인증은 `AUTH_REQUIRED`입니다. 잘못된 JSON은 `INVALID_JSON`, 8KB 초과 요청은 `PAYLOAD_TOO_LARGE`입니다.
허용되지 않은 브라우저 Origin은 403 `ORIGIN_NOT_ALLOWED`, DB 미설정은 503 `DATABASE_UNAVAILABLE`, DB 요청 실패는 503 `SERVICE_UNAVAILABLE`입니다.

## 닉네임·PIN 정책

- 닉네임은 앞뒤 공백 제거 및 Unicode NFC 정규화 후 저장합니다. 공백만 있는 이름과 제어문자는 거절합니다.
- 구현상 최대 30자이며 대소문자를 구분합니다. 길이·대소문자 정책은 이번 구현의 기본값으로 팀 협의 시 조정할 수 있습니다.
- PostgreSQL UNIQUE 제약으로 동시 참가의 중복 닉네임도 보호합니다.
- PIN은 문자열 형태의 ASCII 숫자 정확히 4자리입니다. `"0012"`는 유효하지만 숫자 `12`는 유효하지 않습니다.
- Node.js scrypt와 사용자별 랜덤 salt를 사용해 PIN을 해시 저장합니다. PIN 원문·해시·세션 토큰은 JSON 응답과 로그에 포함하지 않습니다.
- 기획에 따라 PIN 재시도 횟수 제한과 계정 잠금은 구현하지 않습니다. 4자리 PIN의 짧은 탐색 공간에 대한 제한은 남아 있습니다.
- 참가 시 role은 서버가 USER로 고정합니다. 클라이언트가 보낸 ADMIN 값은 사용하지 않습니다.

## 세션 및 Frontend 인계

서버는 무작위 256비트 세션 토큰을 HttpOnly·SameSite=Strict 쿠키에 저장합니다. DB에는 토큰의 SHA-256 해시만 보관합니다. 거래 API에서도 같은 로그인을 사용하도록 쿠키 경로는 `/api`이며 유효 기간은 발급 후 7일입니다.

Frontend는 요청 시 `credentials: 'include'`를 사용합니다. 예:

```js
const response = await fetch('http://localhost:3000/api/users/join', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ nickname, pin }),
})
const result = await response.json()
```

새로고침 후 `GET /api/users/me`로 기존 사용자를 확인합니다. userId는 응답에서 표시·참조할 수 있지만 userId만으로는 인증되지 않습니다. 쿠키가 없거나 만료되면 닉네임+PIN 복구를 사용합니다. PIN은 localStorage에 저장하지 않습니다.

복구 시 요청에 포함된 기존 세션은 교체됩니다. 다른 기기의 유효 세션은 유지됩니다. 로그아웃은 현재 세션만 폐기합니다. 만료 세션은 인증을 거절하고 새 세션 발급 시 정리합니다.

로컬에서는 Frontend와 API의 호스트를 모두 localhost로 통일합니다. localhost와 127.0.0.1을 섞지 않습니다. LAN 사용 시 둘 다 서버 PC의 같은 IP를 사용하고 CLIENT_URL을 실제 Frontend origin으로 변경합니다. 서로 다른 사이트에 배포하는 쿠키 구성은 이번 단계에서 지원하지 않습니다.

## 저장·복구 범위

사용자와 세션을 PostgreSQL에 저장하므로 HTTP 서버 재시작 후에도 복구할 수 있습니다. DB 연결이 없으면 임시 메모리 사용자로 대체하지 않습니다.
4단계부터 자산과 게임 상태를 PostgreSQL에 저장하며 Wallet/Portfolio 조회는 검증된 세션의 userId를 기준으로 수행합니다.
관리자 인증, Socket 연결 인증, `user:join`은 이번 범위에 포함하지 않습니다. Frontend는 참가·복구·자동 세션 확인·로그아웃 API와 연결되어 있으며 자산·게임 상태는 아직 예시 화면입니다.

## 검증

`server`에서 `npm test`를 실행합니다. PIN salt·앞자리 0 처리, DB 미설정·origin 차단, 기존 Socket 회귀 테스트를 포함합니다.
TEST_DATABASE_URL이 설정되면 실제 PostgreSQL로 입력 오류, 동시 중복, 해시 저장, 클라이언트 role 무시, 사용자 ID만 이용한 접근 거절, 서버·Pool 재생성 후 세션 유지, PIN 복구·세션 교체·로그아웃·만료를 검증합니다.
실제 브라우저의 쿠키 전달 및 UI 오류 표시 확인은 재헌 연동 후 별도로 수행합니다.

2026-09-14 로컬 PostgreSQL 17에서 `npm run db:migrate` 성공 및 `npm test` 4개 전체 통과(skip 0)를 확인했습니다. 테스트별 임시 스키마는 종료 후 삭제되며 실제 사용자 테이블에는 테스트 참가자를 남기지 않습니다.

2026-09-15 Frontend 프로덕션 빌드 성공, 브라우저에서 참가/복구 화면 전환과 입력 오류 표시를 확인했습니다. 실제 브라우저 쿠키를 이용한 참가·새로고침·복구·로그아웃의 공동 검증은 행사 환경 통합 테스트에서 진행합니다.

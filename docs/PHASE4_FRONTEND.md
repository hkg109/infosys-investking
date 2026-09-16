# 4단계 재헌: 실제 API 기반 거래 UI

> 아래는 4단계 당시 기록이다. 서버 주문 보관·기기 간 복구·등락률·서버 자산 계산 보완은 [5단계 문서](PHASE5_FRONTEND.md)를 따른다.

## 구현

- `GET /api/trading/market`, `GET /api/trading/portfolio`, `POST /api/trading/orders`를 실제 Backend 규약으로 연결.
- 종목/매수·매도/수량 입력, 현재가·보유 현금·선택 종목 보유량·예상 거래 금액 표시.
- 1~1,000,000 정수 검사, 현금 부족·보유량 초과 사전 안내. 실제 체결 판단과 금액은 서버 응답을 사용.
- WAITING/PAUSED/FINISHED/RESULT 및 데이터 확인 실패 시 새 주문 금지. 처리 중 중복 입력 차단.
- 성공 시 서버의 거래 가격·수량·금액을 표시하고 account로 현금/보유량 갱신. 주기 조회와 수동 새로고침 제공.
- 각 주문은 UUID orderId를 한 번 생성. LAN HTTP에서 randomUUID가 없으면 getRandomValues 기반 UUID v4를 사용. 보내기 전에 사용자별 sessionStorage 키에 원문 주문 보관.
- 네트워크/timeout/5xx/잘못된 성공 응답은 불확실 상태 유지. 다른 주문 입력을 잠그고 동일 orderId·종목·수량으로 명시적으로 재요청. 새로고침 후에도 복원.
- 거래 API의 확정 거절은 오류 표시 후 해당 보관 기록 정리. 성공 또는 duplicate 응답도 확인 후 정리. 단, 인증·origin·timeout·요청 제한(401/403/408/429)은 기존 주문의 체결 여부를 확정하지 못하므로 기록을 유지한다. 로그인 만료 시 같은 닉네임과 PIN으로 복구 후 재확인한다.
- 같은 주문 확인은 읽기 전용 조회가 아니다. 이전 요청이 서버에 도착하지 않았다면 동일한 주문을 실제 처리할 수 있음을 UI에 안내.
- sessionStorage 접근 불가 시 새 주문을 보내지 않는다. 탭을 완전히 닫으면 sessionStorage는 없어질 수 있으며 다른 기기 복원은 서버 주문 조회 API가 필요하다.

## 3단계 실제 규약 반영

이전 PR #8의 제안 API를 실제 구현에 맞췄다.

- `GET /api/game`, `POST /api/game/admin/{start,pause,resume,end}`
- `game:state` 수신 시 최신 HTTP 상태 재조회.
- 관리자 비밀번호는 화면 메모리에서만 유지하며 Bearer 헤더로 전송. 저장소/로그에 저장하지 않음. 실제 인증은 서버가 수행.
- 게임 정보와 개인 자산을 별도 API에서 가져오므로 거래 DB 조회 실패가 게임 상태 조회 자체를 막지 않음.
- 서버가 주는 remainingSeconds는 현재 구간(TRADING/RESULT)의 잔여 시간이다.

## 현재 Backend가 제공하지 않는 값

- 시장 API에 등락률/기준가가 없어 등락률은 `—`로 표시한다. 임의 0%를 만들지 않는다.
- 접속 참가자 수와 뉴스는 현재 API에 없어 기존 미확인 표시를 유지한다.
- 총자산/평가액은 API의 cash와 holdings[].marketValue를 합산한 화면 표시 값이다. 주문 승인/순위 기준으로 사용하지 않는다. 최종 순위는 6단계 서버 계산으로 연결해야 한다.

## 실행·검증

실제 실행은 README의 PostgreSQL 설정 및 `server`의 `npm run db:migrate`가 필요하다. Frontend는 `client`에서 `npm install`, `npm run dev`. 기본 Vite 프록시를 사용하면 추가 API 주소 설정은 필요 없다.

- `cd client && npm test`: 13개 통과. 수량 경계, 거래 상태 차단, 현금/보유량 검사, 실제 응답 매핑, 동일 주문 ID 재전송, 불확실 응답 구분 등.
- `cd client && npm run build`: 성공.
- 브라우저 fixture: 실제 GameEngine/GameRouter로 관리자 시작·일시정지·재개 인증 및 상태 전달 검증. 거래/계정 응답은 메모리 fixture이며 실제 DB가 아니다.
- 매수 2주 → 현금 980,000원/2주, 매도 1주 → 990,000원/1주, 보유량 초과 매도 안내, PAUSED 입력 비활성 확인.
- 체결 후 503을 재현해 불확실 주문 복원 및 새로고침 후 같은 주문 확인 수행. duplicate 응답 후 추가 차감 없이 990,000원/1주 유지 확인.

### 재현 가능한 브라우저 fixture

루트에서 아래 서버를 실행한다. 테스트용 인증과 거래 응답을 사용하므로 행사 운영에 사용하지 않는다. 실제 DB나 계정은 접근하지 않는다.

```sh
node client/test/fixtures/server.mjs
```

다른 터미널의 `client` 디렉터리:

```sh
VITE_API_BASE_URL=http://localhost:3100 npm run dev
```

`http://localhost:5173/admin`에서 테스트 비밀번호 `fixture-only`로 시작. `/game`에서 주문한다.

다음 주문을 체결하고 503을 반환하도록 설정하는 테스트 전용 명령:

```sh
curl -X POST http://127.0.0.1:3100/fixture/drop-next
```

## 실제 PostgreSQL 검증 (2026-09-15)

Homebrew PostgreSQL 17.11을 설치하고 운영 데이터와 분리된 테스트 클러스터를 127.0.0.1:55432에서 실행했다. 자동 시작 서비스는 등록하지 않았다.

- 실제 DB를 지정한 서버 테스트 **11개 통과, skip 0개**.
- 추가 `server/test/phase4-flow.test.js`는 실제 사용자 API, 실제 GameEngine, 실제 거래 API, Frontend의 getTrading/sendOrder를 함께 사용한다.
- 참가 → 매수 → 체결 뒤 응답 유실 → 일시정지 → 로그아웃 → 인증 만료 시 미확인 유지 → PIN 복구 → 동일 주문 재확인 검증. 최종 원장 2건, 잔액 990,000원, A 보유 1주.
- 동시 매수의 현금 초과 차단, 같은 orderId의 동시 전송, 거래 마감 이후 신규 주문 차단은 실제 DB 거래 테스트로 통과.
- 브라우저에서도 실제 참가 쿠키로 매수 2주 → 매도 1주 → 로그아웃 → PIN 복구를 수행. 화면의 990,000원/1주와 PostgreSQL 조회 결과(원장 2건)가 일치했다.
- 실제 관리자 API로 일시정지 후 사용자 주문 입력 비활성 확인.

재실행: 개발용 DB 주소를 TEST_DATABASE_URL에 지정하고 server에서 npm test를 실행한다. 테스트는 임시 스키마만 만들고 정리한다. 브라우저 확인은 README대로 별도의 개발 DB에 마이그레이션 후 실제 server와 client를 실행한다.

## 모바일 화면 너비 검증

자동 브라우저의 viewport 설정이 반영되지 않는 문제는 실제 앱을 지정 너비 iframe으로 여는 개발 전용 `client/test/mobile.html`로 해결했다. 이 파일은 production build에 포함되지 않는다.

- 개발 서버의 `/test/mobile.html`에서 320, 360, 390, 430, 768px 선택 가능.
- 각 너비에서 iframe 문서의 clientWidth와 scrollWidth가 동일함을 확인(화면 전체 가로 넘침 없음).
- 390px 화면의 주문 입력 배치를 육안 확인. 320px에서 종목·거래 종류 선택, 수량 입력 및 보유량 초과 매도 안내 검증.
- 실제 DB 자산 복구 및 실시간 일시정지 차단도 좁은 화면에서 확인.

이는 CSS 반응형 검증이다. 실제 스마트폰의 터치, 숫자 키보드, Safari/Chrome 동작, Wi-Fi 연결 검증은 기기에서 별도로 수행해야 한다. 실제 기기 확인 없이 완료로 기록하지 않는다.

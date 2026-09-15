# 4단계 재헌: 실제 API 기반 거래 UI

## 구현

- `GET /api/trading/market`, `GET /api/trading/portfolio`, `POST /api/trading/orders`를 실제 Backend 규약으로 연결.
- 종목/매수·매도/수량 입력, 현재가·보유 현금·선택 종목 보유량·예상 거래 금액 표시.
- 1~1,000,000 정수 검사, 현금 부족·보유량 초과 사전 안내. 실제 체결 판단과 금액은 서버 응답을 사용.
- WAITING/PAUSED/FINISHED/RESULT 및 데이터 확인 실패 시 새 주문 금지. 처리 중 중복 입력 차단.
- 성공 시 서버의 거래 가격·수량·금액을 표시하고 account로 현금/보유량 갱신. 주기 조회와 수동 새로고침 제공.
- 각 주문은 UUID orderId를 한 번 생성. LAN HTTP에서 randomUUID가 없으면 getRandomValues 기반 UUID v4를 사용. 보내기 전에 사용자별 sessionStorage 키에 원문 주문 보관.
- 네트워크/timeout/5xx/잘못된 성공 응답은 불확실 상태 유지. 다른 주문 입력을 잠그고 동일 orderId·종목·수량으로 명시적으로 재요청. 새로고침 후에도 복원.
- 4xx 확정 거절은 오류 표시 후 해당 보관 기록 정리. 성공 또는 duplicate 응답도 확인 후 정리.
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

- `cd client && npm test`: 12개 통과. 수량 경계, 거래 상태 차단, 현금/보유량 검사, 실제 응답 매핑, 동일 주문 ID 재전송, 불확실 응답 구분 등.
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

실제 PostgreSQL과 브라우저 쿠키를 통한 전체 참가→거래 통합 검증, 행사 스마트폰 테스트는 별도 필요하다. 이 환경에는 PostgreSQL 실행 파일과 TEST_DATABASE_URL이 없어 실제 DB 테스트는 수행하지 않았다.

- 서버 회귀 테스트: 8개 통과, PostgreSQL 통합 테스트 2개는 TEST_DATABASE_URL 미설정으로 skip.
- 데스크톱 브라우저 화면 검증 완료. 자동 브라우저의 모바일 크기 변경이 적용되지 않아 실제 스마트폰 레이아웃 검증은 미완료.

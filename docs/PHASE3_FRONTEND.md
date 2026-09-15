# 3단계 재헌 Frontend: 관리자·사용자 대시보드

## 구현 범위와 현재 제한

협업 가이드의 작업 8(Admin Dashboard), 9(User Game Dashboard)에 해당합니다. 실제 GitHub Issue 번호가 아닙니다. 작업 시작 시 열려 있는 Issue는 없었습니다.

- 관리자: 현재 상태·월·남은 시간·접속 참가자 수·거래 상태, 시작/일시정지/재개/종료, 종료 확인 및 취소.
- 사용자: 상태별 안내, 현재 월·남은 시간·현금·주식 평가액·총자산·종목·뉴스·보유 주식.
- 서버 응답을 받은 뒤에만 상태를 변경합니다. 허용되지 않는 상태·권한 미확인·요청 중에는 제어를 차단합니다.
- 참가/복구/로그아웃은 기존 사용자 API를 유지합니다. 임의 계정이나 관리자 권한을 생성하지 않습니다.
- 기존 고정 예시 금액·종목·순위를 제거했습니다. 누락된 데이터와 실제 0원/빈 목록을 구분합니다.
- FINISHED는 종료 안내를 표시합니다. 최종 순위는 6단계 범위입니다.

**현재 main Backend에는 아래 API가 없습니다.** 실제 앱에서는 준비 중 안내 및 비활성 제어가 정상입니다. 본 PR은 Frontend 구현과 연동 제안이며, 실제 3단계 게임 운영 완료를 뜻하지 않습니다. 서버 상태/타이머/인증/거래 마감은 지석 담당입니다.

## 제안 API — Backend와 합의 필요

요청 어댑터는 `client/src/game/api.js`에 있습니다. 확정된 계약과 달라지면 이 파일과 응답 매핑을 수정합니다.

| 요청 | 용도 |
|---|---|
| GET /api/game/state | 인증된 사용자의 최신 화면 데이터 |
| POST /api/game/start | WAITING → RUNNING |
| POST /api/game/pause | RUNNING → PAUSED |
| POST /api/game/resume | PAUSED → RUNNING |
| POST /api/game/end | RUNNING/PAUSED → FINISHED |

모든 성공 응답은 다음 snapshot 형식입니다. POST는 body 없이 전송하며 사용자 자산이나 권한을 보내지 않습니다.

```json
{
  "game": {
    "status": "RUNNING",
    "currentRound": 1,
    "remainingSeconds": 540,
    "connectedParticipants": 3,
    "tradingEnabled": true
  },
  "permissions": { "canControl": false },
  "account": { "cash": 850000, "stockValue": 150000, "totalAssets": 1000000 },
  "stocks": [{ "id": "A", "name": "A 엔터", "currentPrice": 10000, "changeRate": 0 }],
  "holdings": [{ "companyId": "A", "name": "A 엔터", "quantity": 15 }],
  "news": [{ "id": "n1", "title": "학과 행사 개최 예정", "description": "공개된 뉴스 내용" }]
}
```

`game.status`는 필수이며 알 수 없는 상태는 거절합니다. 다른 데이터는 미구현 시 생략할 수 있습니다. 금액·수량·시간은 JSON 숫자이며 서버가 계산합니다. 빈 배열은 실제 자료 없음, 필드 생략은 아직 조회 불가입니다. 뉴스에는 이미 공개된 내용만 포함해야 합니다.

- 401: 다시 로그인 안내. 403: 권한 없음. 404: 서비스 준비 중. 그 외 오류·네트워크·8초 timeout: 재확인 안내.
- 권한 판단은 서버에서 수행해야 합니다. `permissions.canControl`은 버튼 표시용으로 서버 인증을 대신하지 않습니다.
- 현재 세션 쿠키 Path는 `/api/users`입니다. `/api/game` 인증에 사용하려면 Backend에서 쿠키 범위와 기존 쿠키 전환을 설계해야 합니다.
- 기존 SameSite=Strict 및 Origin 검증을 고려해 Frontend/API를 같은 사이트로 배포해야 합니다. 개발 기본값은 Vite의 `/api`, `/socket.io` 프록시입니다.
- 서버 제어 요청은 자동 재전송하지 않습니다. 응답 유실 시 최신 상태를 재조회합니다. 서버도 상태 전이·동시 요청·중복 처리를 검증해야 합니다.

## Socket과 시간 표시

- `socket.io-client` 연결. 연결/재연결, 탭 복귀, 5초 주기, 이벤트 수신 시 최신 snapshot 조회.
- 조회는 겹치지 않게 처리하고, 이전 조회가 늦게 도착해 제어 결과를 덮어쓰는 것을 방지합니다.
- `game:start/pause/resume/end`, `round:start/end`, `trading:open/close`, `stock:update`, `news:publish`는 조회 알림으로만 사용합니다.
- 현재 Backend의 payload 없는 `game:start` 테스트 이벤트로 RUNNING을 추정하지 않으며, Frontend에서 이 테스트 명령을 전송하지 않습니다.
- 서버가 보낸 남은 시간에서 수신 후 경과한 시간을 `performance.now()`로 빼서 표시합니다. PAUSED에서는 멈추며, 0이 되어도 자체적으로 다음 월이나 거래 마감으로 변경하지 않습니다.
- 오류 시 남은 시간을 숨기고 기존 데이터는 마지막 조회 값으로 남습니다. 제어는 재조회 성공 전까지 비활성입니다.
- HTTP 조회로 상태를 확인할 수 있으면 Socket 장애 중에도 주기 조회를 사용할 수 있습니다.

## 검증 (2026-09-15)

- `cd client && npm test`: 자동 테스트 5개 통과. 타이머 멈춤/0 경계, 허용 상태 전이, 권한/중복 입력 차단 표시, 누락값과 0 구분, 뉴스 HTML escape.
- `cd client && npm run build`: 프로덕션 빌드 성공.
- 임시 메모리 테스트 서버(3100)와 Vite(5173)로 브라우저 검증: 시작 → 일시정지 → 재개 → 종료 취소 → 종료 확정, 사용자 화면 동기화, 새로고침 후 종료 상태 조회.
- 브라우저 390×844 화면에서 사용자 UI 확인, document 너비와 scrollWidth 모두 390px.
- 기존 Backend + 기본 Vite 프록시에서 미구현 API(404) 안내 및 전체 제어 비활성 확인.
- 임시 서버는 실제 DB/실제 참가자에 접근하지 않았습니다. 이 검증은 제안 계약의 Frontend 검증이며 실제 Backend 통합 테스트가 아닙니다.

## 통합 시 지석과 함께 확인할 항목

1. 관리자 인증 및 게임 API에서 세션 쿠키 수신, 일반 사용자 POST 거절.
2. snapshot 계약 합의 및 서버 상태 전이/서버 타이머 구현.
3. 9분 거래 마감과 월 전환/종료 이벤트, 수신 시점 최신 snapshot 제공.
4. 실제 참가자 계정으로 브라우저 새로고침·재접속·다중 기기 검증.
5. 4~6단계 DB/거래/뉴스/순위 구현에 맞춰 선택 필드 연동.

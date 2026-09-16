# 참가자 현황·Socket 접속·게임 초기화 API

QA 2단계 Backend는 관리자 참가자 자산 조회, 사용자 세션 기반 Socket 식별, 다중 탭 온라인 상태, 종료 게임 초기화를 제공한다.

## 관리자 참가자 현황

```http
GET /api/admin/participants
Authorization: Bearer <ADMIN_PASSWORD>
```

응답 예시:

```json
{
  "onlineParticipants": 1,
  "participants": [
    {
      "userId": "user-uuid",
      "nickname": "앨리스",
      "online": true,
      "cash": 700000,
      "stockValue": 50000,
      "totalAssets": 750000,
      "holdings": [
        {
          "companyId": "A",
          "name": "A 엔터",
          "quantity": 5,
          "currentPrice": 10000,
          "marketValue": 50000
        }
      ],
      "joinedAt": "2026-09-16T10:00:00.000Z"
    }
  ]
}
```

아직 지갑이 생성되지 않은 참가자는 `INITIAL_CASH`를 현금과 총자산으로 표시한다. 참가자 정보는 관리자 Bearer 인증을 통과한 요청에만 제공한다.

## Socket 세션과 온라인 상태

Socket 연결에 유효한 `investking_session` 쿠키가 있으면 HTTP 사용자 세션과 같은 참가자로 식별한다. 개발 서버처럼 Frontend와 Backend origin이 다르면 Socket.IO Client에 `withCredentials: true`를 설정해야 한다.

```js
io(apiBaseUrl, { withCredentials: true })
```

인증된 참가자 연결에는 다음 이벤트를 개별 전송한다.

```text
session:ready
```

```json
{
  "user": {
    "userId": "user-uuid",
    "nickname": "앨리스",
    "role": "USER",
    "createdAt": "2026-09-16T10:00:00.000Z"
  }
}
```

온라인 상태는 Socket ID가 아니라 사용자 ID별 연결 개수로 관리한다.

- 같은 사용자가 탭을 추가로 열어도 온라인 참가자 수는 한 명만 증가한다.
- 일부 탭만 닫으면 온라인 상태를 유지한다.
- 마지막 탭이 끊기면 오프라인으로 변경한다.
- 재연결하면 세션 쿠키로 같은 사용자 ID를 복원한다.
- 로그아웃 또는 게임 초기화 시 해당 사용자 Socket을 서버에서 종료한다.

첫 연결과 마지막 해제 시 전체 연결에 참가자 수 변경 신호를 보낸다. 개인정보는 포함하지 않으며 관리자 화면은 이 신호를 받은 뒤 참가자 현황 API를 다시 조회한다.

```text
participants:presence
```

```json
{
  "onlineParticipants": 3
}
```

세션 쿠키가 없는 공개 Socket 연결은 기존 게임 상태와 공개 이벤트를 계속 받을 수 있지만 온라인 참가자로 계산하지 않는다.

## 종료 게임 초기화

```http
POST /api/game/admin/reset
Authorization: Bearer <ADMIN_PASSWORD>
```

`FINISHED` 상태에서만 실행할 수 있다. 성공하면 게임은 `WAITING`, 0라운드로 돌아가며 `game:reset`과 최신 `game:state`가 전송된다.

초기화 트랜잭션에서 제거하거나 복구하는 항목:

| 제거·복구 | 유지 |
|---|---|
| 일반 참가자와 사용자 세션 | 관리자 계정 |
| 지갑·보유 주식 | 기업 이름·설명·초기 가격 |
| 주문 준비·거래 내역 | 사건 원본과 기업별 효과 |
| 월별 사건 배정·주가 변경 내역 | 서버 환경 설정 |
| 순위 상태·스냅샷 | 게임 시간·라운드 설정 |
| 기업 현재가를 초기 가격으로 복구 |  |
| 게임 상태를 `WAITING`으로 복구 |  |

DB advisory lock과 행·테이블 lock으로 중복 초기화와 참가자 생성 경합을 막는다. 초기화 중 다른 변경 요청은 `409 GAME_RESET_IN_PROGRESS`로 거절하며, 일부 SQL이 실패하면 전체 작업을 rollback한다.

오류 응답:

| HTTP | 오류 | 조건 |
|---:|---|---|
| 401 | `ADMIN_AUTH_REQUIRED` | 관리자 인증 실패 |
| 409 | `GAME_RESET_NOT_ALLOWED` | 게임이 `FINISHED`가 아님 |
| 409 | `GAME_RESET_IN_PROGRESS` | 이미 초기화 중이거나 초기화 중 변경 요청 |
| 503 | `ADMIN_AUTH_UNAVAILABLE` | 관리자 비밀번호 미설정 |
| 503 | `DATABASE_UNAVAILABLE` | PostgreSQL 미설정 |

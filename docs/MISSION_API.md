# 개인 비밀 미션 API (B-13~14)

개인 비밀 미션은 게임 시작 시 참가자마다 하나씩 배정됩니다. 미션 내용과 진행도는 해당 참가자와 관리자만 볼 수 있으며, 완료 보상은 다음 단계의 추가 시장정보를 구매하는 `points`입니다.

## 지원 미션 유형

| `missionType` | 판정 시점 | `targetValue` 의미 |
|---|---|---|
| `DIVERSIFIED_HOLDINGS` | 거래 직후 | 동시에 보유한 서로 다른 종목 수 |
| `CASH_RATIO` | 거래 마감 후 | 총자산 중 현금 비중(%) |
| `CONSECUTIVE_HOLDING` | 거래 마감 후 | 같은 종목을 연속 보유한 라운드 수 |
| `CONTRARIAN_PROFIT` | 거래 직후 | 직전 라운드 하락 종목을 이익으로 매도한 체결 수 |
| `TRADE_BOTH_SIDES` | 거래 직후 | 수행한 거래 방향 수. `targetValue`는 반드시 2 |

현금 비중은 1~100, 매수·매도 경험은 정확히 2, 나머지 목표는 1~1,000 범위의 정수입니다. 보상은 1~1,000,000 포인트 범위입니다.

## 사용자 API

```http
GET /api/missions/me
Cookie: investking_session=...
```

```json
{
  "points": 30,
  "mission": {
    "missionId": "...",
    "title": "분산 투자자",
    "description": "서로 다른 종목 3개를 동시에 보유하세요.",
    "missionType": "DIVERSIFIED_HOLDINGS",
    "targetValue": 3,
    "rewardPoints": 30,
    "progress": 3,
    "status": "COMPLETED",
    "assignedAt": "...",
    "completedAt": "...",
    "rewardedAt": "..."
  }
}
```

게임 시작 전 활성 미션이 없거나 아직 배정되지 않았다면 `mission`은 `null`, 포인트는 0입니다. 다른 사용자의 미션이나 포인트를 조회하는 사용자 API는 제공하지 않습니다.

## 관리자 API

모든 요청에 `Authorization: Bearer <ADMIN_PASSWORD>`가 필요합니다.

| 요청 | 설명 |
|---|---|
| `GET /api/missions/admin` | 미션 원본과 현재 참가자별 배정·진행 상태 조회 |
| `POST /api/missions/admin` | 미션 생성 |
| `PUT /api/missions/admin/:missionId` | 미션 수정·활성 상태 변경 |
| `DELETE /api/missions/admin/:missionId` | 과거 참조를 유지하며 비활성화 |

생성·수정·비활성화는 게임이 `WAITING`일 때만 가능하며, 그 외에는 `409 MISSION_MANAGEMENT_CLOSED`입니다.

```json
{
  "title": "매매 경험",
  "description": "매수와 매도를 각각 한 번 이상 완료하세요.",
  "missionType": "TRADE_BOTH_SIDES",
  "targetValue": 2,
  "rewardPoints": 20,
  "isActive": true
}
```

## 배정·보상 정책

- 게임 시작 직전에 활성 미션을 참가자에게 한 개씩 순환 배정합니다.
- 진행 중 참가한 사용자가 있으면 활성 미션 하나를 추가 배정합니다.
- 활성 미션이 없더라도 핵심 게임은 정상 시작합니다.
- 거래 조건은 거래 DB 커밋 이후, 라운드 조건은 사건 가격 반영 이후 계산합니다.
- 완료 처리, `rewarded_at` 기록, 포인트 증가는 하나의 DB 트랜잭션에서 수행합니다.
- `(game_id, user_id)` 고유 제약과 행 잠금으로 사용자당 하나만 배정하고 보상을 한 번만 지급합니다.
- 종료 게임 초기화 시 배정·진행·포인트는 삭제하지만 미션 원본은 유지합니다.

## Socket 이벤트

다음 이벤트는 인증된 해당 사용자 방 `user:<userId>`에만 전달합니다.

| 이벤트 | 시점 |
|---|---|
| `mission:assigned` | 미션 신규 배정 |
| `mission:progress` | 거래·라운드 마감 후 진행도 갱신 |
| `mission:completed` | 조건 달성과 포인트 지급 완료 |

Payload는 모두 `{ points, mission }` 형식입니다. 재접속이나 이벤트 유실 시 `GET /api/missions/me`가 기준 데이터입니다.

## 주요 오류

`AUTH_REQUIRED`, `ADMIN_AUTH_REQUIRED`, `ADMIN_AUTH_UNAVAILABLE`, `INVALID_MISSION`, `INVALID_MISSION_TARGET`, `INVALID_MISSION_ID`, `MISSION_NOT_FOUND`, `MISSION_MANAGEMENT_CLOSED`를 사용합니다.

## Frontend 연동 (F-18~19, D-02)

- 관리자 조회 응답은 `{ missions, assignments }`, 생성(201)·수정(200)은 `{ mission }`, 비활성화는 본문 없는 204입니다. 미션 원본에는 `isActive`, `assignmentCount`가 포함됩니다.
- 제목은 NFC 정규화 후 최대 100 코드 포인트, 설명은 최대 2,000자이며 둘 다 필수입니다. 제어 문자와 줄바꿈은 허용하지 않습니다.
- 사용자 화면은 쿠키로 본인 미션만 조회합니다. 미션 Socket 이벤트, 게임 갱신, 재접속에 맞춰 서버 상태를 다시 조회합니다. 완료 여부와 지급 여부를 클라이언트에서 계산하지 않습니다.
- 세션 만료나 사용자 변경 시 이전 사용자의 미션을 숨깁니다. 일시적 조회 실패는 마지막 확인 정보임을 표시합니다.
- 관리자 변경 실패는 자동 재전송하지 않습니다. 목록을 다시 조회하여 반영 여부를 확인한 뒤 진행합니다. 게임 진행 중에는 변경을 차단하고 조회만 허용합니다.
- 정보 포인트는 투자 현금과 별도로 표시합니다. 정보 구매 화면은 다음 단계 범위입니다.
- 브라우저·자동 테스트 결과는 `QA_STAGE8_FRONTEND.md`를 참고하세요.

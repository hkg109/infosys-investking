# 3단계 게임 상태·서버 타이머 Backend

게임 상태와 시간은 서버가 단일 기준으로 관리합니다. 4단계부터 각 상태 전이를 PostgreSQL에 순서대로 저장하며 서버를 재시작하면 마지막 상태와 서버 기준 마감 시각을 복원합니다. 재시작 중 지난 경계는 복원 직후 순서대로 반영합니다.

## 기본 설정

- 상태: `WAITING`, `RUNNING`, `PAUSED`, `FINISHED`
- 진행 구간: `WAITING`, `TRADING`, `RESULT`, `PAUSED`, `FINISHED`
- 기본 12라운드, 라운드당 600초
- 라운드 시작 후 540초에 거래 마감, 나머지 60초는 결과 공개 구간
- 모든 마감과 라운드 전환은 서버 시각을 기준으로 판단

테스트나 운영 설정에서 `GAME_TOTAL_ROUNDS`, `GAME_ROUND_DURATION_MS`, `GAME_TRADING_DURATION_MS`로 값을 변경할 수 있습니다. 거래 시간은 라운드 전체 시간보다 짧아야 합니다.

## HTTP API

### 상태 조회

`GET /api/game`은 인증 없이 현재 상태를 반환합니다.

```json
{
  "game": {
    "status": "RUNNING",
    "phase": "TRADING",
    "phaseBeforePause": null,
    "currentRound": 1,
    "totalRounds": 12,
    "roundDurationSeconds": 600,
    "tradingDurationSeconds": 540,
    "tradingEnabled": true,
    "remainingSeconds": 540,
    "startedAt": "2026-09-15T12:00:00.000Z",
    "roundStartedAt": "2026-09-15T12:00:00.000Z",
    "phaseEndsAt": "2026-09-15T12:09:00.000Z",
    "pausedAt": null,
    "finishedAt": null,
    "serverTime": "2026-09-15T12:00:00.000Z"
  }
}
```

Frontend는 `phaseEndsAt`과 `serverTime`의 차이로 화면 타이머를 표시하고, 주기적으로 상태를 다시 조회하거나 Socket 상태를 받아 오차를 보정합니다. 거래 가능 여부는 화면 시간이 아닌 서버의 `tradingEnabled`가 기준입니다.

### 관리자 제어

| 요청 | 허용 상태 | 결과 |
|---|---|---|
| `POST /api/game/admin/start` | `WAITING` | 1라운드 거래 시작 |
| `POST /api/game/admin/pause` | `RUNNING` | 현재 구간 타이머 정지 |
| `POST /api/game/admin/resume` | `PAUSED` | 남은 시간부터 재개 |
| `POST /api/game/admin/end` | `RUNNING`, `PAUSED` | 즉시 종료 |

관리자 요청에는 루트 `.env`의 `ADMIN_PASSWORD`를 Bearer 토큰으로 전달합니다.

```http
Authorization: Bearer 실제-관리자-비밀번호
```

비밀번호가 설정되지 않으면 503 `ADMIN_AUTH_UNAVAILABLE`, 인증 실패는 401 `ADMIN_AUTH_REQUIRED`입니다. 현재 상태에서 허용되지 않는 전이는 409 `INVALID_GAME_STATE`와 요청 action·현재 status를 반환합니다. 관리자 비밀번호를 저장소나 로그에 남기지 않습니다.

브라우저 요청은 `CLIENT_URL`과 같은 Origin만 허용합니다. 다른 Origin은 403 `ORIGIN_NOT_ALLOWED`이며, 허용된 Origin의 `Authorization` preflight를 지원합니다.

## Socket 이벤트

연결 직후 서버가 해당 클라이언트에 `game:state`를 한 번 보내므로 새로고침·재접속 시 현재 상태를 복원할 수 있습니다. 상태 전이 때는 아래 이벤트와 최신 `game:state`를 전체 연결에 전달합니다.

- `game:start`, `game:pause`, `game:resume`, `game:end`
- `round:start`, `round:end`
- `trading:open`, `trading:close`

모든 이벤트 payload는 상태 조회의 `game` 객체와 같습니다. 클라이언트가 같은 이름의 Socket 이벤트를 서버로 보내도 제어 요청으로 처리하지 않습니다.

## 전이 순서

게임 시작 시 `game:start` → `round:start` → `trading:open` 순서입니다. 각 라운드 9분에 `trading:close`, 10분에 `round:end`를 보냅니다. 다음 라운드가 있으면 즉시 `round:start` → `trading:open`을 보내고, 마지막 라운드라면 `game:end`로 종료합니다.

서버 이벤트 루프가 잠시 지연되더라도 원래 서버 마감 시각을 기준으로 누락된 경계를 순서대로 처리합니다. 일시정지 중에는 거래가 불가능하고 타이머가 줄지 않으며, 재개하면 중단 당시 남은 시간부터 계속됩니다.

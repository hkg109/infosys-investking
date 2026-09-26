# 복수·장중 사건 Backend API

한 라운드에는 사건을 0개 이상 배정할 수 있으며 사건은 거래 중(`INTRADAY`) 또는 거래 마감(`CLOSE`)에 발생합니다. 같은 사건은 한 게임에서 한 번만 배정합니다. 모든 관리자 요청은 `Authorization: Bearer <ADMIN_PASSWORD>`를 사용하며 사건·배정 변경은 게임이 `WAITING`일 때만 가능합니다.

## 사건 원본 관리

| 요청 | 설명 |
|---|---|
| `GET /api/events/admin` | 사건과 종목별 효과 조회 |
| `POST /api/events/admin` | 사건 생성 |
| `PUT /api/events/admin/:eventId` | 사건 수정 |
| `DELETE /api/events/admin/:eventId` | 사건 삭제 |

생성·수정 body:

```json
{
  "title": "학과 축제 개최",
  "news": "학과에서 대규모 행사가 예정되어 있다.",
  "result": "행사가 성황리에 마무리됐다.",
  "effects": [
    { "companyId": "A", "changeRate": 20 },
    { "companyId": "C", "changeRate": -5 }
  ]
}
```

`changeRate`는 -99~1000의 정수입니다. 비활성 종목을 참조하는 기존 사건은 보존하지만 새 배정에는 사용할 수 없습니다.

## 배정 관리

| 요청 | 설명 |
|---|---|
| `GET /api/events/admin/schedule` | 평면 `schedule`과 라운드별 `rounds` 조회 |
| `PUT /api/events/admin/schedule` | 전체 수동 배정 교체 |
| `POST /api/events/admin/schedule/randomize` | 폐기됨: 관리자 인증 후 410 `MANUAL_SCHEDULE_ONLY`, DB 변경 없음 |

수동 배정 예시입니다. `rounds`에 없는 라운드와 `events: []`인 라운드는 사건이 없습니다.

```json
{
  "rounds": [
    {
      "round": 1,
      "events": [
        {
          "eventId": "11111111-1111-4111-8111-111111111111",
          "displayOrder": 1,
          "triggerPhase": "INTRADAY",
          "triggerOffsetSeconds": 180,
          "preannounceSeconds": 30
        },
        {
          "eventId": "22222222-2222-4222-8222-222222222222",
          "displayOrder": 2,
          "triggerPhase": "CLOSE"
        }
      ]
    },
    { "round": 2, "events": [] }
  ]
}
```

`triggerOffsetSeconds`와 `preannounceSeconds`는 서버의 라운드 시작 시각을 기준으로 계산합니다. 장중 사건은 거래 종료 및 다른 사건의 예고·거래정지 구간과 겹칠 수 없습니다. `CLOSE` 사건에는 두 시간 필드를 지정하지 않습니다.

19단계부터 사건은 수동으로만 배정합니다. 게임 시작과 서버 재시작은 저장된 배정을
조회·실행할 뿐 새 사건을 고르거나 빈 달을 채우지 않습니다. 배정을 한 번도 저장하지
않았거나 빈 `rounds`를 저장한 경우 모두 사건 없이 게임을 진행할 수 있습니다.
기존 무작위 방식으로 저장된 배정도 그대로 보존하며, 변경하려면 수동 배정을 저장합니다.
DB 구조 변경은 없습니다. `event_schedule_states.mode`의 과거 `RANDOM` 값은 호환을 위해 유지합니다.

주요 오류는 `INVALID_EVENT_SCHEDULE`, `EVENT_SCHEDULE_CONFLICT`, `DUPLICATE_EVENT_ASSIGNMENT`, `EVENT_NOT_FOUND`, `EVENT_MANAGEMENT_CLOSED`입니다.

## 사용자 복구 API

`GET /api/events/current`는 `{ game, events, event }`를 반환합니다. `events`는 현재 라운드의 모든 사건이며 `event`는 이전 Frontend 호환용 첫 사건입니다. 아직 발생하지 않은 사건에는 결과와 변동 내역이 포함되지 않습니다. 발생한 사건에는 `result`, `appliedAt`, `changes`가 포함됩니다.

## 장중 반영과 동시성

1. 예고 시각에 `market:event:warning`을 전송합니다.
2. 발생 시 서버가 신규 주문 접수를 즉시 막고, 이미 접수된 주문이 기존 가격으로 끝날 때까지 기다립니다.
3. `trading:halt`를 전송하고 사건 적용과 모든 종목 가격 변경을 한 DB transaction으로 처리합니다.
4. `market:event:breaking`, `event:result`, `stock:update`, `ranking:update` 순으로 갱신합니다.
5. 최소 거래정지 시간이 지나면 주문을 열고 `trading:resume`을 전송합니다.

정지 중 주문은 HTTP 409 `MARKET_HALTED`입니다. `game_events.applied_at` 행 잠금과 `stock_price_changes(game_event_id, company_id)` 기본키로 재시작·중복 타이머·동시 실행에서도 사건을 한 번만 적용합니다. 서버 재시작 시 저장된 `scheduled_at`과 게임 상태를 대조해 누락된 사건을 순서대로 보정합니다.

## Socket 이벤트

| 이벤트 | 시점 |
|---|---|
| `news:publish` | 라운드 시작, 해당 라운드 사건 뉴스 공개 |
| `market:event:warning` | 장중 사건 사전 예고 |
| `trading:halt` | 신규 주문 접수 중단 및 기존 주문 drain 완료 |
| `market:event:breaking` | 장중 사건 DB 반영 완료 |
| `event:result` | 사건 결과 공개(기존 Frontend 호환 포함) |
| `stock:update` | 종목별 변경 전·후 가격 전달 |
| `ranking:update` | 변경 가격 기준 순위 재계산 |
| `trading:resume` | 장중 거래 재개 |

Socket은 실시간 알림이며 재접속 복구 기준은 PostgreSQL과 `GET /api/events/current`입니다.

## QA 4단계 Frontend 연동 보완

`GET /api/events/admin/schedule`는 기존 `schedule`, `rounds` 외에 아래 `constraints`를 반환합니다. UI는 실제 서버 설정을 사용해 시간 충돌을 검증합니다. 서버와 클라이언트를 함께 업데이트해야 합니다. DB migration은 추가되지 않습니다.

```json
{
  "constraints": {
    "totalRounds": 12,
    "tradingDurationMs": 540000,
    "haltDurationMs": 3000
  }
}
```

- 발생 초는 월 시작 기준이며, `preannounceSeconds`는 **발생 몇 초 전**을 뜻합니다. 예고 시각은 `triggerOffsetSeconds - preannounceSeconds`입니다.
- 장중 발생은 1초 이상, 예고 초는 0 이상이며 발생 초보다 작아야 합니다. 발생 시각 + 최소 거래정지 시간이 거래 종료보다 엄격히 작아야 합니다.
- 같은 달의 `[예고 시작, 거래정지 종료)` 구간이 겹치면 거부합니다. 앞 구간 종료와 다음 구간 시작이 정확히 같은 경우는 허용합니다.
- 월별 최대 10개, `displayOrder`는 월 안에서 서로 다른 양의 정수입니다. 장중 실행 시각과 표시 순서는 별도입니다.
- `CLOSE`에는 발생 초와 예고 초를 보내지 않습니다. 빈 `rounds` 저장은 사건 없는 게임을 명시적으로 설정합니다. 배정을 한 번도 설정하지 않아도 사건 없이 시작합니다.
- 프론트엔드 검사는 입력 안내이며 최종 유효성·동시 변경 판정은 서버가 수행합니다. 통신 실패 시 자동 재전송 없이 목록 재조회 후 초안과 비교합니다.

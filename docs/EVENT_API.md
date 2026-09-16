# 5단계 사건·뉴스·주가 변동 Backend

사건 원본과 기업별 고정 변동률은 PostgreSQL에 저장합니다. 관리자는 게임이 `WAITING`일 때만 사건을 생성·수정·삭제할 수 있습니다. 게임 시작 요청은 등록 사건 수를 확인한 뒤 사건을 중복 없이 섞어 전체 라운드에 배정합니다.

## 관리자 API

모든 관리자 요청은 `Authorization: Bearer <ADMIN_PASSWORD>`를 사용합니다.

| 요청 | 설명 |
|---|---|
| `GET /api/events/admin` | 사건과 효과 전체 조회 |
| `POST /api/events/admin` | 사건 생성 |
| `PUT /api/events/admin/:eventId` | 사건 수정 |
| `DELETE /api/events/admin/:eventId` | 사건 삭제 |
| `GET /api/events/admin/schedule` | 현재 게임의 월별 배정 조회 |

생성·수정 body:

```json
{
  "title": "학과 축제 개최",
  "news": "학과에서 대규모 행사가 예정되어 있다.",
  "result": "행사가 성황리에 마무리됐다.",
  "effects": [
    { "companyId": "A", "changeRate": 20 },
    { "companyId": "C", "changeRate": 10 },
    { "companyId": "G", "changeRate": -5 }
  ]
}
```

`changeRate`는 -99~1000 범위의 정수입니다. 같은 사건에서 같은 기업을 두 번 지정할 수 없습니다. 존재하지 않는 기업은 `COMPANY_NOT_FOUND`, 게임 시작 후 변경 요청은 `EVENT_MANAGEMENT_CLOSED`입니다.

등록 사건 수가 전체 라운드보다 적으면 `POST /api/game/admin/start`는 게임 상태를 바꾸지 않고 409 `EVENT_POOL_TOO_SMALL`을 반환합니다.

## 사용자 복구 API

`GET /api/events/current`는 현재 게임 상태와 현재 라운드 사건을 반환합니다. 거래 중에는 `title`과 `news`만 공개하며 효과와 결과는 포함하지 않습니다. 결과 구간부터 `result`, `appliedAt`, `changes`가 추가됩니다.

```json
{
  "event": {
    "round": 1,
    "eventId": "...",
    "title": "학과 축제 개최",
    "news": "학과에서 대규모 행사가 예정되어 있다.",
    "applied": true,
    "result": "행사가 성황리에 마무리됐다.",
    "changes": [
      {
        "companyId": "A",
        "name": "A 엔터",
        "changeRate": 20,
        "previousPrice": 10000,
        "newPrice": 12000
      }
    ]
  }
}
```

## 처리 순서와 중복 방지

1. 게임 시작 전에 전체 라운드의 사건을 무작위 배정합니다.
2. `round:start` 때 해당 월의 뉴스만 공개합니다.
3. 서버가 거래를 닫은 뒤 해당 사건의 기업 행을 잠급니다.
4. `현재가 × (100 + 변동률) / 100`을 반올림하고 최소 1원으로 저장합니다.
5. 변경 전·후 가격을 `stock_price_changes`에 기록하고 사건을 적용 완료 처리합니다.

`game_events` 행 잠금과 가격 변경 기록의 복합 기본키로 같은 월 사건은 한 번만 반영됩니다. 서버 재시작 시 이미 지난 결과 구간을 순서대로 보정하며 저장된 결과를 재사용합니다.

## Socket 이벤트

| 이벤트 | 시점 | Payload |
|---|---|---|
| `news:publish` | 월 시작 | 결과·변동률을 제외한 현재 사건 |
| `event:result` | 거래 마감 후 DB 반영 완료 | 사건 결과와 기업별 변경 전·후 가격 |
| `stock:update` | `event:result` 직후 | `round`, `changes` |

Socket은 알림 수단이며 복구 기준은 `GET /api/events/current`와 PostgreSQL입니다.

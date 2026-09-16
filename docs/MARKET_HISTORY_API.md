# 월별 거래·주가 분석 API (B-11~12)

각 체결에는 서버가 주문을 접수한 시점의 `round`가 저장됩니다. 참가자는 자신의 거래만 볼 수 있고, 관리자는 인증 후 지정 참가자의 거래를 조회할 수 있습니다. 실현손익은 이전 월의 미매도 수량까지 이어지는 FIFO(선입선출) 기준입니다.

## API

| 요청 | 인증 | 설명 |
|---|---|---|
| `GET /api/trading/history?round=1` | 사용자 세션 쿠키 | 본인의 월별 체결·요약·실현손익 |
| `GET /api/admin/participants/:userId/trades?round=1` | 관리자 Bearer | 지정 참가자의 월별 체결·요약·실현손익 |
| `GET /api/trading/companies/:companyId/history` | 사용자 세션 쿠키 | 종목의 월별 시가·장중 사건 직후 가격·종가 |

`round`를 생략하면 전체 라운드 거래를 반환합니다. 게임의 전체 라운드 범위를 벗어나면 `400 INVALID_ROUND`입니다. 관리자 API는 `Authorization: Bearer <ADMIN_PASSWORD>`가 필요합니다.

## 거래 내역 응답

```json
{
  "round": 1,
  "trades": [
    {
      "transactionId": "...",
      "orderId": "...",
      "round": 1,
      "companyId": "A",
      "companyName": "A 엔터",
      "type": "SELL",
      "quantity": 3,
      "price": 12000,
      "totalPrice": 36000,
      "realizedProfit": 6000,
      "createdAt": "2026-09-16T07:00:00.000Z"
    }
  ],
  "summary": {
    "tradeCount": 1,
    "buyQuantity": 0,
    "sellQuantity": 3,
    "buyAmount": 0,
    "sellAmount": 36000,
    "netCashFlow": 36000,
    "realizedProfit": 6000
  }
}
```

매수 건의 `realizedProfit`은 `null`입니다. 관리자의 응답에는 동일한 데이터와 함께 `participant: { userId, nickname }`이 추가됩니다. 공개 순위 API에는 거래 상세나 닉네임을 추가하지 않습니다.

## 주가 이력 응답

```json
{
  "company": {
    "companyId": "A",
    "name": "A 엔터",
    "description": "엔터테인먼트 기업",
    "active": true
  },
  "history": [
    {
      "round": 1,
      "openingPrice": 10000,
      "closingPrice": 11000,
      "changeRate": 10,
      "snapshots": [
        { "snapshotType": "OPEN", "price": 10000, "changeRate": 0, "recordedAt": "..." },
        {
          "snapshotType": "INTRADAY_EVENT",
          "price": 11000,
          "changeRate": 10,
          "recordedAt": "...",
          "event": { "gameEventId": "...", "eventId": "...", "title": "속보", "result": "상승" }
        },
        { "snapshotType": "CLOSE", "price": 11000, "changeRate": 10, "recordedAt": "..." }
      ]
    }
  ]
}
```

장중 사건이 발생하면 모든 활성 종목의 가격을 같은 시점에 저장합니다. 사건 영향을 받지 않은 종목도 변동 없는 스냅샷이 남으므로 종목별 차트의 시간축이 일치합니다. 같은 사건 재처리와 라운드 경계 재처리는 DB 고유 인덱스로 중복 저장되지 않습니다.

## DB·운영

`npm run db:migrate`를 실행하면 `transactions.round_number`와 `stock_price_history`가 추가됩니다. 기존 거래의 라운드는 호환을 위해 1로 채워집니다. 종료 게임 초기화 시 거래·사용자 데이터와 함께 주가 스냅샷도 삭제됩니다.

Frontend는 월별 거래 화면에서 `trades`와 `summary`를 사용하고, 차트는 `history[].snapshots`를 시간순으로 그립니다. 서버가 반환한 금액과 손익을 클라이언트에서 다시 계산하지 않습니다.

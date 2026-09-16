# 4단계 DB·주식 거래 Backend

PostgreSQL에 `Game`, `Company`, `Wallet`, `Portfolio`, `Transaction` 역할의 테이블을 추가합니다. 모든 금액과 수량은 정수이며 기본 보유 현금은 1,000,000원입니다. 수수료·대출·공매도는 없습니다.

서버 실행 전 `npm run db:migrate`를 실행합니다. 기본 기업 A~G는 최초 migration 때 10,000원으로 생성하며 이미 존재하는 기업의 이름과 가격은 덮어쓰지 않습니다.

## API

| 요청 | 인증 | 설명 |
|---|---|---|
| `GET /api/trading/market` | 없음 | 기업·현재가 목록 |
| `GET /api/trading/portfolio` | 세션 쿠키 | 현금과 기업별 보유 수량·평가액 |
| `POST /api/trading/orders` | 세션 쿠키 | 매수 또는 매도 |

Frontend 요청에는 사용자 API에서 발급받은 HttpOnly 쿠키가 포함되도록 `credentials: 'include'`를 사용합니다.

```json
{
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "companyId": "B",
  "type": "BUY",
  "quantity": 10
}
```

`orderId`는 요청마다 Frontend가 생성한 UUID입니다. `type`은 `BUY` 또는 `SELL`, `quantity`는 1 이상 1,000,000 이하의 안전한 정수입니다. 성공한 새 주문은 201, 이미 성공한 동일 주문의 재전송은 200과 `duplicate: true`를 반환합니다. 같은 `orderId`에 다른 내용을 보내면 409 `ORDER_ID_CONFLICT`입니다.

성공 응답에는 체결 가격·금액을 담은 `transaction`과 거래 직후의 `account`가 함께 포함됩니다. 참가자 주문은 시장 가격을 변경하지 않습니다.

## 검증과 동시성

- 서버가 요청을 받은 즉시 게임 snapshot을 잡아 `RUNNING`·`TRADING` 여부를 판정합니다. 화면 타이머는 승인 기준이 아닙니다.
- 같은 사용자의 주문은 지갑 행 `FOR UPDATE` 잠금으로 직렬화하여 현금·보유량이 음수가 되지 않게 합니다.
- 동일 `orderId` 요청은 PostgreSQL advisory transaction lock과 UNIQUE 제약으로 한 번만 반영합니다.
- 매수는 현재 현금, 매도는 현재 보유량을 트랜잭션 안에서 다시 확인합니다. 실패 시 전체 변경을 rollback합니다.

주요 오류 코드는 `AUTH_REQUIRED`, `INVALID_INPUT`, `GAME_NOT_RUNNING`, `TRADING_CLOSED`, `COMPANY_NOT_FOUND`, `INSUFFICIENT_CASH`, `INSUFFICIENT_SHARES`, `ORDER_ID_CONFLICT`입니다.

## 게임 상태 복원

단일 활성 게임은 고정 내부 ID로 저장합니다. 상태·현재 라운드·마감 시각·일시정지 잔여 시간을 복원하며, 상태 이벤트 저장 순서는 서버 내부 Promise queue로 보장합니다. 5단계 사건·주가 변경은 거래 마감 후 적용되며, 6단계 순위 확정은 갱신된 현재가와 거래 원장 위에서 이어서 구현합니다.

# 18단계 — 관리자 참가자 자산 정정

관리자 참가자 화면(`/admin/participants`)의 상세창에서 현금과 선택한 종목 하나의
**변경 후 최종 값**을 지정한다. 게임 대기(WAITING) 또는 일시정지(PAUSED)에만 허용한다.
현금 0~1조 원, 주식 0~100만 주의 정수와 1~300자 수정 사유가 필요하다.
0주는 해당 종목 보유 해제다. 비활성 종목은 수량을 줄일 수 있지만 늘릴 수 없다.

## API

공통: `Authorization: Bearer <관리자 비밀번호>`, JSON, `Cache-Control: no-store`.
기존 관리자 API의 Origin 제한을 적용한다. 참가자 쿠키만으로 조회·수정할 수 없다.

### POST /api/admin/participants/:userId/assets

```json
{
  "requestId": "f107dcdf-8651-46e6-bca7-f964d01c4c83",
  "cash": 900000,
  "expectedCash": 1000000,
  "companyId": "A",
  "quantity": 5,
  "expectedQuantity": 0,
  "reason": "운영 중 지급 오류 정정"
}
```

- `requestId`: 클라이언트 UUID. 동일 요청을 재시도할 때 반드시 그대로 사용한다.
- `expectedCash`, `expectedQuantity`: 편집을 시작할 때 조회한 값. 서버 현재 값과 다르면
  409 `ASSET_CONFLICT`로 거절하고 `current:{cash,quantity}`를 반환한다. 최신 값을 불러온 뒤 새 요청을 만든다.
- 현금만 바꿀 때 `companyId`, `quantity`, `expectedQuantity` 세 필드는 모두 생략한다.
- 주식만 바꿀 때도 현재 현금을 `cash`와 `expectedCash`에 전달한다.
- 성공 200: `requestId`, `userId`, `companyId`(현금만이면 null), `reason`,
  `before:{cash,quantity}`, `after:{cash,quantity}`, `duplicate`.
- 같은 UUID와 같은 입력은 기존 결과를 `duplicate:true`로 반환한다. 이후 게임이 시작되거나
  다른 수정이 이루어져도 과거 요청을 다시 적용하지 않는다. 입력을 바꾸면
  409 `ADJUSTMENT_ID_CONFLICT`다. 사유 앞뒤 공백은 정규화한다.

주요 오류: 400 `INVALID_INPUT` / `NO_ASSET_CHANGE` / `ASSET_LIMIT_EXCEEDED`,
404 `PARTICIPANT_NOT_FOUND` / `COMPANY_NOT_FOUND`,
409 `ASSET_ADJUSTMENT_CLOSED` / `ASSET_CONFLICT` / `COMPANY_INACTIVE`.

### GET /api/admin/participants/:userId/adjustments

`{adjustments:[...]}`에 최근 50건을 최신순으로 반환한다. 각 항목은 성공 응답 필드와
`createdAt`을 포함한다. 대상 사용자 UUID가 잘못되면 400, 기록이 없으면 빈 배열이다.

## 저장·동시성·복구

- 한 트랜잭션에서 현금·선택 종목·감사 기록을 함께 저장하거나 전부 취소한다.
- 거래·정보 구매와 같은 사용자 잠금을 사용하고, 게임 초기화와도 잠금을 공유한다.
- DB와 실행 중 게임 상태가 모두 대기/일시정지인지 검사하며, 잠금 대기 중 재개되면 취소한다.
- 총자산이 JavaScript 안전 정수 범위를 초과하면 취소한다.
- 커밋 후 순위를 갱신하고 기존 `ranking:update`로 접속 화면 갱신을 유도한다.
- 브라우저는 전송 전에 요청을 탭별 `sessionStorage`에 보관한다(관리자 암호 제외).
  응답 유실/5xx/잘못된 성공 응답은 자동 재전송하지 않고 '같은 요청으로 결과 확인'을 제공한다.
  확인 중에는 새 수정을 막는다. 새로고침·관리자 재인증 후 같은 참가자 상세를 열면 복구한다.
- 기록은 `asset_adjustments`에 저장한다. 실제 주문/매도 수익 기록을 만들거나 고치지 않는다.
  따라서 과거 매매 손익은 거래 기준이며 관리자 증감까지 반영한 총수익 지표가 아니다.
- 기존 공용 관리자 비밀번호를 사용하므로 개인별 관리자 신원은 기록하지 않는다.
- 게임 초기화로 참가자가 삭제되면 해당 게임의 자산 정정 기록도 함께 삭제된다.
  기록 보존이 필요한 운영자는 초기화 전에 별도 보관해야 한다.

## 배포

기존 방식대로 `npm --prefix server run db:migrate`로 `asset_adjustments` 테이블을 추가한다.
기존 지갑/주식/거래 데이터의 값은 마이그레이션으로 변경하지 않는다.
전체 회귀 QA는 사용자 결정에 따라 15단계에서 22단계로 이관한다.

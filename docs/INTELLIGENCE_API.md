# 추가 시장정보 API — 현금 결제 전환 B-19~21

정보 상점의 결제 수단을 미션 포인트에서 투자 현금으로 전환한 Backend·Frontend 계약입니다.

## 데이터와 게임 규칙

- 게임의 `wallets.cash`를 사용합니다. 구매 가격만큼 현금과 총자산이 감소합니다.
- 제목 1~100 UTF-16 코드 유닛, 요약 1~500, 본문 1~5,000. trim/NFC 정규화 후 검사하며 본문만 LF 줄바꿈을 허용합니다. 기타 제어·포맷 문자는 거부합니다.
- `price`: 1~1,000,000 정수. `availableRound`: 1~1,000 및 게임 총 월 이내 정수. `isActive`: 필수 boolean.
- 관리자 생성·수정·비활성화는 WAITING에서만 가능합니다. 게임 DB 상태와 서버 엔진 상태를 모두 검사합니다.
- 신규 구매는 RUNNING 상태에서만 가능합니다. TRADING/RESULT 단계 모두 허용하며 PAUSED/FINISHED/WAITING은 거부합니다. 주식 거래 마감 여부와 정보 구매 가능 여부는 별개입니다.
- 활성 단서 중 현재 월 이하의 단서만 상점에 보입니다. 미래 단서는 제목·요약도 노출하지 않습니다.
- 비활성화는 신규 판매 중단입니다. 구매 시 제목·요약·본문·가격을 복사해 보관하므로 원본 변경·비활성화 후에도 기존 구매 내용이 유지됩니다.

## 사용자 API

기존 `investking_session` 쿠키 인증을 사용합니다. 사용자 ID는 쿠키로만 결정하며 요청의 `userId`는 사용하지 않습니다. 모든 응답은 `Cache-Control: no-store`. 허용 Origin과 credentials 정책은 기존 사용자 API와 같습니다.

### GET `/api/intelligence/me`

본인 현금, 공개 상점 목록, 본인의 구매 보관함을 함께 반환합니다. 구매자 본문을 조회하는 타인 ID 기반 API는 없습니다.

```json
{
  "cash":999990,
  "items":[{"clueId":"uuid","title":"수요 단서","summary":"공개 요약","price":10,"availableRound":1,"canPurchase":false}],
  "purchases":[{"clueId":"uuid","title":"수요 단서","summary":"공개 요약","price":10,"availableRound":1,"content":"구매자 전용 본문","paidCash":10,"purchasedAt":"2026-09-19T00:00:00.000Z"}]
}
```

`items`에는 본문이 없으며 SQL에서도 본문을 선택하지 않습니다. `canPurchase`는 게임 상태와 구매 여부를 나타냅니다. 잔액 부족 여부는 `cash`와 `price`로 표시할 수 있으며 서버가 구매 시 다시 검증합니다. 본문은 `purchases`에만 포함됩니다. 판매 중단된 구매도 보관함에 남습니다.

### POST `/api/intelligence/purchases`

```json
{"clueId":"uuid","expectedPrice":10}
```

성공 200 응답은 GET `/me`와 같은 형식입니다. 클라이언트가 본 가격을 `expectedPrice`로 보내며 변경됐으면 409 `PRICE_CHANGED`를 반환합니다. 사용자·게임·단서 조합으로 이미 구매했다면 상태·판매 여부·가격 변경과 관계없이 **추가 차감 없이** 기존 보관함을 반환합니다. 요청 자체의 UUID/양의 정수 검증은 재시도에도 적용합니다.

응답 유실 후에는 GET `/me`로 결과를 복구합니다. POST 재시도도 서버에서 중복 차감하지 않지만 UI는 자동 재전송할 필요가 없습니다.

## 관리자 API

`Authorization: Bearer <ADMIN_PASSWORD>` 필요.

| 요청 | 응답 |
|---|---|
| GET `/api/intelligence/admin` | 200 `{clues: [...]}` |
| POST `/api/intelligence/admin` | 201 `{clue: {...}}` |
| PUT `/api/intelligence/admin/:clueId` | 200 `{clue: {...}}` |
| DELETE `/api/intelligence/admin/:clueId` | 204, 본문 없음 |

생성·수정 요청:

```json
{"title":"수요 단서","summary":"공개 요약","content":"구매자 전용 본문","price":10,"availableRound":1,"isActive":true}
```

관리자 단서 응답은 요청 필드에 `clueId`를 추가한 형식입니다. DELETE로 비활성화한 단서는 PUT의 `isActive: true`로 재활성화합니다.

## 오류

| HTTP | 코드 | 의미 |
|---|---|---|
| 400 | INVALID_CLUE / INVALID_CLUE_ID / INVALID_PRICE | 필드·ID·가격 형식 오류 |
| 401 | AUTH_REQUIRED / ADMIN_AUTH_REQUIRED | 사용자 세션 / 관리자 인증 필요 |
| 403 | ORIGIN_NOT_ALLOWED | 허용되지 않은 브라우저 Origin |
| 404 | CLUE_NOT_FOUND | 관리 대상 단서 없음 |
| 409 | CLUE_MANAGEMENT_CLOSED | 대기 상태 외 관리 변경 |
| 409 | PURCHASE_CLOSED | 신규 구매 가능한 게임 상태 아님 |
| 409 | CLUE_UNAVAILABLE | 없거나 비활성·공개 월 미도달 단서 |
| 409 | PRICE_CHANGED | 표시 가격과 서버 가격 불일치 |
| 409 | INSUFFICIENT_CASH | 현금 잔액 부족 |
| 503 | DATABASE_UNAVAILABLE / GAME_UNAVAILABLE / POINTS_OUT_OF_RANGE | DB·게임·안전한 숫자 표현 오류 |

기존 관리자 middleware의 `ADMIN_AUTH_UNAVAILABLE` 등 인증 오류 정책도 적용됩니다.

## DB·동시성·복구

- `intelligence_purchases.paid_cash`를 추가합니다. 기존 `paid_points` 구매는 가격을 현금 지불 기록으로 이관하며 원본 열은 호환성을 위해 nullable로 보존합니다. `npm --prefix server run db:migrate`를 실행해야 합니다.
- 구매 기본키 `(game_id,user_id,clue_id)`, 사용자 주문 advisory lock, 현금 지갑 행 잠금으로 같은 단서 중복 차감과 주식 주문·다른 정보 구매의 동시 초과 지출을 방지합니다.
- 차감·구매 기록은 하나의 Transaction으로 처리합니다. 중간 SQL 실패 또는 처리 중 게임 일시정지/종료 확인 시 rollback합니다.
- 게임 행 잠금으로 DB 상태 변경과 순서를 맞추고, 기존 초기화 advisory lock의 공유 잠금을 사용해 구매·편집이 초기화를 가로지르지 않도록 합니다.
- GET은 repeatable-read 스냅샷으로 잔액·구매 내역을 함께 읽습니다.
- 초기화의 참가자 삭제에 따라 FK CASCADE로 구매·현금 지갑이 함께 삭제됩니다. 단서 원본은 남습니다. 구매 본문은 DB에 저장하므로 새 세션에서도 복원됩니다.
- 신규 Socket 이벤트는 없습니다. 기존 게임 상태 갱신·재접속·5초 조회와 구매 응답으로 복구할 수 있습니다. 구매 본문은 공개 Socket으로 보내지 않습니다.

## 검증

정보상점 PostgreSQL 통합 테스트 `node --test test/intelligence.test.js`: **9/9 통과, skip 0**.

- 스키마 2회 실행, 관리자 CRUD·대기 제한, 5,000자 한글 본문, 인증·Origin·CORS·no-store.
- 공개 전·비활성 단서 필터, 미구매 본문 비노출, 타인 ID 조작에도 본인 계정만 사용.
- 동일 단서 8개 동시 요청의 1회 차감, 다른 단서 동시 구매의 초과 지출 차단.
- 가격 변경·상태·잔액 검증, 이미 구매한 요청의 종료 후 재시도.
- 새 세션으로 구매 복구, 판매 중단·원본 수정 후 본문/지불 가격 보존.
- 강제 INSERT 실패 시 현금 차감 rollback.
- 구매 중 pause·편집 중 start의 rollback, 게임 초기화 후 구매/현금 지갑 삭제와 단서 유지.

실제 UI·다른 기기·행사 네트워크 통합 검증을 완료했다는 의미는 아닙니다. 후속 현금 정보상점 Frontend 작업에서 이 계약으로 실제 서버 연동을 검증해야 합니다.

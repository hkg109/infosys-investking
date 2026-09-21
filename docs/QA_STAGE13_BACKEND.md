# QA 13단계 Backend — 수정·상세 액션 오류 계약 유지

## 범위 및 결과

최신 main `1f5a9a9`(12단계 Backend PR #37 병합)에서 검증했다.
계획상 추가 Backend 기능은 없으며 기존 오류 응답을 유지한다. 변경 파일은 테스트와
인계 문서뿐이다. 서버 구현·DB·Socket·성공/오류 응답 형식은 변경하지 않았다.

- 실제 server.js + 격리 PostgreSQL + HTTP 전체 회귀: **48개 통과**, 실패/건너뜀 0.
- Frontend 기존 테스트: **74개 통과**, 실패/건너뜀 0.
- 신규 stage 13 하위 테스트 3개: 관리자 수정 오류, RUNNING 수정 제한, 주문 거절 시 데이터 보존.
- `git diff --check` 통과.

## 수정 오버레이에서 사용하는 기존 오류

아래는 이번 실제 HTTP 검증에서 **상태 코드와 JSON 전체를 함께 비교한 계약**이다.
`{error: 코드}` 표기는 JSON 문자열 코드로 응답한다는 의미다.

| 요청 상황 | HTTP | JSON 응답 |
|---|---:|---|
| 참가자 쿠키만으로 관리자 종목·사건·미션 PUT | 401 | `{error: "ADMIN_AUTH_REQUIRED"}` |
| 종목 PUT의 잘못된 본문 | 400 | `{error: "INVALID_COMPANY"}` |
| 사건 PUT의 잘못된 본문 | 400 | `{error: "INVALID_EVENT"}` |
| 미션 PUT의 잘못된 본문 | 400 | `{error: "INVALID_MISSION"}` |
| 존재하지 않는 종목 DELETE | 404 | `{error: "COMPANY_NOT_FOUND"}` |
| 존재하지 않는 사건 DELETE | 404 | `{error: "EVENT_NOT_FOUND"}` |
| 존재하지 않는 미션 DELETE | 404 | `{error: "MISSION_NOT_FOUND"}` |
| RUNNING 중 종목 PUT | 409 | `{error: "COMPANY_MANAGEMENT_CLOSED", status: "RUNNING"}` |
| RUNNING 중 사건 PUT | 409 | `{error: "EVENT_MANAGEMENT_CLOSED", status: "RUNNING"}` |
| RUNNING 중 미션 PUT | 409 | `{error: "MISSION_MANAGEMENT_CLOSED", status: "RUNNING"}` |

종목 PUT 대상은 기존 A 종목이다. 실패 전후 전체 종목 조회 응답이 동일함을 확인했다.
사건·미션의 거절된 요청 뒤에도 빈 목록이 유지됨을 확인했다.
RUNNING 제한은 본문 검증보다 먼저 적용되므로 잘못된 본문이라도 위 409가 반환된다.
이 표는 검증한 대표 사례이며 모든 CRUD/오류 코드를 나열한 것은 아니다.

## 주문 오버레이의 오류와 보존

`POST /api/trading/orders`의 실제 HTTP 오류를 검증했다.

| 상황 | HTTP | JSON 응답 |
|---|---:|---|
| 이미 체결된 orderId를 다른 수량으로 재사용 | 409 | `{error: "ORDER_ID_CONFLICT"}` |
| 잘못된 주문 ID 형식 | 400 | `{error: "INVALID_INPUT"}` |
| 현금 390,000원 계정에서 초과 매수 | 409 | `{error: "INSUFFICIENT_CASH", availableCash: 390000}` |
| 보유 수량보다 많이 매도 | 409 | `{error: "INSUFFICIENT_SHARES"}` |

위 요청 전후 계좌 응답 전체와 DB 거래 건수가 동일한지 검사한다. 기존 회귀 테스트는
동일 주문 재시도(200 duplicate:true), 장중 정지(409 MARKET_HALTED), 세션 만료,
중복·동시 주문과 재시작 복구도 확인한다. availableCash는 고정 상수가 아니라 해당 계좌 잔액이다.

## Frontend F-28~30 인계

1. 400은 입력값을 보존하고 해당 입력 수정을 안내한다. 실패 응답을 저장 성공으로 처리하지 않는다.
2. 401은 재인증을 안내한다. 404는 목록을 새로 조회하고 대상이 사라졌음을 알린다.
3. MANAGEMENT_CLOSED는 최신 게임 상태를 조회하고 편집 가능 여부를 갱신한다.
   잔액·보유량 부족은 계좌를 갱신하고 수량을 다시 확인한다.
4. 기존 API 모듈의 오류 코드와 `uncertain` 처리를 유지한다. 네트워크 단절·시간 초과·5xx는
   저장 실패 확정이 아니다. 관리자 저장은 먼저 목록/상세를 다시 조회하고 자동 재전송하지 않는다.
5. 주문의 응답 유실은 기존 orderId와 내용으로 확인/복구한다. 이전 시도의 성공 여부를 모르는
   상태에서 401/403/408/429를 받아도 미확인 주문을 지우지 않는다. 새 ID로 재주문하면 별도 체결될 수 있다.
6. **오버레이 닫기/ESC/AbortController는 서버 주문 취소가 아니다.** 미확인 주문 취소는 기존
   `/api/trading/orders/cancel`의 응답으로 판정한다. cancelled:true일 때 취소 확정이고,
   cancelled:false와 transaction이 오면 이미 체결된 결과를 표시한다.
7. 저장 중 이중 클릭 차단, 닫기·취소·ESC·포커스 복원·미저장 경고는 Frontend에서 구현하고 검증한다.
   이번 PR은 Modal/Drawer UI를 구현하거나 브라우저 조작을 검증하지 않는다.

## 재현

운영 DB가 아닌 테스트 전용 PostgreSQL을 사용한다.

```sh
TEST_DATABASE_URL='postgresql://investking_test:qa-only@127.0.0.1:5432/investking_test' npm --prefix server run test:integration
npm --prefix client test
```

실제 오류 테스트: `server/test/qa-integration.test.js`의 stage 13 하위 테스트.
프론트엔드의 결과 불명·취소 응답 처리는 기존 `client/test/trading.test.mjs`,
`client/test/companies.test.mjs` 등을 포함한 전체 테스트로 확인했다.

관련 계약: [TRADING_API.md](TRADING_API.md), [QA_FRONTEND_REWORK_PLAN.md](QA_FRONTEND_REWORK_PLAN.md).
실물 iPhone/Samsung 검증은 사용자 결정대로 제외한다. Backend 14단계는 변경 없으며,
15단계에서는 기존 B-18을 다시 실행하고 발견 결함만 별도 수정한다.

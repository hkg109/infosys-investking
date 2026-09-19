# 추가 시장정보 API 초안 — D-03 / F-20~21

**상태: 최초 제안 기록. Backend PR #31이 병합됐으며 현재 구현 계약은 [INTELLIGENCE_API.md](INTELLIGENCE_API.md)를 따릅니다.**

2026-09-18 작성 당시 B-15~16 선행 구현이 없어 프론트엔드 준비를 위해 작성한 초안입니다. 이후 Backend PR #31이 구현·병합됐습니다. 아래 제안은 이력으로 남기며, 실제 규칙·오류·응답은 구현 계약을 기준으로 연동 검증합니다.

## 활성화와 화면 검토

- 실제 Backend API 어댑터 검증 후 기본 활성화했습니다. `VITE_ENABLE_INTELLIGENCE=false`로 비활성화할 수 있습니다.
- 개발 UI 검토: `npm --prefix client run dev` 후 `/test/intelligence.html`. 모의 API와 가짜 계정만 사용합니다. 테스트 페이지는 production build 산출물에 포함하지 않습니다.
- 실행: `npm --prefix client run dev` 또는 production build. `VITE_API_BASE_URL`은 기존 설정을 따릅니다. Vite 플래그는 빌드 시 결정됩니다.

## 제안 데이터 모델

공통 단서 메타데이터:

```json
{"clueId":"uuid","title":"반도체 수요 단서","summary":"다음 달 산업 흐름에 관한 정보","price":10,"availableRound":1}
```

- 제목 1~100자, 요약 1~500자, 본문 `content` 1~5,000자. NFC/trim 후 검증하며 본문만 줄바꿈 허용.
- 가격 `price`: 정수 1~1,000,000 정보 포인트. 투자 현금과 별개.
- 공개 시작 월 `availableRound`: 정수 1~1,000, 실제 게임 총 월 이내.
- 관리자 데이터는 공통 필드에 `content`, `isActive: boolean`을 추가합니다.
- 공개 목록은 공통 필드에 `canPurchase: boolean`만 추가합니다. **구매 전 본문을 응답에 넣지 않아야 합니다.** 클라이언트 필드 제거는 서버 접근 제어를 대신하지 않습니다.

## 제안 엔드포인트

| 요청 | 인증 | 성공 응답 |
|---|---|---|
| GET `/api/intelligence/me` | 기존 사용자 세션 쿠키 | 200 `{points, items, purchases}` |
| POST `/api/intelligence/purchases` | 기존 사용자 세션 쿠키 | 200 `{points, items, purchases}` |
| GET `/api/intelligence/admin` | 관리자 Bearer | 200 `{clues}` |
| POST `/api/intelligence/admin` | 관리자 Bearer | 201 `{clue}` |
| PUT `/api/intelligence/admin/:clueId` | 관리자 Bearer | 200 `{clue}` |
| DELETE `/api/intelligence/admin/:clueId` | 관리자 Bearer | 204, 비활성화 |

구매 요청:

```json
{"clueId":"uuid","expectedPrice":10}
```

사용자 응답:

```json
{
  "points":30,
  "items":[{"clueId":"uuid","title":"반도체 수요 단서","summary":"다음 달 산업 흐름에 관한 정보","price":10,"availableRound":1,"canPurchase":false}],
  "purchases":[{"clueId":"uuid","title":"반도체 수요 단서","summary":"다음 달 산업 흐름에 관한 정보","price":10,"availableRound":1,"content":"구매자 전용 본문","paidPoints":10,"purchasedAt":"2026-09-18T00:00:00.000Z"}]
}
```

## 최초 제안의 백엔드 요구사항 (현재 구현·검증 결과는 INTELLIGENCE_API.md 참조)

1. 사용자 ID는 세션에서만 결정합니다. 타인의 구매 내역/본문 접근을 거부합니다. 응답은 `Cache-Control: no-store`, 쿠키 CORS·Origin 정책은 기존 사용자 API를 따릅니다.
2. 포인트 차감과 구매 기록을 같은 DB Transaction에서 처리합니다. 미션 보상과 같은 포인트 잔액을 사용합니다.
3. `(game_id, user_id, clue_id)` 구매 고유 제약과 잔액 행 잠금으로 같은 단서 중복 차감, 다른 단서 동시 구매의 음수 잔액을 방지합니다. 이미 구매한 요청은 추가 차감 없이 기존 결과를 반환합니다.
4. 신규 구매는 `RUNNING`, 활성 단서, 공개 월 도달, 충분한 포인트, `expectedPrice` 일치 조건을 서버에서 검증합니다. PAUSED/FINISHED/WAITING 신규 구매는 거절합니다. 마감 단계의 구매 가능 여부는 계약 확정 시 결정하며 UI는 `canPurchase`를 추가로 확인합니다.
5. 관리자 변경은 WAITING에서만 허용합니다. 비활성화는 판매만 중단하고 구매자의 보관함은 유지합니다. 구매 시 제목/본문/지불 가격을 스냅샷으로 보존하는 것을 제안합니다.
6. 재접속·계정 복구 시 GET `/me`가 기준입니다. 초기화 시 참가자의 구매·포인트를 함께 초기화하고 단서 원본은 유지합니다.

## 제안 오류

401 `AUTH_REQUIRED`, `ADMIN_AUTH_REQUIRED`; 400 `INVALID_CLUE`; 409 `INSUFFICIENT_POINTS`, `CLUE_UNAVAILABLE`, `PRICE_CHANGED`, `PURCHASE_CLOSED`, `CLUE_MANAGEMENT_CLOSED`. 기타 오류는 일반 재조회 안내로 처리합니다.

## 프론트엔드 복구 정책

- 가격·잔액·구매 여부는 서버 응답을 사용합니다. 로컬에서 잔액을 차감하거나 구매를 성공으로 간주하지 않습니다.
- 구매 전 제목·가격 확인, 중복 클릭 차단, 요청 결과 불명 시 POST 자동 재전송 금지. GET으로 보관함·잔액을 재조회합니다.
- 게임 상태 갱신·기존 5초 폴링·Socket 재접속에 따라 GET을 다시 호출합니다. 새 Socket 이벤트는 계약 확정 전 추가하지 않습니다.
- 사용자 변경·401에서 본문 캐시를 제거하고, 일시적 조회 실패는 오래된 정보임을 표시하며 구매를 잠급니다. 운영 UI는 비공개 본문을 Web Storage에 저장하지 않습니다.
- 관리자 변경 실패 시 입력 초안을 유지하고 최신 목록을 다시 확인해야 편집을 재개할 수 있습니다.

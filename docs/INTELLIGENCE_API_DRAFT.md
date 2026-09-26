# 추가 시장정보 API 초안 — 보관 문서

> 이 문서는 최초 제안의 이력만 보존합니다. 운영 코드와 연동할 때는 반드시 [INTELLIGENCE_API.md](INTELLIGENCE_API.md)를 사용하세요.

초기 초안은 별도 정보 포인트를 제안했지만, QA 단계 16에서 구매 수단을 참가자의 투자 현금으로 변경했습니다. 따라서 현재 계약에는 `points`, `paidPoints`, `INSUFFICIENT_POINTS`가 존재하지 않습니다.

현재 핵심 계약은 다음과 같습니다.

- `GET /api/intelligence/me`: `{ cash, purchaseOpen, currentRound, items, purchases }`
- `POST /api/intelligence/purchases`: 요청 `{ clueId, expectedPrice }`, 성공 시 동일한 상점 상태 반환
- 구매 금액은 `wallets.cash`에서 트랜잭션으로 차감
- 구매 기록은 `paidCash`로 반환
- 잔액 부족 오류는 `INSUFFICIENT_CASH`
- 재접속과 결과 불명 복구는 `GET /api/intelligence/me` 응답을 기준으로 처리

레거시 DB 열인 `user_reward_wallets.points`와 `intelligence_purchases.paid_points`는 기존 설치의 비파괴 마이그레이션을 위해 남아 있을 수 있지만, 신규 정보 구매·응답에서는 사용하지 않습니다.

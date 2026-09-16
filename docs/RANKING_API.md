# 순위 Backend 규약

6단계 Backend는 참가자의 총자산을 `현금 + 보유 수량 × 현재 주가`로 계산합니다. 동점자는 같은 순위를 가지며 다음 순위는 건너뛰는 경쟁 순위 방식입니다. 예를 들어 공동 1위가 두 명이면 다음 참가자는 3위입니다.

관리자 계정(`role=ADMIN`)은 순위에서 제외합니다. 거래나 포트폴리오 조회 이력이 없는 일반 참가자도 `INITIAL_CASH`로 지갑을 생성하여 순위에 포함합니다.

## 사용자 조회

```http
GET /api/rankings
Cookie: investking_session=...
```

응답에는 `top3`, 전체 `rankings`, 로그인한 참가자의 `me`, 참가자 수와 계산 시각이 포함됩니다. 공개 순위 항목은 `nickname`, `rank`, `totalAssets`만 제공하고, `me`에는 본인의 `cash`, `stockValue`도 포함합니다. 내부 `userId`는 공개하지 않습니다.

## 관리자 조회

```http
GET /api/rankings/admin
Authorization: Bearer <ADMIN_PASSWORD>
```

관리자 조회는 전체 참가자의 `cash`, `stockValue`, `totalAssets`를 포함합니다. 관리자 인증이 없거나 틀리면 `401 ADMIN_AUTH_REQUIRED`입니다.

## Socket 이벤트

```text
ranking:update
```

다음 시점에 전체 클라이언트로 전달합니다.

- 참가자 최초 생성
- 매수·매도 거래 커밋 완료
- 게임 시작
- 거래 마감 후 해당 라운드 사건과 주가 변경 완료
- 게임 종료 및 최종 순위 확정

Payload는 조회 API의 공개 순위 구조와 같으며 `final`로 최종 결과 여부를 구분합니다. 재연결 또는 새로고침 시 `GET /api/rankings`로 복구합니다.

## 최종 순위

`game:end` 처리 시 게임 단위 확정 상태를 `ranking_states`에, 참가자별 결과를 `ranking_snapshots`에 저장합니다. 참가자가 0명인 종료 결과도 확정 상태로 남습니다. 이후 주가나 지갑 데이터가 변경되더라도 최종 스냅샷은 다시 계산하거나 덮어쓰지 않으며, 서버 재시작 시에도 동일한 결과를 사용합니다.

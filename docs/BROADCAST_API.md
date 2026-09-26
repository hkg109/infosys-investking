# QA 10단계 Backend — B-17 익명 중계 Feed

## 연결

`GET /api/broadcast` — 로그인·쿠키·관리자 토큰 없이 읽는 공개 API.
`Cache-Control: no-store`; Origin이 있으면 CLIENT_URL만 허용한다.
프론트엔드는 요청이 끝난 뒤 `pollAfterMs`(현재 1000ms)를 기다려 재요청한다.
소켓 구독 없이 새로고침·재접속할 때 전체 상태를 복구한다. 요청 중복을 피하고
실패 시 2→4→8초 간격으로 재시도하며 이전 화면에 연결 끊김을 표시한다.

## 응답 계약 (version: 1)

| 필드 | 내용 |
|---|---|
| serverTime | 응답 시각 ISO 문자열. 클라이언트 시계 보정 기준 |
| pollAfterMs | 다음 요청까지 권장 대기 밀리초 |
| game | status, phase, phaseBeforePause, currentRound, totalRounds, remainingSeconds, phaseEndsAt, startedAt, finishedAt, tradingHalted, tradingEnabled |
| market[] | companyId, name, currentPrice, openingPrice, changeRate |
| ranking | final, calculatedAt, totalParticipants, top3[], rankings[] |
| ranking 항목 | 진행 중에는 rank, totalAssets만 포함. 최종 확정 시 nickname 추가. 공동 순위는 모두 포함하므로 top3가 3명보다 많을 수 있음 |
| news[] | gameEventId, title, news, triggerPhase |
| warnings[] | gameEventId, scheduledAt만 포함. 예정 사건의 제목·내용은 미공개 |
| results[] | gameEventId, title, result, triggerPhase, appliedAt, changes[] |
| changes 항목 | companyId, previousPrice, newPrice, changeRate |

가격·자산·순위·초·변동률은 JSON 숫자다. changeRate는 비율이 아닌 퍼센트
(10이면 +10%)이며 market은 현재 월 시가 대비, changes는 해당 사건 직전 대비다.
시가 기록이 없으면 종목 초기 가격을 기준으로 사용한다. 비활성 종목은 제외한다.

WAITING/FINISHED의 remainingSeconds는 null. PAUSED는 고정된 남은 초를 반환한다.
RUNNING은 서버 마감 시각 기준 올림한 초이며 0 아래로 내려가지 않는다.
`tradingHalted`는 장중 사건으로 일시 거래 중단 중임을 나타낸다.
장면 선택 예: WAITING → 대기, PAUSED → 일시정지, TRADING → 시장,
RESULT → 월 결과, FINISHED && ranking.final → 최종 순위.
FINISHED라도 ranking.final=false이면 최종 집계 완료를 기다려야 한다.

## 공개 범위 및 갱신

- 현재 월 마감 사건의 뉴스는 공개하되 결과·가격 효과는 적용된 뒤만 공개한다.
- 장중 사건은 예고 이후 warnings에 식별자·시각만, 적용 이후 news/results에 내용을 제공한다.
- 미래 월, 아직 예고되지 않은 장중 사건, 진행 중 닉네임, 사용자 ID, PIN, 현금/보유 종목,
  미션, 포인트, 구매 단서 및 구매 기록은 응답에 포함하지 않는다.
- `game.status=FINISHED`와 `ranking.final=true`를 모두 만족한 최종 순위에만 닉네임을 포함한다.
  게임 초기화 뒤에는 순위와 닉네임이 모두 제거되어 다시 익명 중계로 돌아간다.
- results는 현재 월 전체 결과다. 프론트는 gameEventId로 이미 연출한 결과를 중복 재생하지 않는다.
  첫 접속은 현재 상태를 표시하고, 이후 새 ID를 속보 연출에 사용한다.
- 게임 초기화하면 뉴스·결과·순위가 비고 가격이 초기화된다. WAITING 전환 시 UI 연출 기록도 비운다.
- DB는 읽기 전용 REPEATABLE READ 트랜잭션으로 조회하므로 한 응답에서 초기화 전후 데이터가 섞이지 않는다.
  게임 전환 처리 큐를 기다린 후 읽는다. 순위는 기존 거래·사건 처리기가 갱신하는 스냅샷이며
  calculatedAt로 집계 시각을 표시한다. 가격 반영과 순위 재계산 사이에는 짧은 시차가 있을 수 있다.
- 조회는 주문·순위 재계산·게임 상태 변경을 발생시키지 않는다. DB migration은 추가하지 않았다.
- DB 미설정 503 DATABASE_UNAVAILABLE, DB 오류 503 SERVICE_UNAVAILABLE,
  허용하지 않은 Origin 403 ORIGIN_NOT_ALLOWED. 오류 응답에 내부 DB 내용을 노출하지 않는다.

## 검증 및 다음 범위

실제 격리 PostgreSQL + HTTP 통합 테스트로 익명 접근, CORS, 캐시 방지, 쓰기 차단,
비공개 데이터 필터링, 사건 예고/적용, 가격 변화, 타이머, 거래 중단,
공동 최종 순위와 게임 초기화를 검증한다.
F-22~23 `/broadcast` 16:9 화면·애니메이션은 다음 Frontend 작업이다.
실물 iPhone/Samsung 검증은 사용자 결정에 따라 제외한다.

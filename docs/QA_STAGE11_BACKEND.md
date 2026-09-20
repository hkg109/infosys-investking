# QA 11단계 Backend — B-18 / D-04

## 범위

10단계 Backend PR #33이 병합된 main에서 진행했다. 이번 PR은 Backend 통합 QA와
운영 인계다. F-22~23 중계 화면 및 F-24 브라우저 전체 흐름 완료를 의미하지 않는다.
사용자 결정에 따라 실물 iPhone/Samsung 테스트는 제외한다.

## 검증 명령

Node 22.12 이상과 PostgreSQL 17을 준비하고, **운영 DB가 아닌 테스트 전용 DB**의
연결 문자열을 TEST_DATABASE_URL에 지정한다. 테스트는 고유 스키마를 만들고 종료 시 삭제한다.

```sh
npm --prefix server ci
TEST_DATABASE_URL='postgresql://investking_test:qa-only@127.0.0.1:5432/investking_test' npm --prefix server run test:integration
```

test:integration은 TEST_DATABASE_URL이 없으면 실패한다. 일반 npm test는 DB가 없으면
DB 테스트를 건너뛰므로 행사 검증에는 test:integration을 사용한다.
GitHub Actions `Backend integration QA`는 별도 PostgreSQL 17 서비스에서 동일 명령을 실행한다.
CI DB 암호는 이 일회용 서비스에만 쓰는 테스트 값이며 운영 자격 증명이 아니다.

## 실제 서버 통합 시나리오

`server/test/qa-integration.test.js`는 모의 Router가 아닌 실제 server.js 자식 프로세스,
HTTP, Socket.IO, PostgreSQL을 사용한다. 각 재시작은 SIGKILL 후 새 프로세스를 실행한다.

1. 참가자 12명이 동시에 참가하고 순위 집계 12명을 확인한다.
2. 12명이 동일 주문을 각각 두 번 동시에 전송한다. 24개 요청 중 신규 체결 12건,
   중복 응답 12건이고 DB 체결은 한 번씩만 저장된다.
3. 같은 계정에 잔액을 초과하는 3개 주문을 경쟁시켜 1건만 체결되는지 확인한다.
4. 일시정지 후 재시작하여 남은 시간·세션·현금·보유량과 Socket 초기 상태를 확인한다.
5. 서버가 꺼진 동안 사건 시간이 지난 상황을 저장 시각 조정으로 재현한다.
   +10%, -10% 장중 사건이 순서대로 반영되어 10,000 → 11,000 → 9,900원이 된다.
6. 재시작 후 동일 주문을 재전송해 최초 거래 가격 10,000원과 중복 응답을 확인한다.
   다시 재시작해도 장중 가격 변경 기록은 2건이다.
7. 월 마감 시각을 지난 상태에서 재시작한다. +5% 마감 사건으로 10,395원이 되고
   최종 순위가 확정된다. 다시 켜도 결과·가격 변경 기록 3건·거래 13건을 유지한다.
8. 초기화하면 WAITING과 빈 순위로 돌아가고 기존 세션은 무효화된다.
9. 새 게임에서 실제 타이머로 장중 사건을 발생시킨다. trading:halt 시 주문은
   409 MARKET_HALTED, market:event:breaking에 변경 가격, trading:resume 이후 주문 성공을 검증한다.
10. 전체 과정에서 저장·거래 후처리 실패 로그가 없는지 검사한다.

이 검증은 12명 동시 요청에 대한 정확성 검사이며 행사 최대 인원·처리량 보장은 아니다.
프로세스 종료 전 이미 DB에 확정된 데이터의 복구를 검증한다. OS·디스크 손상이나
네트워크 분할, 다중 서버 운영에 대한 장애 시험은 포함하지 않는다.

## 발견 및 수정한 결함

기존 참가/거래 API가 COMMIT 뒤에도 DB 연결을 보유한 채 미션·순위 후처리를 기다렸다.
후처리도 같은 풀에서 새 연결을 요구하므로 동시 요청이 많으면 연결 대기가 누적되어
일부 요청이 실패했다. 최초 실제 서버 테스트에서 신규 주문 12건 중 11건만 성공했다.

COMMIT 직후 연결을 반환한 다음 후처리를 실행하도록 users.js와 trading.js를 수정했다.
거래 정지 장치는 후처리가 끝날 때까지 기존대로 유지한다. API 성공/오류/Socket 계약은
변경하지 않았고 새 DB migration도 없다. 수정 후 전체 회귀 및 실제 서버 시나리오를 실행했다.

## 운영 및 복구

- 행사 전: 최신 main 반영 → npm ci → 기존 환경 변수 확인 → DB 백업 →
  `npm --prefix server run db:migrate` → 서버 실행. 관리자 비밀번호와 DB URL은 Git에 올리지 않는다.
- 서버 기동: `npm --prefix server start`. `/api/health` 200은 프로세스 생존 확인이며
  DB 정상 여부까지 보장하지 않는다. `/api/broadcast` 200과 관리자 순위·참가자 조회도 확인한다.
- 행사 전용 연습 DB에서 참가 → 거래 → 장중 사건 → 일시정지/재개 → 종료 → 최종 순위
  → 재시작 복구를 점검한다. 실 행사 데이터를 초기화하며 연습하지 않는다.
- 장애 시: 같은 DB와 환경 설정으로 단일 서버 프로세스를 재시작한다. 앱 시작 시 기존
  게임 상태와 사건을 복구한다. RUNNING의 벽시계 시간은 서버가 꺼져도 계속 흐른다.
  의도적으로 시간을 멈추려면 관리자 일시정지가 저장된 것을 확인한 뒤 종료한다.
- 응답을 받지 못한 주문은 **같은 orderId와 같은 주문 내용**으로 확인/재전송한다.
  새 ID로 다시 주문하면 별도 주문으로 체결될 수 있다.
- DB 오류/503이면 DB 연결·migration·서버 로그를 점검한다. /health만 보고 게임을 재개하지 않는다.
- DB 백업은 PostgreSQL pg_dump로 행사 전/종료 후 수행하고, 복원은 먼저 별도 DB에서
  pg_restore로 확인한다. 사용자·PIN 해시·세션이 포함되므로 백업 파일 접근을 제한한다.
  운영 DB 덮어쓰기와 게임 초기화는 서로 다른 작업이며 자동 복구 수단으로 실행하지 않는다.
- 초기화 API는 종료 게임에서만 사용하며 참가자·거래·개인 진행 데이터를 삭제한다.
  관리자 화면에서 대상 게임과 결과 보존을 확인한 뒤 다음 행사를 준비한다.

## API / Socket 인계

기존 계약 유지: [TRADING_API.md](TRADING_API.md), [SOCKET_PROTOCOL.md](SOCKET_PROTOCOL.md),
[BROADCAST_API.md](BROADCAST_API.md). 공개 중계는 1초 폴링 계약을 사용한다.
주문 예시는 아래와 같으며 cookie는 참가/복구 API로 발급받는다.

```http
POST /api/trading/orders
Content-Type: application/json
Cookie: <참가 API가 발급한 세션 쿠키>

{"orderId":"11111111-1111-4111-8111-111111111111","companyId":"A","type":"BUY","quantity":1}
```

신규 체결은 201와 duplicate:false, 동일 주문 재전송은 200과 duplicate:true다.
잔액 부족은 409 INSUFFICIENT_CASH, 장중 정지는 409 MARKET_HALTED,
초기화 후 만료 세션은 401이다. 자세한 오류는 기존 거래 계약을 따른다.

Frontend 후속 QA는 중계 화면 병합 후 관리자·복수 참가자·중계 화면을 함께 실행하여
상태 전환과 재연결을 확인한다. 이번 PR에서 화면 검증 완료로 표시하지 않는다.

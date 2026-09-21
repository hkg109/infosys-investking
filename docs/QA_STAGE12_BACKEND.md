# QA 12단계 Backend — 기존 API 연결 확인

## 범위와 결과

2026-09-21, 최신 main `6a4679d`(11단계 Backend #34, 중계 Frontend #35,
후속 개선 계획 #36 병합)를 기준으로 검증했다.
사용자 제공 12~15단계 표를 인계서에 반영했다. 12단계 Backend는 신규 기능 없이
기존 API 연결 확인만 수행한다. 이 PR의 변경은 테스트·문서이며 서버 구현, DB 스키마,
인증 정책, API 주소·오류 응답은 유지한다.

- 실제 server.js 프로세스 + 격리 PostgreSQL + HTTP: 전체 **45개 통과**, 실패 0, 건너뜀 0.
- 현재 Frontend 테스트: **74개 통과**, 실패 0, 건너뜀 0.
- 19개 조회 API를 WAITING과 PAUSED 상태의 프로세스 재시작 후 각각 호출했다.
- 관리자 전용 조회 7개는 관리자 인증 시 200, 참가자 쿠키만으로는 401이다.
- 참가자 전용 조회 8개는 세션 쿠키로 200, 미인증은 401이다.
- 공개 조회 4개는 인증 없이 200이다.
- 회사·참가자·미션·단서·순위·거래 이력·주가 이력·중계 응답은 실제 Frontend의
  validate 함수를 사용했다. 나머지는 화면이 읽는 핵심 응답 필드를 검사했다.
- B-18의 동시 주문·중복 방지·장중 사건·재시작 복구 회귀도 함께 실행했다.

## 화면별 API 연결표

아래 화면 URL은 12단계 Frontend의 **예정 경로**이며 이번 PR에서 새로 만들지 않는다.
API는 현재 존재하는 주소다. 모든 API 경로에는 `/api` 접두사가 붙는다.

| 예정 화면 | 기존 API (GET, 별도 표기 제외) | 인증 |
|---|---|---|
| `/admin/overview` | `/game`; POST `/game/admin/start`, `/pause`, `/resume`, `/end`, `/reset` (모두 `/game/admin` 아래) | 조회 공개, 제어 관리자 |
| `/admin/participants` | `/admin/participants` | 관리자 |
| `/admin/companies` | `/companies/admin` | 관리자 |
| `/admin/events` | `/events/admin`, `/events/admin/schedule` | 관리자 |
| `/admin/missions` | `/missions/admin` | 관리자 |
| `/admin/intelligence` | `/intelligence/admin` | 관리자 |
| `/admin/results` | `/rankings/admin`, `/events/current` | 순위 관리자, 현재 뉴스 공개 |
| `/game/market` | `/game`, `/trading/market`, `/events/current` | 공개 조회 |
| `/game/orders` | `/trading/portfolio`, `/trading/orders/recovery`; POST `/trading/orders` | 참가자 |
| `/game/history` | `/trading/history`, `/trading/companies/:companyId/history` | 참가자 |
| `/game/ranking` | `/rankings` | 참가자 |
| `/game/missions` | `/missions/me`, `/intelligence/me` | 참가자 |
| `/game/profile` | `/users/me`; POST `/users/logout`, `/users/recover` | 본인 세션; 복구는 닉네임·PIN |
| `/broadcast` (기존 화면) | `/broadcast` | 공개 조회 |

이번에 추가한 검증은 GET 연결과 응답 계약이다. 관리 제어·주문·복구·로그아웃 등 변경
요청의 동작은 기존 전체 회귀 테스트 범위이며, 위 표가 모든 CRUD를 나열한 것은 아니다.

## Frontend 연결 시 유지할 사항

- 관리자 요청은 기존 `Authorization: Bearer <관리자 비밀번호>`와 API 모듈을 사용한다.
  참가자 개인 API는 `credentials: 'include'`를 유지한다. 사용자 ID를 URL/본문에 넣어
  다른 사람의 개인 API를 대신 조회하지 않는다.
- 공개 중계는 현재처럼 `credentials: 'omit'`로 호출한다.
- 하위 페이지 URL과 API URL을 구분한다. 예를 들어 `/game/history` 화면은
  `/api/trading/history`를 호출한다. 상대 경로 `api/...`로 바꾸면 하위 경로에서 깨질 수 있다.
- 개발 환경은 Vite의 `/api` HTTP 프록시와 `/api/socket.io` WebSocket 프록시를 유지한다.
  별도 호스트에서는 기존 VITE_API_BASE_URL/CLIENT_URL 설정을 맞춘다.
- 중첩 라우트에서 세션·게임 Socket 상태를 공통 레이아웃에 두고 페이지 이동 때
  중복 연결/폴링을 만들지 않는다. 구독 정리는 Frontend 구현에서 검증한다.
- 직접 URL 접근·새로고침은 호스팅의 SPA fallback 설정도 필요하다. `/api` 요청을
  index.html로 돌리면 안 된다. 현재 Express는 API 서버이므로 화면 URL 처리를 추가하지 않았다.

## 재현

테스트 전용 PostgreSQL 연결 문자열을 사용한다. 운영 DB에 실행하지 않는다.

```sh
TEST_DATABASE_URL='postgresql://investking_test:qa-only@127.0.0.1:5432/investking_test' npm --prefix server run test:integration
npm --prefix client test
```

`server/test/qa-integration.test.js`의 stage 12 하위 테스트가 화면별 연결을 확인한다.
GitHub의 기존 Backend integration QA도 해당 테스트를 포함해 실행한다.

## 완료 범위 구분

Backend 연결 확인은 완료했다. F-25~27의 네비게이션·하위 페이지 구현, 직접 접근·
새로고침·뒤로가기, 페이지 전환 구독 정리 및 반응형 화면 검증은 다음 Frontend 작업이다.
13단계는 기존 오류 계약 유지, 14단계는 Backend 변경 없음, 15단계는 B-18 재실행 및
발견 결함 별도 수정으로 진행한다. 실물 iPhone/Samsung 검증은 기존 합의대로 제외한다.

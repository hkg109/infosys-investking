# 개발 인계와 QA 후속 작업 순서

기존 1~6단계 구현을 바탕으로 `QA_DEVELOPMENT_PLAN.md`의 개선 작업을 지석(Backend)과 재헌(Frontend)이 순서대로 진행하기 위한 인계 문서다. 같은 기능에서는 지석이 API·DB·Socket 계약과 자동 테스트를 먼저 완료하고, 재헌이 해당 계약을 기준으로 화면을 연결한다.

## QA 개선 작업량

| 담당 | 작업 수 | 주요 책임 |
|---|---:|---|
| 지석 — Backend | 18 | DB, API, Socket, 인증, 게임 규칙, 동시성, 자동 테스트 |
| 재헌 — Frontend | 24 | 관리자 UI, 사용자 UI, 중계 화면, 모바일·접근성 검증 |
| 공동 문서 | 4 | API·프로젝트 명세, 운영·복구·행사 리허설 문서 |
| **합계** | **46** | **11단계, 권장 PR 20개** |

## 단계별 담당과 인계 순서

| 단계 | 개발 목표 | 지석 — Backend | 재헌 — Frontend | 브랜치·인계 조건 |
|---:|---|---|---|---|
| 1 | 관리자 인증·기본 사용성 | `B-01` 비밀번호 검증 API와 공통 관리자 인증 middleware | `F-01~05` 관리자 비밀번호 화면, 연결 상태 정리, 주문 폼 초기화, 메인 규칙, 내 정보·로그아웃 | 지석 `codex/admin-auth-backend` → 재헌 `codex/basic-qa-ui` |
| 2 | 참가자 관리·게임 초기화 | `B-02~04` 참가자 자산 조회, Socket 세션·온라인 상태, 종료 게임 Transaction 초기화 | `F-06~07` 실시간 참가자 표, 위험 안내·이중 확인이 있는 초기화·재시작 UI | 지석 `codex/game-reset-participants-backend` → 재헌 `codex/admin-participant-ui`; 1단계 필요 |
| 3 | 주식 종목 관리 | `B-05` 대기 상태에서만 가능한 종목 생성·수정·비활성화 API와 과거 참조 보존 | `F-08` 종목 코드·이름·설명·초기가·활성 상태 관리 UI | 지석 `codex/company-management-backend` → 재헌 `codex/company-management-ui`; 2단계 필요 |
| 4 | 복수·장중 사건과 월별 배정 | `B-06~08` 사건 migration, 랜덤·수동 배정 API, 거래 정지·가격 반영·재개 엔진과 중복 적용 방지 | `F-09~10` 복수 사건 편집, 거래 중/마감 후 구분, 발생·예고 시각과 충돌 검증 UI | 지석 `codex/multi-event-backend` → 재헌 `codex/event-schedule-ui`; 3단계 필요 |
| 5 | 익명 실시간 순위 | `B-09~10` 공개 Payload 익명화, 인증 사용자 본인만 `isMe` 식별 | `F-11` 다른 참가자는 순위·총자산만 표시하고 본인 강조·최종 결과 표시 | 지석 `codex/anonymous-ranking-backend` → 재헌 `codex/anonymous-ranking-ui`; 2단계 Socket 인증 필요 |
| 6 | 게임·뉴스·타이머 개편 | API·Socket 계약 변경 검토와 Frontend 연동 지원 | `F-12~14` 주문 왼쪽·뉴스 오른쪽 배치, 실제 뉴스형 화면, 이동·크기 조절 플로팅 타이머 | 재헌 `codex/game-dashboard-redesign`; 5단계 Frontend 이후 |
| 7 | 월별 거래·주가 분석 | `B-11~12` 권한별 월별 거래 API와 장중 사건 포함 주가 스냅샷·차트 API | `F-15~17` 본인 거래 현황, 종목별 차트, 투자 앱 형태의 주문·보유 화면 | 지석 `codex/market-history-backend` → 재헌 `codex/investment-dashboard-ui`; 4·6단계 필요 |
| 8 | 개인 비밀 미션 | `B-13~14` 미션 관리 API와 개인 배정·진행·1회 보상 엔진 | `F-18~19` 관리자 미션 관리, 사용자 비밀 미션·진행도·포인트 UI | 지석 `codex/mission-backend` → 재헌 `codex/mission-ui`; 2·4단계 필요 |
| 9 | 추가 시장정보 구매 | `B-15~16` 단서 관리 API, Transaction 포인트 차감, 구매자 전용 접근 제어 | `F-20~21` 관리자 단서 편집, 사용자 정보 상점·보관함·재접속 복구 | 지석 `codex/intelligence-backend` → 재헌 `codex/intelligence-ui`; 8단계 Backend 필요 |
| 10 | 대형 스크린 중계 | `B-17` 개인정보를 제외한 익명 순위·시장·뉴스·장중 사건 집계 Feed | `F-22~23` 16:9 `/broadcast`, 속보·가격 급변·결과·최종 순위 장면 전환 | 지석 `codex/broadcast-backend` → 재헌 `codex/broadcast-ui`; 4·5단계 필요 |
| 11 | 통합 QA·행사 인계 | `B-18` 동시 거래, 복수·장중 사건, 중복 방지, 재시작 복구 자동 테스트 | `F-24` 관리자·참가자 다수·모바일·중계 화면 전체 흐름 테스트 | 공동 `codex/qa-integration`; 1~10단계 병합 후 진행 |

문서 작업은 4단계 `D-01`, 8단계 `D-02`, 9단계 `D-03`, 11단계 `D-04`에서 함께 수행한다. 각 Backend PR은 성공 응답, 오류 코드, 요청 예시, Socket 이벤트와 Frontend 인계 사항을 포함해야 한다.

## 권장 PR 병합 순서

| 순서 | 담당 | 브랜치 | 완료 후 인계 대상 |
|---:|---|---|---|
| 1 | 지석 | `codex/admin-auth-backend` | 재헌 기본 QA UI |
| 2 | 재헌 | `codex/basic-qa-ui` | 2단계 Backend |
| 3 | 지석 | `codex/game-reset-participants-backend` | 재헌 참가자 관리 UI |
| 4 | 재헌 | `codex/admin-participant-ui` | 3단계 Backend |
| 5 | 지석 | `codex/company-management-backend` | 재헌 종목 관리 UI |
| 6 | 재헌 | `codex/company-management-ui` | 4단계 Backend |
| 7 | 지석 | `codex/multi-event-backend` | 재헌 사건 배정 UI |
| 8 | 재헌 | `codex/event-schedule-ui` | 5단계 Backend 및 후속 분석 화면 |
| 9 | 지석 | `codex/anonymous-ranking-backend` | 재헌 익명 순위 UI |
| 10 | 재헌 | `codex/anonymous-ranking-ui` | 게임 화면 개편 |
| 11 | 재헌 | `codex/game-dashboard-redesign` | 투자 화면·차트 UI |
| 12 | 지석 | `codex/market-history-backend` | 재헌 투자 대시보드 |
| 13 | 재헌 | `codex/investment-dashboard-ui` | 통합 화면 검증 |
| 14 | 지석 | `codex/mission-backend` | 재헌 미션 UI |
| 15 | 재헌 | `codex/mission-ui` | 추가 정보 기능 |
| 16 | 지석 | `codex/intelligence-backend` | 재헌 정보 상점 UI |
| 17 | 재헌 | `codex/intelligence-ui` | 중계 기능 |
| 18 | 지석 | `codex/broadcast-backend` | 재헌 중계 화면 |
| 19 | 재헌 | `codex/broadcast-ui` | 최종 통합 QA |
| 20 | 공동 | `codex/qa-integration` | 행사 리허설·배포 |

Frontend가 화면 뼈대를 병렬로 준비할 수는 있지만, 실제 연동·완료 판정은 선행 Backend PR의 API 계약이 확정된 뒤 진행한다. 선행 PR이 병합되지 않았다면 Frontend PR 설명에 의존 PR을 명시한다.

## QA 1단계 Frontend 인계

2026-09-16 제공된 인계서의 **F-01~05**를 `codex/basic-qa-ui`에서 구현했다. 앞으로의 단계 번호는 위 QA 개선 표를 따른다. 관리자 인증 화면, 연결 상태 정리, 주문 입력 초기화, 메인 규칙, 내 정보·로그아웃 범위이며 상세 검증과 남은 실기기 확인은 [QA 1단계 Frontend](QA_STAGE1_FRONTEND.md)에 기록한다. 아래 기존 구현/공동 검증 표는 각 작업 시점의 기록이며 이번 PR이 모든 통합 QA를 완료했다는 의미는 아니다.

## 기존 구현 단계 현황

| 단계 | 지석 서버 상태 | 남은 일 |
|---|---|---|
| 1 Socket | 구현 및 Node.js 연결 테스트 완료 | 재헌 브라우저 연동·공동 검증 |
| 2 사용자 세션 | PostgreSQL 사용자·세션 및 참가·복구 API 구현 | 브라우저 쿠키 공동 검증 |
| 3 게임 상태·타이머 | Backend 구현 | 관리자 제어·사용자 현황 브라우저 공동 검증 |
| 4 DB·거래 | Backend 구현 | 주문 UI와 행사 환경 공동 검증 |
| 5 사건 | Backend 구현 | 사건 관리·결과 UI와 행사 환경 공동 검증 |
| 6 순위 | Backend 구현 | 순위·종료 결과 UI와 행사 환경 공동 검증 |

지석 PC에서 로컬 서버와 PostgreSQL을 운영할 수 있으며 별도 호스팅은 필수가 아닙니다. 같은 네트워크의 참가자는 PC 내부 IP로 접속하도록 Frontend·API 주소를 맞추고 행사장 네트워크에서 검증해야 합니다. DB는 서버 PC 내부에서만 접근하도록 설정합니다.

## 현재 완료 기준

| 범위 | 상태 | 근거 또는 남은 작업 |
|---|---|---|
| 서버 연결 및 전체 이벤트 전달 | 구현·자동 테스트 완료 | server/test/socket.test.js |
| 연결 해제 후 명시적 재접속 | 자동 테스트 완료 | 새 연결에서 새 이벤트 수신 |
| Health Check 및 CORS 응답 헤더 | 자동 테스트 완료 | HTTP 응답 및 허용 origin 헤더 |
| 관리자 비밀번호 검증·공통 middleware | Backend·Frontend 구현 및 검증 완료 | 관리자 진입 인증·잠금·새로고침 재인증, `docs/QA_STAGE1_FRONTEND.md` 참조 |
| 참가자 자산 조회·Socket 온라인 상태·게임 초기화 | Backend 구현·PostgreSQL·Socket 통합 테스트 완료 | 재헌 참가자 표와 초기화·재시작 UI 연동 필요 |
| 주식 종목 생성·수정·비활성화 | Backend 구현·PostgreSQL 통합 테스트 완료 | 재헌 종목 관리·참조 경고 UI 연동 필요 |
| 복수·장중 사건, 수동·랜덤 월별 배정 | Backend 구현·PostgreSQL 통합 테스트 완료 | 재헌 `F-09~10` 사건 배정·발생 시각·충돌 검증 UI 연동 필요 |
| 익명 실시간 순위·사용자별 `isMe` | Backend 구현·PostgreSQL·Socket 전달 테스트 완료 | 재헌 `F-11` 익명 순위와 본인 강조 UI 연동 필요 |
| 실제 관리자 버튼 → 사용자 화면 | 미연동·미검증 | 재헌 Frontend 연동 후 공동 확인 |
| 브라우저 콘솔·모바일 UI | 이번 PR에서 미검증 | 브라우저 테스트 필요 |
| 사용자 HTTP 세션·게임 진행 Backend | 구현·자동 테스트 완료 | Socket 사용자 인증과 Frontend 연동은 후속 작업 |
| DB·매수·매도 Backend | 구현·PostgreSQL 통합 테스트 완료 | Frontend 주문 UI와 행사 환경 검증은 후속 작업 |
| 사건·뉴스·주가 변동 Backend | 구현·PostgreSQL 통합 테스트 완료 | Frontend 사건 관리·결과 UI와 행사 환경 검증은 후속 작업 |
| 총자산·익명 순위·최종 결과 Backend | 구현·PostgreSQL 통합 테스트 완료 | Frontend 익명 순위·본인 강조·종료 결과 UI와 행사 환경 검증은 후속 작업 |

## Frontend 연동 후 공동 확인

이 목록은 미실행 항목입니다. Node.js 테스트 통과로 체크하지 않습니다.

- [ ] 서버를 실행하고 `CLIENT_URL`과 실제 프론트 주소를 일치시킨다.
- [ ] 관리자 화면 하나와 사용자 화면 세 개를 각각 별도 브라우저 세션에서 연다.
- [ ] 관리자 버튼에서 인증된 시작 API를 호출하고 모든 화면이 `game:start`와 `game:state`에 반응하는지 확인한다.
- [ ] 사용자 한 명이 접속을 끊었다가 다시 접속한 뒤 새 이벤트를 수신하는지 확인한다.
- [ ] 브라우저 콘솔 오류와 모바일 화면을 확인한다.
- [ ] 결과와 실행 환경을 해당 Frontend/통합 PR에 기록한다.

현재 관리자 HTTP API는 `ADMIN_PASSWORD` Bearer 인증을 사용한다. 운영 배포 전 비밀번호를 안전하게 설정하고 HTTPS 환경에서 브라우저 연동을 검증해야 한다.

## 공통 인계 기준

1. 지석은 Backend PR에 API 요청·응답, 오류 코드, 인증 방식, Socket 변경, migration과 자동 테스트 결과를 기록한다.
2. 재헌은 선행 Backend 계약을 기준으로 UI를 연결하고 로딩·성공·실패·재접속 상태를 모두 처리한다.
3. 각자 작업 브랜치는 최신 `main`에서 만들고 한 브랜치에는 한 단계의 담당 범위만 포함한다.
4. Backend 단위·통합 테스트와 실제 브라우저·모바일 검증을 구분해 PR에 기록한다.
5. 기능 PR이 병합되면 다음 담당자는 최신 `main`을 반영한 뒤 연동 테스트를 시작한다.

## 작업 번호와 GitHub 번호

GitHub에서는 Issue와 PR이 번호를 공유한다. 협업 가이드의 권장 번호를 실제 번호로 가정하지 않는다.

| 가이드 작업 | 실제 Issue | 구현 PR |
|---|---|---|
| 작업 번호 2: Socket.IO 기본 연결 — 지석 서버 범위 | [#3](https://github.com/hkg109/infosys-investking/issues/3) | [#2](https://github.com/hkg109/infosys-investking/pull/2) |

PR의 `Closes #3`은 서버 범위 Issue를 닫는다. 브라우저 통합까지 완료했다는 뜻은 아니다. 다음 작업 시작 시 기존 Issue를 확인하고 해당 작업의 실제 Issue 번호를 PR에 연결한다.

## 환경 설정 보완 이력

초기 scaffold에는 루트 `.env` 로딩이 없었다. 현재 PR의 서버는 루트 `.env`를 읽고 셸 환경변수를 우선하며 파일이 없어도 기본값으로 시작한다. 실제 `.env`는 Git에 포함하지 않는다.

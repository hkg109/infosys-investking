# Infosys InvestKing 협업 개발 프로세스

> 팀원: **지석(팀장)**, **재헌**  
> 협업 도구: **Git + GitHub**  
> 기본 브랜치: **main**  
> 개발 방식: **기능별 브랜치 + Pull Request + 코드 리뷰**

---

# 1. 팀 구성 및 역할

## 1.1 지석 — 팀장 / Backend / Core Logic / Integration

지석은 프로젝트 전체 구조와 서버 핵심 로직을 담당한다.

주요 담당:

- 프로젝트 초기 구조 설계
- Node.js / Express 서버
- Socket.IO 서버
- 사용자 세션 Backend
- 게임 상태 관리
- 서버 기준 타이머
- Database 설계 및 연결
- 매수 / 매도 Backend
- DB Transaction 및 동시성 처리
- 사건 시스템 Backend
- 사건 랜덤 배치
- 주가 변동 처리
- 순위 계산
- API / Socket 이벤트 규약 관리
- 최종 통합
- 배포 주도
- Pull Request 최종 Merge

---

## 1.2 재헌 — Frontend / UI / Client Logic

재헌은 사용자와 관리자가 실제로 사용하는 화면 및 클라이언트 연동을 담당한다.

주요 담당:

- 메인 페이지
- 닉네임 + PIN 참가 UI
- 사용자 게임 화면
- 관리자 대시보드
- 게임 상태에 따른 화면 변경
- 서버 타이머 표시
- 매수 / 매도 UI
- 주가 / 등락률 표시
- 뉴스 / 사건 결과 표시
- 사건 관리 UI
- 순위 UI
- Socket Client 연결
- API 연동
- 프론트엔드 테스트

---

# 2. 전체 협업 원칙

## 2.1 main 브랜치

`main`은 항상 실행 가능한 안정 버전으로 유지한다.

```text
main
=
현재 통합된 최신 안정 버전
```

두 사람 모두 `main`에 직접 기능 코드를 작성하지 않는다.

---

## 2.2 기능별 브랜치

모든 기능은 별도 브랜치에서 개발한다.

예:

```text
feat/socket
feat/user-entry
feat/user-session
feat/game-state
feat/game-timer
feat/admin-dashboard
feat/database
feat/trading
feat/events
feat/ranking
```

기타 브랜치:

```text
fix/버그명
docs/문서명
refactor/대상
chore/작업명
```

---

# 3. 전체 Git 협업 흐름

모든 기능은 아래 순서를 따른다.

```text
GitHub Issue 생성
↓
최신 main 받기
↓
기능 브랜치 생성
↓
개발
↓
Commit
↓
Push
↓
Pull Request 생성
↓
상대방 Review
↓
지석 최종 Merge
↓
main 최신화
```

---

# 4. 프로젝트 초기 설정

## 담당

**지석**

## Issue

```text
#1 프로젝트 초기 구조 구축
```

## 브랜치

```bash
git switch -c chore/project-init
```

## 구현 범위

```text
infosys-investking/
│
├─ client/
│  ├─ src/
│  │  ├─ pages/
│  │  ├─ components/
│  │  └─ App.jsx
│  └─ package.json
│
├─ server/
│  ├─ src/
│  │  └─ server.js
│  └─ package.json
│
├─ docs/
│  └─ PROJECT_SPEC.md
│
├─ .env.example
├─ .gitignore
└─ README.md
```

기본 페이지:

```text
/
→ 메인 페이지

/game
→ 사용자 게임 페이지

/admin
→ 관리자 페이지
```

초기 단계에서는 다음 기능을 구현하지 않는다.

```text
DB
Socket.IO
게임 타이머
거래
사건
PIN 인증 Backend
순위
```

초기 구조와 라우팅만 구성한다.

---

# 5. 초기 프로젝트 PR

지석 작업 완료 후:

```bash
git add .
git commit -m "chore: initialize project structure"
git push origin chore/project-init
```

GitHub에서:

```text
chore/project-init
↓
Pull Request
↓
재헌 Review
↓
지석 Merge
↓
main
```

이 시점부터 공동 개발을 시작한다.

---

# 6. 1차 개발 — Socket + 참가 화면

초기 구조가 main에 Merge되면 두 사람 모두 최신 main을 받는다.

```bash
git switch main
git pull origin main
```

---

## 6.1 지석

### Issue

```text
#2 Socket.IO 기본 연결
```

### 브랜치

```bash
git switch -c feat/socket
```

### 구현

- Express Server
- Socket.IO Server
- Client 연결 감지
- Client 연결 해제 감지
- 기본 Socket 이벤트
- `game:start` 이벤트 테스트

### 완료 조건

```text
관리자
↓
game:start
↓
Server
↓
사용자 A / B / C
↓
동시에 이벤트 수신
```

---

## 6.2 재헌

### Issue

```text
#3 사용자 참가 화면
```

### 브랜치

```bash
git switch -c feat/user-entry
```

### 구현

- 닉네임 입력
- 4자리 PIN 입력
- 게임 참가 버튼
- 입력값 검증
- 기본 `/game` 이동 UI

이 단계에서는 DB 인증까지 구현하지 않아도 된다.

---

# 7. 2차 개발 — 사용자 세션

## 7.1 지석

### Issue

```text
#4 사용자 Session Backend
```

### 브랜치

```text
feat/user-session
```

### 구현

- 닉네임 중복 확인
- PIN Hash
- userId 생성
- 사용자 생성
- 기존 사용자 확인
- 닉네임 + PIN 계정 복구
- 기존 자산 및 게임 상태 조회 기반 준비

---

## 7.2 재헌

### Issue

```text
#5 사용자 Session UI
```

### 브랜치

```text
feat/user-session-ui
```

### 구현

- 서버 참가 요청
- userId 브라우저 저장
- 기존 userId 자동 확인
- 닉네임 + PIN 복구 화면
- 오류 메시지
- 참가 성공 시 `/game` 이동

---

# 8. 3차 개발 — 게임 상태 및 타이머

## 8.1 지석

### Issue

```text
#6 Game State
```

### 브랜치

```text
feat/game-state
```

### 구현

```text
WAITING
RUNNING
PAUSED
FINISHED
```

관련 이벤트:

```text
game:start
game:pause
game:resume
game:end
```

---

### Issue

```text
#7 Game Timer
```

### 브랜치

```text
feat/game-timer
```

### 구현

기본 구조:

```text
1개월 = 10분

00:00
월 시작

00:00 ~ 09:00
거래 가능

09:00
거래 마감

09:00 ~ 10:00
사건 결과 공개

10:00
다음 월
```

관련 이벤트:

```text
round:start
round:end
trading:open
trading:close
```

---

## 8.2 재헌

### Issue

```text
#8 Admin Dashboard
```

### 브랜치

```text
feat/admin-dashboard
```

### 구현

관리자 화면:

- 현재 게임 상태
- 현재 월
- 남은 시간
- 접속 참가자 수
- 게임 시작
- 일시정지
- 재개
- 종료

---

### Issue

```text
#9 User Game Dashboard
```

### 브랜치

```text
feat/game-dashboard
```

### 구현

사용자 화면:

- 현재 월
- 남은 시간
- 현재 현금
- 총자산
- 현재 주가
- 뉴스
- 보유 주식

---

# 9. 4차 개발 — Database + 거래

## 9.1 지석

### Issue

```text
#10 Database
```

### 브랜치

```text
feat/database
```

### 구현

주요 테이블:

```text
User
Game
Company
Wallet
Portfolio
Transaction
Event
EventEffect
GameEvent
```

---

### Issue

```text
#11 Trading Backend
```

### 브랜치

```text
feat/trading
```

### 구현

- 매수
- 매도
- 현금 검사
- 보유량 검사
- orderId
- DB Transaction
- 동시 거래 처리
- 09:00 이후 거래 차단
- 서버 시간 기준 거래 승인

---

## 9.2 재헌

### Issue

```text
#12 Trading UI
```

### 브랜치

```text
feat/trading-ui
```

### 구현

- 종목 목록
- 현재 가격
- 등락률
- 주문 수량 입력
- 매수 버튼
- 매도 버튼
- 보유 현금
- 보유 수량
- 거래 성공 / 실패 표시

---

# 10. 5차 개발 — 사건 시스템

## 10.1 지석

### Issue

```text
#13 Event Backend
```

### 브랜치

```text
feat/events
```

### 구현

- 사건 생성 / 조회 / 수정 / 삭제 Backend
- 게임 시작 시 사건 Shuffle
- 설정 단계 수만큼 사건 선택
- 월별 사건 배정
- EventEffect
- 거래 종료 후 사건 적용
- 주가 변동
- 뉴스 / 결과 Socket 이벤트

---

## 10.2 재헌

### Issue

```text
#14 Event Admin UI
```

### 브랜치

```text
feat/event-admin
```

### 구현

관리자:

- 사건 목록
- 사건 등록
- 사건 수정
- 사건 삭제
- 관련 기업 선택
- 변동률 입력

사용자:

- 월별 뉴스 표시
- 사건 결과 표시
- 주가 변동 표시

---

# 11. 6차 개발 — 순위

## 11.1 지석

### Issue

```text
#15 Ranking Backend
```

### 브랜치

```text
feat/ranking
```

### 계산

```text
총자산
=
현금
+
보유 주식 평가액
```

구현:

- 참가자 총자산 계산
- 순위 정렬
- Socket으로 순위 전달
- 최종 순위 확정

---

## 11.2 재헌

### Issue

```text
#16 Ranking UI
```

### 브랜치

```text
feat/ranking-ui
```

### 구현

- 현재 순위
- TOP 3
- 내 순위
- 총자산 표시
- 게임 종료 결과 화면

---

# 12. 7차 개발 — 통합 테스트 및 배포

## 공동 담당

**지석 + 재헌**

### Issue

```text
#17 통합 테스트
```

테스트 항목:

- 사용자 여러 명 동시 접속
- Socket 연결
- 닉네임 중복
- PIN 계정 복구
- 새로고침
- 게임 시작
- 일시정지 / 재개
- 서버 타이머
- 09:00 거래 차단
- 동시 매수 / 매도
- 사건 적용
- 주가 갱신
- 순위 계산
- 게임 종료

---

### Issue

```text
#18 행사 배포
```

담당:

- 지석: 배포 및 서버 설정
- 재헌: 실제 휴대폰 환경 UI 테스트
- 둘 다: 행사 환경에서 동시 접속 테스트

---

# 13. 권장 GitHub Issue 목록

| Issue | 기능 | 담당 |
|---|---|---|
| #1 | Project Scaffold | 지석 |
| #2 | Socket.IO 기본 연결 | 지석 |
| #3 | 사용자 참가 UI | 재헌 |
| #4 | 사용자 Session Backend | 지석 |
| #5 | 사용자 Session UI | 재헌 |
| #6 | Game State | 지석 |
| #7 | Game Timer | 지석 |
| #8 | Admin Dashboard | 재헌 |
| #9 | User Game Dashboard | 재헌 |
| #10 | Database | 지석 |
| #11 | Trading Backend | 지석 |
| #12 | Trading UI | 재헌 |
| #13 | Event Backend | 지석 |
| #14 | Event Admin UI | 재헌 |
| #15 | Ranking Backend | 지석 |
| #16 | Ranking UI | 재헌 |
| #17 | 통합 테스트 | 지석 + 재헌 |
| #18 | 행사 배포 | 지석 + 재헌 |

---

# 14. 실제 Git 작업 방법

예: 재헌이 `feat/user-entry`를 개발하는 경우

## 14.1 최신 main 받기

```bash
git switch main
git pull origin main
```

## 14.2 기능 브랜치 생성

```bash
git switch -c feat/user-entry
```

## 14.3 개발 후 상태 확인

```bash
git status
```

## 14.4 Commit

```bash
git add .
git commit -m "feat: add user entry form"
```

## 14.5 GitHub에 Push

```bash
git push origin feat/user-entry
```

## 14.6 GitHub에서 Pull Request 생성

```text
base:
main

compare:
feat/user-entry
```

---

# 15. Commit Message 규칙

형식:

```text
type: 작업 내용
```

사용 type:

| type | 의미 |
|---|---|
| feat | 새로운 기능 |
| fix | 버그 수정 |
| docs | 문서 수정 |
| refactor | 코드 구조 개선 |
| chore | 설정 / 환경 작업 |
| test | 테스트 |

예:

```text
feat: add socket.io server
feat: add user entry form
feat: implement game timer

fix: prevent duplicate stock order

docs: update collaboration guide

refactor: separate socket event handlers

chore: configure project dependencies
```

---

# 16. Pull Request 작성 규칙

PR에는 최소 다음 정보를 작성한다.

```md
## 관련 Issue

Closes #3

## 작업 내용

- 닉네임 입력 UI 구현
- 4자리 PIN 입력 UI 구현
- 게임 참가 버튼 구현
- 기본 입력 검증 구현

## 테스트

- 닉네임 공백 입력 확인
- PIN 4자리 검사
- 정상 입력 시 화면 이동 확인

## Screenshot

UI 변경이 있는 경우 화면 이미지 첨부
```

---

# 17. PR Review 규칙

2명이므로 모든 주요 기능은 상대방이 한 번 확인한다.

## 재헌의 PR

```text
재헌
↓
PR 생성
↓
지석 Review
↓
지석 Approve
↓
지석 Merge
```

## 지석의 PR

```text
지석
↓
PR 생성
↓
재헌 Review
↓
재헌 Approve
↓
지석 Merge
```

**팀장인 지석이 최종 Merge를 담당한다.**

자기 PR을 아무 검토 없이 바로 Merge하지 않는다.

---

# 18. Merge 방식

기본적으로 GitHub의:

```text
Squash and merge
```

방식을 사용한다.

기능 개발 중 여러 Commit이 존재하더라도 main에는 하나의 기능 Commit으로 정리한다.

예:

개발 브랜치:

```text
fix form
fix validation
fix style
final
```

main:

```text
feat: add user entry form
```

---

# 19. Merge 후 작업

PR이 Merge되면 두 사람 모두 최신 main을 다시 받는다.

```bash
git switch main
git pull origin main
```

완료한 로컬 브랜치는 삭제한다.

```bash
git branch -d feat/user-entry
```

다음 기능을 시작할 때:

```bash
git switch main
git pull origin main

git switch -c feat/새기능
```

**항상 최신 main에서 새 브랜치를 만든다.**

---

# 20. Merge Conflict 최소화

가능하면 두 사람이 동시에 같은 파일을 크게 수정하지 않는다.

예:

지석:

```text
server/src/*
server/src/socket/*
server/src/services/*
server/src/db/*
```

재헌:

```text
client/src/pages/*
client/src/components/*
client/src/styles/*
```

공통 파일:

```text
client/src/App.*
server/package.json
client/package.json
.env.example
```

공통 파일을 수정해야 할 경우 서로 먼저 공유한다.

---

# 21. API / Socket 규약

두 사람이 같은 이름을 사용하도록 사전에 규약을 맞춘다.

Socket 이벤트 예:

```text
user:join

game:start
game:pause
game:resume
game:end

round:start
round:end

trading:open
trading:close

news:publish

stock:update

ranking:update
```

예:

지석:

```js
io.emit("game:start");
```

재헌:

```js
socket.on("game:start", () => {
    // 게임 시작 화면 반영
});
```

이벤트 이름 변경 시 반드시 함께 공유하고 문서도 수정한다.

---

# 22. 팀장의 역할

지석은 단순히 Backend 개발만 하는 것이 아니라 프로젝트 전체 통합을 관리한다.

주요 역할:

- Issue 생성 및 담당자 배정
- 프로젝트 명세 관리
- API 규약 관리
- Socket 이벤트 규약 관리
- DB 구조 관리
- PR 최종 확인
- Merge 순서 관리
- 기능 간 충돌 해결
- main 안정성 확인
- 배포 관리

재헌은 자신의 Frontend 기능 개발 외에도 지석의 PR을 리뷰한다.

---

# 23. 권장 작업 순서

```text
[지석]

Project Scaffold
↓
Socket.IO
↓
User Session Backend
↓
Game State
↓
Game Timer
↓
Database
↓
Trading Backend
↓
Event Backend
↓
Ranking Backend
↓
Integration / Deploy
```

```text
[재헌]

User Entry UI
↓
User Session UI
↓
Admin Dashboard
↓
User Game Dashboard
↓
Trading UI
↓
Event Admin UI
↓
Ranking UI
↓
Integration Test
```

---

# 24. 전체 개발 흐름

```text
                         main
                          │
              ┌───────────┴───────────┐
              │                       │
             지석                     재헌
       Backend / Core            Frontend / UI
              │                       │
              ▼                       ▼
        feat/socket            feat/user-entry
              │                       │
              └──────── PR ───────────┘
                          │
                       Review
                          │
                     지석 Merge
                          │
                         main
                          │
              ┌───────────┴───────────┐
              │                       │
      feat/game-state        feat/admin-dashboard
              │                       │
              └──────── PR ───────────┘
                          │
                         ...
```

---

# 25. 핵심 규칙 요약

1. `main`에 직접 기능 코드를 작성하지 않는다.
2. 모든 기능은 GitHub Issue로 관리한다.
3. 기능마다 별도의 `feat/*` 브랜치를 만든다.
4. 항상 최신 `main`에서 새 브랜치를 생성한다.
5. 작업 후 Commit → Push → PR 순서로 진행한다.
6. 모든 주요 PR은 상대방이 한 번 리뷰한다.
7. 최종 Merge는 팀장 지석이 담당한다.
8. Merge 방식은 기본적으로 `Squash and merge`를 사용한다.
9. Merge가 끝나면 두 사람 모두 최신 `main`을 다시 받는다.
10. Socket/API 규약은 문서에 기록하고 두 사람이 동일한 이름을 사용한다.

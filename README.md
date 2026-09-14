# Infosys InvestKing

정보시스템학과 행사 참가자가 뉴스와 사건을 바탕으로 가상 기업에 투자하는 실시간 모의투자 게임입니다.

## 현재 개발 단계

**1단계 — 지석 담당 Socket.IO 기본 연결**. 서버 연결·해제 로그와 `game:start` 테스트 이벤트 전달을 제공합니다. Frontend는 초기 mock 화면이며 아직 Socket.IO에 연결되지 않았습니다. 데이터베이스, 인증, 실제 게임 로직은 후속 단계입니다.

**완료 범위: 서버 기본 연결 구현·자동 테스트. 전체 1단계의 브라우저 통합 완료를 의미하지 않습니다.** 현재 이벤트는 로컬 개발용이며 인증 없이 모든 연결이 요청할 수 있으므로 행사 운영용으로 사용하지 않습니다.

- 서버 작업: [실제 Issue #3](https://github.com/hkg109/infosys-investking/issues/3), [PR #2](https://github.com/hkg109/infosys-investking/pull/2)
- 브라우저 통합 검증 및 후속 작업 순서: [개발 인계](docs/DEVELOPMENT_HANDOFF.md)

## 기술 스택

- Frontend: React + Vite + React Router
- Backend: Node.js + Express
- Realtime: Socket.IO (서버 기본 연결)
- Database: PostgreSQL 예정

## 디렉터리 구조

```text
infosys-investking/
├─ client/
│  ├─ public/
│  ├─ src/
│  │  ├─ components/
│  │  ├─ layouts/
│  │  ├─ pages/
│  │  ├─ styles/
│  │  ├─ App.jsx
│  │  └─ main.jsx
│  └─ package.json
├─ server/
│  ├─ src/server.js
│  ├─ test/socket.test.js
│  └─ package.json
├─ docs/
│  ├─ COLLABORATION_GUIDE.md
│  ├─ PROJECT_SPEC.md
│  ├─ SOCKET_PROTOCOL.md
│  └─ DEVELOPMENT_HANDOFF.md
├─ .env.example
├─ .gitignore
└─ README.md
```

## 사전 요구사항

- Node.js 22.12 이상 (검증 환경: 24.14.1)
- npm

## Frontend 설치 및 실행

```bash
cd client
npm install
npm run dev
```

개발 서버의 기본 주소는 `http://localhost:5173`입니다. 주요 화면은 `/`, `/game`, `/admin`에서 확인할 수 있습니다.

프로덕션 빌드는 `npm run build`로 확인합니다.

## Backend 설치 및 실행

```bash
cd server
npm install
npm run dev
```

일반 실행에는 `npm start`를 사용할 수도 있습니다. 서버의 기본 주소는 `http://localhost:3000`입니다.

## 환경변수 설정

저장소 루트의 `.env.example`을 참고해 로컬 `.env`를 만드세요. 실제 `.env` 파일은 Git에 포함하지 않습니다.

```env
PORT=3000
CLIENT_URL=http://localhost:5173
DATABASE_URL=
ADMIN_PASSWORD=
```

현재 서버는 `PORT`와 Socket.IO의 허용 브라우저 origin인 `CLIENT_URL`을 사용합니다. `DATABASE_URL`과 `ADMIN_PASSWORD`는 이후 기능을 위한 자리표시자입니다.
서버는 루트 `.env`를 자동으로 읽으며, 이미 설정된 셸 환경변수를 우선합니다.

## Health Check

백엔드를 실행한 후 `GET http://localhost:3000/api/health`를 요청합니다.

정상 응답:

```json
{
  "status": "ok"
}
```

## 주요 문서

- [Socket.IO 연결 규약 및 검증](docs/SOCKET_PROTOCOL.md)

- [프로젝트 명세](docs/PROJECT_SPEC.md)
- [협업 가이드](docs/COLLABORATION_GUIDE.md)

## Git 협업 규칙 요약

- `main`에서 직접 기능을 개발하지 않습니다.
- 기능별 `feat/*` 브랜치를 사용합니다.
- 작업은 Pull Request로 제출하고 상대방의 Review를 받습니다.
- 팀장 지석이 최종 Merge를 담당합니다.
- `Squash and merge`를 권장합니다.

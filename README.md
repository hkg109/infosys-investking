# Infosys InvestKing

정보시스템학과 행사 참가자가 뉴스와 사건을 바탕으로 가상 기업에 투자하는 실시간 모의투자 게임입니다.

## 현재 개발 단계

**2단계 — 지석 담당 사용자 세션 Backend**. PostgreSQL 기반 참가·PIN 계정 복구·세션 조회·로그아웃 API를 제공합니다. Frontend는 초기 mock 화면으로 아직 참가 API에 연결되지 않았습니다. 관리자 인증, 실제 자산·게임 상태·거래는 후속 단계입니다.

현재 `game:start` 이벤트는 1단계 로컬 연결 테스트용입니다. 사용자 HTTP 세션과 Socket 인증은 아직 연결되지 않았으며, 실제 운영 전 관리자 권한 검증이 필요합니다.

- 현재 사용자 세션 작업: [Issue #4](https://github.com/hkg109/infosys-investking/issues/4)
- 완료한 Socket 서버 작업: [Issue #3](https://github.com/hkg109/infosys-investking/issues/3), [PR #2](https://github.com/hkg109/infosys-investking/pull/2)
- 브라우저 통합 검증 및 후속 작업 순서: [개발 인계](docs/DEVELOPMENT_HANDOFF.md)

## 기술 스택

- Frontend: React + Vite + React Router
- Backend: Node.js + Express
- Realtime: Socket.IO (서버 기본 연결)
- Database: PostgreSQL (사용자·세션 테이블)

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

사용자 API 사용 전 PostgreSQL에 프로젝트용 사용자와 데이터베이스를 만들고 루트 `.env`의 `DATABASE_URL`을 설정합니다. 로컬 개발 예시 형식은 `postgresql://사용자:비밀번호@localhost:5432/infosys_investking`입니다. 실제 비밀번호를 저장소에 올리지 않습니다.

```bash
cd server
npm run db:migrate
npm test
```

`db:migrate`는 사용자·세션 테이블을 준비합니다. DB 설정이 없으면 사용자 API는 503을 반환하며 Health Check와 기존 Socket 연결 테스트는 사용할 수 있습니다. `/api/health`는 프로세스 생존 확인이며 DB readiness 검사가 아닙니다.

실제 DB 통합 검증에는 루트 `.env`의 `TEST_DATABASE_URL`이 필요합니다. 지정 DB 안에 테스트별 임시 스키마를 생성하고 해당 스키마만 삭제합니다. 설정하지 않으면 PostgreSQL 테스트가 명시적으로 skip됩니다. 개발 DB를 사용하고 행사 운영 DB를 테스트 대상으로 지정하지 않습니다.

## 환경변수 설정

저장소 루트의 `.env.example`을 참고해 로컬 `.env`를 만드세요. 실제 `.env` 파일은 Git에 포함하지 않습니다.

```env
PORT=3000
CLIENT_URL=http://localhost:5173
DATABASE_URL=
ADMIN_PASSWORD=
```

서버는 `PORT`, 브라우저 허용 origin `CLIENT_URL`, PostgreSQL 접속 `DATABASE_URL`을 사용합니다. `ADMIN_PASSWORD`는 아직 사용하지 않습니다. `NODE_ENV=production`에서는 세션 쿠키에 Secure가 적용되므로 HTTPS가 필요합니다.
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
- [사용자 세션 API 및 정책](docs/USER_SESSION_API.md)

- [프로젝트 명세](docs/PROJECT_SPEC.md)
- [협업 가이드](docs/COLLABORATION_GUIDE.md)

## Git 협업 규칙 요약

- `main`에서 직접 기능을 개발하지 않습니다.
- 기능별 `feat/*` 브랜치를 사용합니다.
- 작업은 Pull Request로 제출하고 상대방의 Review를 받습니다.
- 팀장 지석이 최종 Merge를 담당합니다.
- `Squash and merge`를 권장합니다.

# Infosys InvestKing

정보시스템학과 행사 참가자가 뉴스와 사건을 바탕으로 가상 기업에 투자하는 실시간 모의투자 게임입니다.

## 현재 개발 단계

**Project Scaffold** — 이후 기능별 병렬 개발을 위한 React 프론트엔드와 Express 백엔드의 공통 기반만 구성되어 있습니다. Socket.IO, 데이터베이스, 인증, 실제 게임 로직은 아직 포함하지 않습니다.

## 기술 스택

- Frontend: React + Vite + React Router
- Backend: Node.js + Express
- Realtime: Socket.IO 예정
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
│  └─ package.json
├─ docs/
│  ├─ COLLABORATION_GUIDE.md
│  └─ PROJECT_SPEC.md
├─ .env.example
├─ .gitignore
└─ README.md
```

## 사전 요구사항

- Node.js 20.19 이상 또는 22.12 이상
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

현재 scaffold에서 서버가 사용하는 값은 `PORT`뿐입니다. 나머지는 이후 기능을 위한 자리표시자입니다.

## Health Check

백엔드를 실행한 후 `GET http://localhost:3000/api/health`를 요청합니다.

정상 응답:

```json
{
  "status": "ok"
}
```

## 주요 문서

- [프로젝트 명세](docs/PROJECT_SPEC.md)
- [협업 가이드](docs/COLLABORATION_GUIDE.md)

## Git 협업 규칙 요약

- `main`에서 직접 기능을 개발하지 않습니다.
- 기능별 `feat/*` 브랜치를 사용합니다.
- 작업은 Pull Request로 제출하고 상대방의 Review를 받습니다.
- 팀장 지석이 최종 Merge를 담당합니다.
- `Squash and merge`를 권장합니다.

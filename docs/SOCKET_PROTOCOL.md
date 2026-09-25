# Socket.IO 연결 규약

담당: 지석 / 협업 가이드 작업 번호 2 / 브랜치 `feat/socket`.

실제 GitHub 추적: [Issue #3](https://github.com/hkg109/infosys-investking/issues/3), [PR #2](https://github.com/hkg109/infosys-investking/pull/2). 가이드 작업 번호와 GitHub 번호는 동일하지 않습니다.

## 연결

기본 서버 주소는 `http://localhost:3000`, Socket.IO 기본 경로는 `/socket.io`입니다. `CLIENT_URL`은 브라우저 프론트엔드 origin이며 기본값은 `http://localhost:5173`입니다. 서버는 HTTP long-polling과 WebSocket을 지원합니다.

연결 및 해제 시 서버 콘솔에 socket ID와 해제 사유를 기록합니다. socket ID는 일시적인 연결 식별자이며 사용자 계정 ID가 아닙니다.

유효한 사용자 세션 쿠키가 있는 연결은 HTTP 세션과 같은 참가자로 식별합니다. 같은 사용자의 여러 탭은 사용자 ID별 연결 개수로 묶어 첫 연결부터 마지막 해제까지 온라인으로 처리합니다. `session:ready`, `participants:presence` 이벤트와 Frontend 설정은 [PARTICIPANT_RESET_API.md](PARTICIPANT_RESET_API.md)를 참조합니다.

## 1단계 테스트 이벤트 이력

| 방향 | 이벤트 | Payload | 동작 |
|---|---|---|---|
| Client → Server | `game:start` | 없음 | 1단계 연결 테스트 요청(3단계에서 제거) |
| Server → 전체 Client | `game:start` | 없음 | 1단계에서는 요청자 포함 전체 전달 |

3단계부터 클라이언트가 보낸 제어 이벤트는 처리하지 않습니다. 게임 제어는 인증된 관리자 HTTP API만 사용하며 서버가 실제 상태를 변경한 뒤 Socket 이벤트를 전달합니다. 최신 규약은 [GAME_STATE_API.md](GAME_STATE_API.md)를 참조합니다.

연결이 끊긴 동안 개별 이벤트는 재전송하지 않지만, 재연결 직후 `game:state`로 현재 상태를 받고 `GET /api/events/current`로 현재 뉴스와 적용 결과를 복구할 수 있습니다. 게임 상태와 사건 적용 결과는 PostgreSQL에 저장됩니다.

사건 이벤트는 기존 `news:publish`, `event:result`, `stock:update`에 장중 사건용 `market:event:warning`, `trading:halt`, `market:event:breaking`, `trading:resume`이 추가됩니다. 거래정지 중 HTTP 주문은 `MARKET_HALTED`로 거절되며 Payload와 정확한 순서는 [EVENT_API.md](EVENT_API.md)를 참조합니다.

순위 이벤트는 `ranking:update`입니다. 공개 연결에는 닉네임과 계정 식별자가 없는 익명 순위를 보내고, 인증된 참가자 연결에는 본인 항목 하나만 `isMe: true`로 표시한 사용자별 Payload를 보냅니다. 거래 커밋, 사건에 따른 주가 변경, 게임 종료 뒤 갱신되며 상세 Payload와 복구 API는 [RANKING_API.md](RANKING_API.md)를 참조합니다.

## 검증

```bash
cd server
npm install
npm test
```

테스트가 임시 포트에 서버를 실행하고 관리자 역할 1개와 사용자 역할 3개의 클라이언트 연결, 전체 동시 수신, 연결 해제·재연결 후 수신, Health Check와 CORS 헤더를 확인합니다. 종료 시 서버와 연결을 정리합니다. `socket.io-client`는 테스트용 개발 의존성입니다.

기존 기본 연결 테스트의 네 연결은 공개 이벤트를 받는 익명 연결입니다. 별도 PostgreSQL 통합 테스트는 세션 쿠키 인증, 동일 사용자의 다중 탭, 마지막 탭 해제, 같은 사용자 재연결, 로그아웃·초기화 연결 종료를 검증합니다. 테스트는 Node.js 클라이언트로 수행하며 실제 브라우저 UI와 대규모 부하는 최종 통합 QA에서 확인합니다.

`CLIENT_URL`은 브라우저 origin 설정이며 네트워크 접근 제한이 아닙니다. 현재 서버를 인터넷에 공개하거나 실제 참가자 운영에 사용하지 않습니다.

실제 브라우저의 관리자 버튼과 사용자 화면은 아직 연결하지 않았습니다. 재헌의 Frontend 작업에서 위 규약에 맞춰 연동합니다. 기존 기획·협업 문서는 원문을 유지합니다.

## QA 2단계 브라우저 연결 경로

Socket.IO 연결은 `io(apiBaseUrl, { path: '/api/socket.io', withCredentials: true })`를 사용한다.
세션 쿠키가 `Path=/api`이므로 기본 `/socket.io` 경로에는 브라우저가 쿠키를 보내지 않는다.
서버와 클라이언트를 함께 업데이트하고 `/api/socket.io` 경로를 WebSocket upgrade가 가능한 프록시로 연결한다. Vite 개발 프록시에 반영되어 있다.

# Socket.IO 연결 규약

담당: 지석 / 협업 가이드 작업 번호 2 / 브랜치 `feat/socket`.

실제 GitHub 추적: [Issue #3](https://github.com/hkg109/infosys-investking/issues/3), [PR #2](https://github.com/hkg109/infosys-investking/pull/2). 가이드 작업 번호와 GitHub 번호는 동일하지 않습니다.

## 연결

기본 서버 주소는 `http://localhost:3000`, Socket.IO 기본 경로는 `/socket.io`입니다. `CLIENT_URL`은 브라우저 프론트엔드 origin이며 기본값은 `http://localhost:5173`입니다. 서버는 HTTP long-polling과 WebSocket을 지원합니다.

연결 및 해제 시 서버 콘솔에 socket ID와 해제 사유를 기록합니다. socket ID는 일시적인 연결 식별자이며 사용자 계정 ID가 아닙니다.

## 1단계 테스트 이벤트 이력

| 방향 | 이벤트 | Payload | 동작 |
|---|---|---|---|
| Client → Server | `game:start` | 없음 | 1단계 연결 테스트 요청(3단계에서 제거) |
| Server → 전체 Client | `game:start` | 없음 | 1단계에서는 요청자 포함 전체 전달 |

3단계부터 클라이언트가 보낸 제어 이벤트는 처리하지 않습니다. 게임 제어는 인증된 관리자 HTTP API만 사용하며 서버가 실제 상태를 변경한 뒤 Socket 이벤트를 전달합니다. 최신 규약은 [GAME_STATE_API.md](GAME_STATE_API.md)를 참조합니다.

연결이 끊긴 동안 개별 이벤트는 저장·재전송하지 않지만, 재연결 직후 `game:state`로 현재 상태를 받습니다. 3단계 게임 상태는 아직 메모리 기반이며 DB 저장은 후속 단계입니다.

## 검증

```bash
cd server
npm install
npm test
```

테스트가 임시 포트에 서버를 실행하고 관리자 역할 1개와 사용자 역할 3개의 클라이언트 연결, 전체 동시 수신, 연결 해제·재연결 후 수신, Health Check와 CORS 헤더를 확인합니다. 종료 시 서버와 연결을 정리합니다. `socket.io-client`는 테스트용 개발 의존성입니다.

여기서 관리자·사용자는 테스트 시나리오상의 이름뿐이며 네 연결은 모두 같은 권한입니다. 테스트는 Node.js 클라이언트로 수행합니다. 실제 브라우저의 CORS 차단 동작, UI 상호작용, 관리자 인증, 대규모 부하, 자동 재연결·상태 복구까지 검증한 것은 아닙니다. 재연결 테스트는 명시적인 `disconnect()`와 `connect()` 호출입니다.

`CLIENT_URL`은 브라우저 origin 설정이며 네트워크 접근 제한이 아닙니다. 현재 서버를 인터넷에 공개하거나 실제 참가자 운영에 사용하지 않습니다.

실제 브라우저의 관리자 버튼과 사용자 화면은 아직 연결하지 않았습니다. 재헌의 Frontend 작업에서 위 규약에 맞춰 연동합니다. 기존 기획·협업 문서는 원문을 유지합니다.

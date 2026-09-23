# QA 14단계 Frontend — Hallmark 디자인 시스템 검수

## 목표

F-31, D-05 범위로 참가자·관리자·중계 화면을 하나의 Cobalt 디자인 시스템으로
정리했다. 기능과 API 계약은 바꾸지 않고 정보 위계, 상태 가독성, 반응형 동작을
개선한다.

| 화면 | Hallmark 방향 | 적용 내용 |
|---|---|---|
| 참가자 | playful + technical | 시세·총자산·주문을 빠르게 훑는 Workbench, 점수판형 숫자, 절제한 cobalt 강조 |
| 관리자 | utilitarian + technical | 라우트 작업 rail, 상태·위험·비활성 원인을 텍스트와 색으로 함께 구분 |
| 중계 | editorial + playful | 남은 시간과 상태를 우선하는 Stat-Led 헤더, 뉴스 데스크형 규칙과 어두운 교실용 대비 |
| 홈 | Split Studio | 왼쪽 규칙·설명, 오른쪽 참가·복구 폼으로 첫 행동을 분리 |

## 디자인 시스템

- 원본 토큰: client/tokens.css
- 적용 스타일: client/src/styles/hallmark.css, client/src/broadcast/broadcast-hallmark.css
- 휴대 가능한 토큰 내보내기와 구조 결정: design.md
- 표시 서체: 번들된 Space Grotesk
- 본문 한글: 운영체제의 Pretendard/Noto Sans KR 계열 fallback
- 데이터 숫자: 번들된 JetBrains Mono
- 색상·간격·radius·motion은 named token만 사용한다.
- 기존 스타일은 삭제하지 않고 뒤쪽 Hallmark 레이어에서 덮어써 회귀 위험과 되돌리기 비용을 낮췄다.

## 반응형·접근성 확인

- 320px, 375px, 414px, 768px에서 scrollWidth <= innerWidth 확인
- 네 폭 모두 버튼·탭·링크의 두 줄 줄바꿈 없음
- html, body에 overflow-x: clip 적용
- 긴 제목은 overflow-wrap: anywhere와 min-width: 0 적용
- 터치 조작은 44px 이상, coarse pointer는 48px 이상
- 키보드 포커스는 즉시 표시하고 색만으로 상태를 전달하지 않음
- prefers-reduced-motion에서는 공간 이동을 사실상 제거
- 중계 연결 오류 배너는 절대 배치를 제거해 헤더와 겹치지 않음

## 검증 명령

    npm --prefix client test
    npm --prefix client run build

- 자동 테스트: 78개 통과
- Vite production build: 통과
- Hallmark slop test: 58개 gate 검토 후 열린 gate 없음

## 행사 전 최종 수동 확인

- [ ] 실제 참가자 계정으로 게임 6개 화면의 정보 우선순위 확인
- [ ] 실제 관리자 계정으로 7개 화면과 위험 Drawer의 대비·포커스 확인
- [ ] 강의실 빔프로젝터에서 중계 화면의 시계·상승/하락·속보 가독성 확인
- [ ] iPhone Safari와 Android Chrome에서 키보드가 열린 참가 폼·주문 Sheet 확인
- [ ] 색각 보정/고대비 모드에서 상승·하락과 오류가 텍스트로도 구분되는지 확인

실제 행사 장비와 실제 계정을 사용하는 전체 회귀는 QA 15단계 F-32에서 완료한다.

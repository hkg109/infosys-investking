# 주식 종목 관리 API

QA 3단계 Backend는 관리자가 게임 시작 전에 종목을 생성·조회·수정·비활성화할 수 있는 API를 제공한다. 과거 거래, 보유량과 사건이 참조하는 종목은 물리 삭제하지 않는다.

모든 관리자 요청에는 다음 헤더가 필요하다.

```http
Authorization: Bearer <ADMIN_PASSWORD>
```

## 종목 목록

```http
GET /api/companies/admin
```

목록 조회는 게임 상태와 관계없이 가능하며 활성·비활성 종목을 모두 반환한다.

```json
{
  "companies": [
    {
      "companyId": "A",
      "name": "A 엔터",
      "description": "엔터테인먼트 기업",
      "initialPrice": 10000,
      "currentPrice": 10000,
      "isActive": true,
      "references": {
        "transactions": 3,
        "holdings": 1,
        "eventEffects": 2
      },
      "createdAt": "2026-09-16T10:00:00.000Z",
      "updatedAt": "2026-09-16T10:00:00.000Z"
    }
  ]
}
```

`references`는 비활성화 경고와 과거 기록 보존 여부를 안내하기 위한 현재 참조 건수다.

## 종목 생성

```http
POST /api/companies/admin
Content-Type: application/json
```

```json
{
  "companyId": "H",
  "name": "H 로보틱스",
  "description": "로봇 기술 기업",
  "initialPrice": 15000,
  "isActive": true
}
```

- `companyId`: 영문 대문자·숫자로 시작하는 최대 20자의 코드. 영문 소문자는 대문자로 정규화하며 `_`, `-`를 사용할 수 있다.
- `name`: 공백 제거 후 1~60자.
- `description`: 최대 2,000자이며 빈 문자열을 허용한다.
- `initialPrice`: 1 이상의 안전한 정수.
- `isActive`: 생략하면 `true`.

성공 시 `201`과 생성된 `company`를 반환한다. 현재 가격은 초기 가격과 같은 값으로 생성된다.

## 종목 수정·재활성화

```http
PUT /api/companies/admin/:companyId
Content-Type: application/json
```

```json
{
  "name": "H 모빌리티",
  "description": "수정된 기업 설명",
  "initialPrice": 20000,
  "isActive": true
}
```

`PUT`은 전체 수정 요청이므로 네 필드를 모두 전달한다. 초기 가격을 변경하면 다음 게임을 위해 현재 가격도 같은 값으로 맞춘다. 비활성 종목을 다시 사용하려면 `isActive: true`로 수정한다. 종목 코드는 참조 무결성을 위해 변경할 수 없다.

## 종목 비활성화

```http
DELETE /api/companies/admin/:companyId
```

성공 시 `204`를 반환한다. 실제 행을 삭제하지 않고 `is_active=false`로 변경하므로 다음 정보는 유지된다.

- 과거 거래의 종목 코드와 체결 가격
- 기존 보유량과 평가 기록
- 과거 사건의 기업별 효과
- 종목 이름·설명·가격 정보

비활성 종목은 다음 대상에서 제외된다.

- `GET /api/trading/market` 공개 시장 목록
- 새로운 주문 준비와 체결
- 새로운 사건 생성·수정의 영향 종목
- 새 게임의 무작위 사건 배정

비활성화 전에 Frontend는 `references`를 확인해 참조 중인 기록이 있음을 관리자에게 경고한다.

## 변경 가능 상태

생성·수정·비활성화는 게임 상태가 `WAITING`일 때만 가능하다. `RUNNING`, `PAUSED`, `FINISHED`에서는 `409 COMPANY_MANAGEMENT_CLOSED`를 반환한다. 목록 조회는 계속 가능하다.

## 오류 코드

| HTTP | 오류 | 조건 |
|---:|---|---|
| 400 | `INVALID_COMPANY` | 코드·이름·설명·가격·활성 상태가 유효하지 않음 |
| 401 | `ADMIN_AUTH_REQUIRED` | 관리자 인증 실패 |
| 403 | `ORIGIN_NOT_ALLOWED` | 허용하지 않은 브라우저 Origin |
| 404 | `COMPANY_NOT_FOUND` | 종목을 찾을 수 없음 |
| 409 | `COMPANY_ID_TAKEN` | 이미 사용하는 종목 코드 |
| 409 | `COMPANY_INACTIVE` | 비활성 종목으로 신규 주문·사건을 생성하려고 함 |
| 409 | `COMPANY_MANAGEMENT_CLOSED` | 게임이 대기 상태가 아님 |
| 503 | `ADMIN_AUTH_UNAVAILABLE` | 관리자 비밀번호 미설정 |
| 503 | `DATABASE_UNAVAILABLE` | PostgreSQL 미설정 |

모든 응답은 `Cache-Control: no-store`를 적용하며 브라우저 요청은 `CLIENT_URL`과 일치하는 Origin만 허용한다.

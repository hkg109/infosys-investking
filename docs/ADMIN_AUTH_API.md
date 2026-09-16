# 관리자 인증 API

관리자 화면과 관리자 전용 API는 루트 `.env`의 `ADMIN_PASSWORD`를 Bearer 토큰으로 검증한다. 비밀번호는 DB, URL, 로그, 브라우저 영구 저장소에 저장하지 않는다.

## 비밀번호 검증

```http
POST /api/admin/auth/verify
Authorization: Bearer <ADMIN_PASSWORD>
```

성공 응답:

```json
{
  "authenticated": true
}
```

비밀번호가 없거나 올바르지 않으면 `401`을 반환한다.

```json
{
  "error": "ADMIN_AUTH_REQUIRED"
}
```

서버에 `ADMIN_PASSWORD`가 설정되지 않은 경우 `503`을 반환한다.

```json
{
  "error": "ADMIN_AUTH_UNAVAILABLE"
}
```

## 공통 정책

- 게임 제어, 사건 관리, 관리자 순위 API도 같은 Bearer 인증 미들웨어를 사용한다.
- 응답에는 `Cache-Control: no-store`를 적용한다.
- 브라우저 요청은 `CLIENT_URL`과 일치하는 Origin만 허용한다.
- Frontend는 관리자 페이지를 닫거나 새로고침하면 비밀번호를 폐기하고 필요할 때 다시 입력받는다.

# freelang-stdlib-supertest

FreeLang v2 표준 라이브러리 — `supertest.fl`

npm `supertest` 완전 대체. 실제 서버 없이 **인메모리 디스패치**로 HTTP 통합 테스트.

## 파일

| 파일 | 설명 |
|------|------|
| `stdlib/supertest.fl` | FreeLang 구현 |
| `src/stdlib-supertest.ts` | 네이티브 함수 4종 |

## 사용 예시

```freelang
import "stdlib/supertest"
import "stdlib/test.fl"

describe("GET /users", fn() {
  it("200 응답", fn() {
    let res = request(app).get("/users")
      .set("Authorization", "Bearer token")
      .expect(200)
      .run()
    expect(res.status).toBe(200)
  })

  it("POST + JSON 바디", fn() {
    request(app)
      .post("/login")
      .send({ username: "admin", password: "1234" })
      .expect(200)
      .expect("Content-Type", "application/json")
      .end(fn(res) {
        expect(res.body.token).toBeTruthy()
      })
  })
})

runTests()
```

## 작업지시서 #17

/**
 * FreeLang v2 - stdlib-supertest: HTTP 통합 테스트 네이티브 함수
 *
 * npm supertest 완전 대체 구현
 * 인메모리 요청 검증 / JSON 파싱 / 쿼리스트링 생성
 *
 * 네이티브 함수 목록:
 *   supertest_verify_expectations(response, expectations) → { passed, failures }
 *   supertest_parse_json(text)                            → any
 *   supertest_build_query_string(paramsJson)              → string
 *   supertest_json_stringify(value)                       → string
 */

import { NativeFunctionRegistry } from './vm/native-function-registry';

export function registerSupertestFunctions(registry: NativeFunctionRegistry): void {

  // ─────────────────────────────────────────────────────────────────────────
  // supertest_verify_expectations
  //
  // 테스트 응답에 대해 expectations 배열을 검증
  //
  // Args:
  //   args[0]: SupertestResponse 객체 { status, headers, body, text }
  //   args[1]: SupertestExpectation[] [{ type, key, value }, ...]
  //
  // Returns:
  //   { passed: bool, failures: string[] }
  //
  // expectation type:
  //   "status"    → response.status === value
  //   "header"    → response.headers[key] contains value (부분 일치)
  //   "body"      → response.text contains value (부분 일치)
  //   "bodyExact" → JSON.stringify(response.body) 내 key/value 검사
  // ─────────────────────────────────────────────────────────────────────────
  registry.register({
    name: 'supertest_verify_expectations',
    module: 'supertest',
    executor: (args) => {
      const response = args[0] as {
        status: number;
        headers: Record<string, string>;
        body: any;
        text: string;
      };
      const expectations = (args[1] as any[]) || [];

      const failures: string[] = [];

      for (const exp of expectations) {
        const type  = String(exp.type  ?? '');
        const key   = String(exp.key   ?? '');
        const value = exp.value;

        switch (type) {

          // ── 상태코드 검증 ────────────────────────────────────────────────
          case 'status': {
            const expected = Number(value);
            if (response.status !== expected) {
              failures.push(
                `상태코드 불일치: expected=${expected}, received=${response.status}`
              );
            }
            break;
          }

          // ── 헤더 검증 (부분 일치) ────────────────────────────────────────
          case 'header': {
            const headers = response.headers || {};
            const headerKey = key.toLowerCase();
            const actual = String(headers[headerKey] ?? '');
            const expectedVal = String(value ?? '');

            if (!actual.includes(expectedVal)) {
              failures.push(
                `헤더 불일치: ${key}: expected="${expectedVal}", received="${actual}"`
              );
            }
            break;
          }

          // ── 바디 텍스트 포함 검증 ────────────────────────────────────────
          case 'body': {
            const bodyText = String(response.text ?? response.body ?? '');
            const expectedText = String(value ?? '');

            if (!bodyText.includes(expectedText)) {
              failures.push(
                `바디 포함 검증 실패: "${expectedText}" 없음\n  실제 바디: ${bodyText.slice(0, 200)}`
              );
            }
            break;
          }

          // ── 바디 JSON 검증 (부분 key-value 일치) ─────────────────────────
          case 'bodyExact': {
            const body = response.body;
            const expected = value;

            if (typeof expected === 'object' && expected !== null) {
              // 각 키-값 쌍을 실제 응답 바디에서 확인
              for (const [k, v] of Object.entries(expected)) {
                const actualVal = typeof body === 'object' && body !== null
                  ? body[k]
                  : undefined;

                const expectedStr = JSON.stringify(v);
                const actualStr   = JSON.stringify(actualVal);

                if (expectedStr !== actualStr) {
                  failures.push(
                    `바디 JSON 불일치: body.${k} expected=${expectedStr}, received=${actualStr}`
                  );
                }
              }
            } else {
              // 스칼라 비교
              const bodyStr    = String(response.text ?? '');
              const expectedStr = String(expected ?? '');
              if (bodyStr !== expectedStr) {
                failures.push(
                  `바디 전체 불일치: expected="${expectedStr}", received="${bodyStr.slice(0, 200)}"`
                );
              }
            }
            break;
          }

          default:
            // 알 수 없는 타입 무시
            break;
        }
      }

      return {
        passed:   failures.length === 0,
        failures
      };
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // supertest_parse_json
  //
  // JSON 문자열을 파싱하여 FreeLang 값으로 반환.
  // 파싱 실패 시 원본 문자열 반환.
  //
  // Args:
  //   args[0]: JSON 문자열
  //
  // Returns: 파싱된 값 (object, array, string 등)
  // ─────────────────────────────────────────────────────────────────────────
  registry.register({
    name: 'supertest_parse_json',
    module: 'supertest',
    executor: (args) => {
      const text = String(args[0] ?? '');
      if (!text.trim()) return null;
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // supertest_build_query_string
  //
  // map 객체를 URL 쿼리스트링으로 변환
  // 예) { q: "search", page: "2" } → "q=search&page=2"
  // 빈 map 또는 null → ""
  //
  // Args:
  //   args[0]: 파라미터 map
  //
  // Returns: URL 인코딩된 쿼리스트링 (? 없이)
  // ─────────────────────────────────────────────────────────────────────────
  registry.register({
    name: 'supertest_build_query_string',
    module: 'supertest',
    executor: (args) => {
      const params = args[0];

      if (!params || typeof params !== 'object' || Array.isArray(params)) {
        return '';
      }

      const parts: string[] = [];
      for (const [key, val] of Object.entries(params)) {
        if (val === null || val === undefined) continue;

        // 배열 값: key=v1&key=v2
        if (Array.isArray(val)) {
          for (const v of val) {
            parts.push(
              encodeURIComponent(key) + '=' + encodeURIComponent(String(v))
            );
          }
        } else {
          parts.push(
            encodeURIComponent(key) + '=' + encodeURIComponent(String(val))
          );
        }
      }

      return parts.join('&');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // supertest_json_stringify
  //
  // FreeLang 값을 JSON 문자열로 직렬화
  // 순환참조 시 안전하게 처리
  //
  // Args:
  //   args[0]: 직렬화할 값
  //
  // Returns: JSON 문자열
  // ─────────────────────────────────────────────────────────────────────────
  registry.register({
    name: 'supertest_json_stringify',
    module: 'supertest',
    executor: (args) => {
      const value = args[0];

      if (value === null || value === undefined) return 'null';
      if (typeof value === 'string') return value;

      try {
        // 순환참조 방어: 직렬화 시 함수 필드 제거
        return JSON.stringify(value, (_, v) => {
          if (typeof v === 'function') return undefined;
          return v;
        });
      } catch {
        return String(value);
      }
    }
  });

}

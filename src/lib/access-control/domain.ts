// 사이트 주소 정리 — 직원·학생이 입력한 문자열을 차단 규칙에 쓸 도메인으로 바꾼다.

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * "https://www.EBSi.co.kr/path?x=1", "*.ebsi.co.kr", "ebsi.co.kr:443" → "ebsi.co.kr".
 * 한글 도메인은 퓨니코드로 바뀐다. 도메인으로 볼 수 없으면 null.
 * 맨 앞 "www." 는 뗀다 — 규칙은 하위 도메인까지 함께 막으므로 www 유무가 결과를 바꾸지 않는다.
 */
export function normalizeDomain(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let raw = input.trim().toLowerCase();
  if (!raw || raw.length > 300 || /\s/.test(raw)) return null;
  raw = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/^\*\./, "");

  let host: string;
  try {
    host = new URL(`http://${raw}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/\.$/, "").replace(/^www\./, "");
  if (!host || host.length > 253) return null;
  // IP 주소는 DNS 로 막을 수 없다
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return null;

  const labels = host.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return null;
  // 최상위 도메인은 글자로 시작 (퓨니코드 xn-- 포함)
  if (!/^[a-z]/.test(labels[labels.length - 1])) return null;
  return host;
}

/** a 가 b 와 같거나 b 의 하위 도메인인가 ("m.comic.naver.com" ⊂ "naver.com") */
export function isSameOrSubdomain(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`);
}

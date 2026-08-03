/** 숫자만 남긴다 (하이픈·공백 제거). */
export function phoneDigits(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** 한국 휴대폰(01x, 10~11자리) 숫자열만 반환. 형식이 아니면 null. */
export function normalizeMobile(raw: string | null | undefined): string | null {
  const d = phoneDigits(raw);
  return /^01[0-9]\d{7,8}$/.test(d) ? d : null;
}

/** 저장 형식(하이픈 유무)에 상관없이 두 번호가 같은지. 빈 값은 항상 불일치. */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = phoneDigits(a);
  return da.length > 0 && da === phoneDigits(b);
}

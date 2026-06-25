// Octomo MO(Mobile Originated) 본인인증.
// Solapi(서버→유저 발송)와 반대: 유저가 인증코드를 옥토모 대표번호로 "보내면" 서버가 수신 여부를 조회해 검증.
// 발신번호 등록 불필요. API Key는 서버에서만 사용. env(OCTOMO_API_KEY) 미설정 시 dev 우회.

const API_BASE = process.env.OCTOMO_API_BASE ?? "https://api.octoverse.kr";

// 옥토모 공용 대표번호 — 유저가 인증 문자를 보내는 수신처(계정별 발급 아님, 고정).
export const OCTOMO_RECEIVER = "1666-3538";

/** 유저가 보낸 인증 문자 수신 여부 조회. true = 본인 명의폰에서 코드 발송 확인됨. */
export async function checkMessageExists(
  mobileNum: string,
  text: string,
  withinMinutes = 5
): Promise<boolean> {
  const key = process.env.OCTOMO_API_KEY;
  if (!key) {
    // 프로덕션에선 fail-closed — 키 없으면 인증 우회 금지(보안). dev에서만 우회.
    if (process.env.NODE_ENV === "production") {
      throw new Error("OCTOMO_API_KEY가 설정되지 않았습니다");
    }
    console.log(
      `[octomo:dev] OCTOMO_API_KEY 미설정 — 수신확인 우회(true 반환). mobileNum=${mobileNum} text=${text}`
    );
    return true;
  }

  const res = await fetch(`${API_BASE}/octomo/v1/public/message/exists`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Octomo ${key}` },
    body: JSON.stringify({ mobileNum: mobileNum.replace(/\D/g, ""), text, withinMinutes }),
  });

  if (!res.ok) {
    console.error("[octomo] exists 실패", res.status, await res.text().catch(() => ""));
    throw new Error("인증 확인에 실패했습니다");
  }
  const data = (await res.json()) as { exists?: boolean };
  return data.exists === true;
}

/**
 * 인증코드를 담은 SMS QR 발급(data URL). 스캔 시 수신번호·본문이 채워진 채 문자앱이 열림.
 * 옥토모가 SMSTO:{수신번호}:{text} 딥링크를 만들어 PNG로 변환. 실패/키없음 시 null(흐름 미차단).
 */
export async function createSmsQrCode(text: string): Promise<string | null> {
  const key = process.env.OCTOMO_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch(`${API_BASE}/octomo/v1/public/message/qr-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Octomo ${key}` },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      console.error("[octomo] qr-code 실패", res.status);
      return null;
    }
    const data = (await res.json()) as { qrCode?: string };
    return data.qrCode ?? null;
  } catch {
    return null;
  }
}

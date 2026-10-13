import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tuition/core", () => ({ handleProviderWebhook: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";

import { POST } from "@/app/api/webhooks/payssam/route";
import { handleProviderWebhook } from "@/lib/tuition/core";

const TOKEN = "test-callback-token";
const API_KEY = "partner-api-key";
const BILL_ID = "u1a2b3c4d5e6f7g8h9i0";

/** 결제선생이 정한 정상 수신 응답 — 이 형태가 아니면 연동 검수를 통과하지 못한다 */
const ACCEPTED = { code: "0000", msg: "성공하였습니다." };

// 실제 콜백에는 카드번호 일부·승인 정보가 함께 온다 — billId 말고는 읽지도 넘기지도 않아야 한다
const approval = (patch: Record<string, unknown> = {}) => ({
  apiKey: API_KEY,
  billId: BILL_ID,
  apprState: "F",
  apprPrice: "1",
  apprIssuerNum: "4321-****-****-1234",
  apprNum: "30000001",
  ...patch,
});

function send(body: unknown, query = `?k=${TOKEN}`) {
  return POST(
    new NextRequest(`https://app.example.com/api/webhooks/payssam${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("PAYSSAM_CALLBACK_TOKEN", TOKEN);
  vi.stubEnv("PAYSSAM_API_KEY", API_KEY);
  vi.mocked(handleProviderWebhook).mockResolvedValue({ outcome: "PAID" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/webhooks/payssam", () => {
  it("운영에서 토큰이 설정되지 않았으면 아무 것도 받지 않는다", async () => {
    for (const value of ["", "   "]) {
      vi.stubEnv("PAYSSAM_CALLBACK_TOKEN", value);
      const res = await send(approval(), "");
      expect(res.status).toBe(503);
      expect((await res.json()).code).not.toBe("0000");
    }
    expect(handleProviderWebhook).not.toHaveBeenCalled();
  });

  it("토큰이 없거나 틀리면 거절한다", async () => {
    for (const query of ["", "?k=", "?k=wrong", `?k=${TOKEN}x`, `?token=${TOKEN}`]) {
      const res = await send(approval(), query);
      expect(res.status).toBe(401);
      expect((await res.json()).code).not.toBe("0000");
    }
    expect(handleProviderWebhook).not.toHaveBeenCalled();
  });

  it("본문의 apiKey 가 우리 키와 다르면 거절한다 (v1 표기 apikey 도 읽는다)", async () => {
    for (const body of [approval({ apiKey: "someone-else" }), approval({ apiKey: undefined }), approval({ apiKey: 123 })]) {
      const res = await send(body);
      expect(res.status).toBe(401);
    }
    expect(handleProviderWebhook).not.toHaveBeenCalled();

    const v1 = await send({ apikey: API_KEY, bill_id: BILL_ID, appr_state: "F" });
    expect(await v1.json()).toEqual(ACCEPTED);
    expect(handleProviderWebhook).toHaveBeenCalledWith(BILL_ID);
  });

  it("billId 만 코어에 넘기고, 결제선생이 정한 형식으로 정상 수신을 답한다", async () => {
    const res = await send(approval());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(ACCEPTED);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(handleProviderWebhook).toHaveBeenCalledTimes(1);
    expect(handleProviderWebhook).toHaveBeenCalledWith(BILL_ID);
    expect(revalidatePath).toHaveBeenCalledWith("/tuition");
  });

  it("화면에 보일 변화가 없으면 목록을 다시 그리지 않는다", async () => {
    for (const outcome of ["NOOP", "UNMATCHED", "IGNORED"] as const) {
      vi.mocked(handleProviderWebhook).mockResolvedValue({ outcome });
      expect(await (await send(approval())).json()).toEqual(ACCEPTED);
    }
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("우리 청구서로 볼 수 없는 billId 는 조회하지 않고 정상 수신으로 끝낸다 (다시 받아도 달라질 게 없다)", async () => {
    for (const billId of [undefined, null, 12345, "", "a".repeat(21), "../../etc", "bill id"]) {
      const res = await send(approval({ billId }));
      expect(await res.json()).toEqual(ACCEPTED);
    }
    expect(handleProviderWebhook).not.toHaveBeenCalled();
  });

  it("읽을 수 없는 본문은 실패로 답한다", async () => {
    for (const body of ["not json", "[]", "null", JSON.stringify("x".repeat(70_000))]) {
      const res = await send(body);
      expect(res.status).toBe(400);
      expect((await res.json()).code).not.toBe("0000");
    }
    expect(handleProviderWebhook).not.toHaveBeenCalled();
  });

  it("반영에 실패하면 실패로 답해 결제선생이 다시 보내게 한다 — 오류 원문은 내보내지 않는다", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(handleProviderWebhook).mockRejectedValue(new Error("connection reset by peer"));
    const res = await send(approval());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).not.toBe("0000");
    expect(JSON.stringify(body)).not.toContain("connection reset");
    logged.mockRestore();
  });

  it("개발에서는 토큰·키 없이도 받는다 (모의 결제선생)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PAYSSAM_CALLBACK_TOKEN", "");
    vi.stubEnv("PAYSSAM_API_KEY", "");
    const res = await send(approval({ apiKey: "mock-api-key" }), "");
    expect(await res.json()).toEqual(ACCEPTED);
    expect(handleProviderWebhook).toHaveBeenCalledWith(BILL_ID);
  });
});

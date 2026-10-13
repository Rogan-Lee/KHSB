import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tuition/core", () => ({ handleProviderWebhook: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";

import { POST } from "@/app/api/webhooks/toss/route";
import { handleProviderWebhook } from "@/lib/tuition/core";

const TOKEN = "test-webhook-token";

const ORDER_KEY = "order_ABC-123";

// 기본값 인자를 쓰지 않는다 — orderKey 가 undefined(누락)인 본문도 만들어야 한다
const orderEventWith = (orderKey: unknown) => ({
  eventType: "ORDER_PAYMENT_STATUS_CHANGED",
  // 실제 웹훅에는 구매자 정보가 함께 온다 — 읽지도 넘기지도 않아야 한다
  data: { orderKey, status: "DONE", totalAmount: 1, customerName: "구매자", customerPhone: "00000000000" },
});

const orderEvent = () => orderEventWith(ORDER_KEY);

function send(body: unknown, query = `?k=${TOKEN}`) {
  return POST(
    new NextRequest(`https://app.example.com/api/webhooks/toss${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("TOSS_WEBHOOK_TOKEN", TOKEN);
  vi.mocked(handleProviderWebhook).mockResolvedValue({ outcome: "PAID" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/webhooks/toss", () => {
  it("refuses everything in production while the token is not configured", async () => {
    for (const value of ["", "   "]) {
      vi.stubEnv("TOSS_WEBHOOK_TOKEN", value);

      const res = await send(orderEvent(), "");
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: expect.any(String) });
    }
    expect(handleProviderWebhook).not.toHaveBeenCalled();
  });

  it("rejects a missing or wrong token", async () => {
    for (const query of ["", "?k=", "?k=wrong", `?k=${TOKEN}x`, `?token=${TOKEN}`]) {
      const res = await send(orderEvent(), query);
      expect(res.status).toBe(401);
    }
    expect(handleProviderWebhook).not.toHaveBeenCalled();
  });

  it("checks the token outside production too when one is configured", async () => {
    vi.stubEnv("NODE_ENV", "development");

    expect((await send(orderEvent(), "?k=wrong")).status).toBe(401);
    expect((await send(orderEvent())).status).toBe(200);
  });

  it("accepts tokenless calls outside production (local mock pay page)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TOSS_WEBHOOK_TOKEN", "");

    const res = await send(orderEvent(), "");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, outcome: "PAID" });
  });

  it("acknowledges other event types without processing", async () => {
    for (const eventType of ["PAYMENT_STATUS_CHANGED", "DEPOSIT_CALLBACK", "", undefined, 3]) {
      const res = await send({ ...orderEvent(), eventType });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, ignored: true });
    }
    expect(handleProviderWebhook).not.toHaveBeenCalled();
  });

  it("acknowledges malformed bodies without processing", async () => {
    const bodies = [
      "",
      "not json",
      "null",
      "[]",
      '"text"',
      JSON.stringify({ eventType: "ORDER_PAYMENT_STATUS_CHANGED" }),
      JSON.stringify({ eventType: "ORDER_PAYMENT_STATUS_CHANGED", data: "order_1" }),
      "x".repeat(70_000),
    ];
    for (const body of bodies) {
      const res = await send(body);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, ignored: true });
    }
    expect(handleProviderWebhook).not.toHaveBeenCalled();
  });

  it("acknowledges a missing or odd orderKey without processing", async () => {
    const keys = [undefined, null, "", 12345, ["order_1"], "order 1", "order/../1", "주문", "a".repeat(201)];
    for (const key of keys) {
      const res = await send(orderEventWith(key));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, ignored: true });
    }
    expect(handleProviderWebhook).not.toHaveBeenCalled();
  });

  it("hands only the orderKey to the core and returns its outcome", async () => {
    const res = await send(orderEvent());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, outcome: "PAID" });
    expect(handleProviderWebhook).toHaveBeenCalledTimes(1);
    expect(vi.mocked(handleProviderWebhook).mock.calls[0]).toEqual([ORDER_KEY]);
    expect(revalidatePath).toHaveBeenCalledWith("/tuition");
  });

  it("answers 200 for outcomes that changed nothing", async () => {
    for (const outcome of ["NOOP", "UNMATCHED", "IGNORED"] as const) {
      vi.mocked(handleProviderWebhook).mockResolvedValue({ outcome });

      const res = await send(orderEvent());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, outcome });
    }
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("answers 500 when the core throws so the provider retries, logging the message only", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(handleProviderWebhook).mockRejectedValue(new Error("provider timeout"));

    const res = await send(orderEvent());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: expect.any(String) });
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith("[tuition:webhook]", "provider timeout");
    logged.mockRestore();
  });
});

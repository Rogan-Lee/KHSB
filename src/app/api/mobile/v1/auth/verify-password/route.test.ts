import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-server", () => ({
  authServer: { api: { getSession: vi.fn(), verifyPassword: vi.fn() } },
}));
vi.mock("@/lib/login-guard", () => ({
  clientIpFrom: vi.fn(() => "1.2.3.4"),
  completeLoginAttempt: vi.fn(),
  LOGIN_LOCKED_MESSAGE: "locked",
  reserveLoginAttempt: vi.fn(),
}));

import { authServer } from "@/lib/auth-server";
import { completeLoginAttempt, reserveLoginAttempt } from "@/lib/login-guard";

import { POST } from "./route";

const api = vi.mocked(authServer.api);
const post = (body: unknown) =>
  POST(new Request("http://t/api/mobile/v1/auth/verify-password", { method: "POST", body: JSON.stringify(body) }) as never);

describe("POST /api/mobile/v1/auth/verify-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getSession.mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(reserveLoginAttempt).mockResolvedValue({ locked: false, attemptId: "a1" });
  });

  it("세션이 없으면 401", async () => {
    api.getSession.mockResolvedValue(null as never);
    expect((await post({ password: "x" })).status).toBe(401);
    expect(api.verifyPassword).not.toHaveBeenCalled();
  });

  it("비밀번호가 비면 400 — 시도로 세지 않는다", async () => {
    expect((await post({})).status).toBe(400);
    expect(reserveLoginAttempt).not.toHaveBeenCalled();
  });

  it("실패가 쌓여 잠겼으면 확인하지 않고 429", async () => {
    vi.mocked(reserveLoginAttempt).mockResolvedValue({ locked: true });
    expect((await post({ password: "x" })).status).toBe(429);
    expect(api.verifyPassword).not.toHaveBeenCalled();
  });

  it("틀리면 400, 실패로 남긴다", async () => {
    api.verifyPassword.mockRejectedValue(new Error("INVALID_PASSWORD"));
    expect((await post({ password: "x" })).status).toBe(400);
    expect(completeLoginAttempt).toHaveBeenCalledWith("verify-password:u1", false);
  });

  it("맞으면 200, 계정 단위 키로 기록을 지운다", async () => {
    api.verifyPassword.mockResolvedValue({ status: true } as never);
    const res = await post({ password: "right" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(api.verifyPassword).toHaveBeenCalledWith(expect.objectContaining({ body: { password: "right" } }));
    expect(completeLoginAttempt).toHaveBeenCalledWith("verify-password:u1", true);
  });
});

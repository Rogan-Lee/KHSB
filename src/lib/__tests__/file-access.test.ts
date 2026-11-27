import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/blob", () => ({ del: vi.fn(), get: vi.fn(), put: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthIdentity: vi.fn() }));
vi.mock("@/lib/student-auth", () => ({ validateMagicLink: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    parentLink: { findMany: vi.fn() },
    portalChat: { findUnique: vi.fn() },
    performanceTask: { findUnique: vi.fn() },
    taskSubmission: { findUnique: vi.fn() },
    mentoring: { findUnique: vi.fn() },
    mentoringSession: { findUnique: vi.fn() },
    assignment: { findUnique: vi.fn() },
    photo: { findFirst: vi.fn() },
    questionMessage: { findFirst: vi.fn() },
  },
}));

import { get } from "@vercel/blob";

import { GET } from "@/app/api/files/[...path]/route";
import { getAuthIdentity } from "@/lib/auth";
import { fileUrlForPathname, signFileUrl } from "@/lib/blob-store";
import { canReadFile, parseFileOwner, PORTAL_FILE_COOKIE } from "@/lib/file-access";
import { prisma } from "@/lib/prisma";
import { validateMagicLink } from "@/lib/student-auth";

describe("parseFileOwner", () => {
  it("업로드 경로 규칙으로 어느 학생 것인지 찾을 단서를 낸다", () => {
    expect(parseFileOwner("family-chat/stu-1/uuid-a.jpg")).toEqual({ kind: "student", id: "stu-1" });
    expect(parseFileOwner("portal-chat/chat-1/uuid-a.jpg")).toEqual({ kind: "portalChat", id: "chat-1" });
    expect(parseFileOwner("online/chats/chat-1/1-uuid-a.jpg")).toEqual({ kind: "portalChat", id: "chat-1" });
    expect(parseFileOwner("online/tasks/t-1/a.pdf")).toEqual({ kind: "task", id: "t-1" });
    expect(parseFileOwner("online/feedback/sub-1/a.pdf")).toEqual({ kind: "submission", id: "sub-1" });
    expect(parseFileOwner("mentoring/m-1/a.jpg")).toEqual({ kind: "mentoring", id: "m-1" });
    expect(parseFileOwner("mentoring-sessions/ms-1/a.jpg")).toEqual({ kind: "mentoringSession", id: "ms-1" });
    expect(parseFileOwner("assignments/as-1/a.pdf")).toEqual({ kind: "assignment", id: "as-1" });
    expect(parseFileOwner("student-questions/incoming/1-a.jpg")).toEqual({ kind: "question" });
    expect(parseFileOwner("photos/2026/11/1-a.jpg")).toEqual({ kind: "photo" });
  });

  it("id 자리만 있고 파일이 없거나 모르는 경로면 운영진 전용(null)", () => {
    expect(parseFileOwner("family-chat/stu-1")).toBeNull();
    expect(parseFileOwner("family-chat//a.jpg")).toBeNull();
    expect(parseFileOwner("study-plans/1-a.jpg")).toBeNull();
  });
});

describe("canReadFile", () => {
  it("운영진은 전부, 학생·학부모는 연결된 학생 파일만", () => {
    expect(canReadFile({ staff: true, studentIds: [] }, null)).toBe(true);
    expect(canReadFile({ staff: false, studentIds: ["stu-1"] }, "stu-1")).toBe(true);
    expect(canReadFile({ staff: false, studentIds: ["stu-1"] }, "stu-2")).toBe(false);
    expect(canReadFile({ staff: false, studentIds: ["stu-1"] }, null)).toBe(false);
    expect(canReadFile({ staff: false, studentIds: [] }, "stu-1")).toBe(false);
  });
});

describe("GET /api/files/...", () => {
  const PRIVATE = "vercel_blob_rw_privstore_secret";
  const own = fileUrlForPathname("family-chat/stu-1/uuid-a.jpg");
  const other = fileUrlForPathname("family-chat/stu-2/uuid-b.jpg");
  const request = (path: string, init?: { cookie?: string }) =>
    GET(
      new NextRequest(`https://app.test${path}`, {
        headers: init?.cookie ? { cookie: init.cookie } : undefined,
      }),
    );
  const identity = (over: Record<string, unknown>) =>
    ({ identity: { id: "auth-1", appUser: null, student: null, ...over }, session: {} }) as never;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("BLOB_PRIVATE_READ_WRITE_TOKEN", PRIVATE);
    vi.mocked(getAuthIdentity).mockResolvedValue(null);
    vi.mocked(prisma.parentLink.findMany).mockResolvedValue([]);
    vi.mocked(get).mockResolvedValue({
      statusCode: 200,
      stream: new Blob(["img"]).stream(),
      headers: new Headers(),
      blob: { contentType: "image/jpeg" },
    } as never);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("비공개 저장소가 꺼져 있으면 없는 경로", async () => {
    vi.stubEnv("BLOB_PRIVATE_READ_WRITE_TOKEN", "");
    expect((await request(own)).status).toBe(404);
  });

  it("세션도 서명도 없으면 401", async () => {
    expect((await request(own)).status).toBe(401);
    expect(get).not.toHaveBeenCalled();
  });

  it("서명된 주소는 세션 없이 열리고, 비공개·다운로드 헤더로 보낸다", async () => {
    const res = await request(signFileUrl(own));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-disposition")).toMatch(/^inline;/);
    expect(getAuthIdentity).not.toHaveBeenCalled();
  });

  it("학생은 자기 파일만", async () => {
    vi.mocked(getAuthIdentity).mockResolvedValue(identity({ student: { id: "stu-1", status: "ACTIVE" } }));
    expect((await request(own)).status).toBe(200);
    expect((await request(other)).status).toBe(403);
  });

  it("학부모는 연결된 자녀 파일만 (DB 로 학생을 찾는 경로 포함)", async () => {
    vi.mocked(getAuthIdentity).mockResolvedValue(identity({}));
    vi.mocked(prisma.parentLink.findMany).mockResolvedValue([{ studentId: "stu-1" }] as never);
    vi.mocked(prisma.mentoring.findUnique).mockResolvedValue({ studentId: "stu-2" } as never);
    expect((await request(own)).status).toBe(200);
    expect((await request(fileUrlForPathname("mentoring/m-9/a.jpg"))).status).toBe(403);
  });

  it("운영진은 전부 — 퇴사자는 안 된다", async () => {
    vi.mocked(getAuthIdentity).mockResolvedValue(identity({ appUser: { role: "MENTOR", status: "ACTIVE" } }));
    expect((await request(other)).status).toBe(200);
    vi.mocked(getAuthIdentity).mockResolvedValue(identity({ appUser: { role: "MENTOR", status: "TERMINATED" } }));
    expect((await request(other)).status).toBe(403);
  });

  it("학생 포털 쿠키(매직링크)로 그 학생 파일만", async () => {
    vi.mocked(validateMagicLink).mockResolvedValue({ student: { id: "stu-1" } } as never);
    const cookie = `${PORTAL_FILE_COOKIE}=magic-token-value-1234567890`;
    expect((await request(own, { cookie })).status).toBe(200);
    expect((await request(other, { cookie })).status).toBe(403);
  });

  it("문서 등 그 자리에서 열면 안 되는 형식은 내려받기로", async () => {
    vi.mocked(get).mockResolvedValue({
      statusCode: 200,
      stream: new Blob(["x"]).stream(),
      headers: new Headers(),
      blob: { contentType: "text/html" },
    } as never);
    const res = await request(signFileUrl(own));
    expect(res.headers.get("content-disposition")).toMatch(/^attachment;/);
  });
});

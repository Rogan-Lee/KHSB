import { beforeEach, describe, expect, it, vi } from "vitest";

const createMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { personalDataAccessLog: { createMany } } }));

import { isPrefetch, loggablePath, studentIdFromPath, writeAccessLog } from "../access-log";

beforeEach(() => createMany.mockReset());

describe("접속 기록", () => {
  it("학생 상세 주소에서만 학생을 뽑는다", () => {
    expect(studentIdFromPath("/students/cmabcdefghijklmnopqrstuv")).toBe("cmabcdefghijklmnopqrstuv");
    expect(studentIdFromPath("/students/new")).toBeNull();
    expect(studentIdFromPath("/mentoring/cmabcdefghijklmnopqrstuv")).toBeNull();
  });

  it("쿼리는 남기지 않는다", () => {
    expect(loggablePath("/students?q=홍길동")).toBe("/students");
  });

  it("미리 불러오기는 접속이 아니다", () => {
    expect(isPrefetch(new Headers({ "next-router-prefetch": "1" }))).toBe(true);
    expect(isPrefetch(new Headers({ "sec-purpose": "prefetch" }))).toBe(true);
    expect(isPrefetch(new Headers())).toBe(false);
  });

  it("같은 10분은 같은 묶음이라 한 번만 남는다", async () => {
    const base = { actor: { id: "u1", name: "직원" }, action: "VIEW" as const, path: "/students", ip: null };
    await writeAccessLog({ ...base, at: new Date("2026-11-22T01:03:00Z") });
    await writeAccessLog({ ...base, at: new Date("2026-11-22T01:09:59Z") });
    await writeAccessLog({ ...base, at: new Date("2026-11-22T01:10:00Z") });
    const buckets = createMany.mock.calls.map(([a]) => a.data.bucket.toISOString());
    expect(buckets).toEqual(["2026-11-22T01:00:00.000Z", "2026-11-22T01:00:00.000Z", "2026-11-22T01:10:00.000Z"]);
    expect(createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });
});

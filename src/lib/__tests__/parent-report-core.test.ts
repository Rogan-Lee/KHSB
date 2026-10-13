import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    student: { findMany: vi.fn() },
    mentoring: { findMany: vi.fn() },
    parentReport: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/db/latest-per-group", () => ({ latestIdsPerGroup: vi.fn() }));

import { latestIdsPerGroup } from "@/lib/db/latest-per-group";
import { listStudentsForReportDispatch } from "@/lib/parent-report-core";
import { prisma } from "@/lib/prisma";

const d = (s: string) => new Date(s);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listStudentsForReportDispatch", () => {
  it("학생별 최신 완료 멘토링·최신 리포트를 본문 없이 합친다", async () => {
    vi.mocked(prisma.student.findMany).mockResolvedValue([
      { id: "s1", name: "가학생", grade: "고1", school: "A고" },
      { id: "s2", name: "나학생", grade: "고2", school: null },
      { id: "s3", name: "다학생", grade: "고3", school: "C고" },
    ] as never);
    vi.mocked(latestIdsPerGroup)
      .mockResolvedValueOnce(["m1", "m2"]) // 학생별 최신 COMPLETED 멘토링
      .mockResolvedValueOnce(["r1"]); // 멘토링별 최신 리포트
    vi.mocked(prisma.mentoring.findMany)
      .mockResolvedValueOnce([
        { id: "m2", studentId: "s2", actualDate: null, scheduledAt: d("2026-09-20T00:00:00Z"), mentorId: "u2", mentor: { name: "박멘토" } },
        { id: "m1", studentId: "s1", actualDate: d("2026-09-25T00:00:00Z"), scheduledAt: d("2026-09-24T00:00:00Z"), mentorId: "u1", mentor: { name: "김멘토" } },
      ] as never)
      .mockResolvedValueOnce([{ id: "m1" }] as never); // 메모·내용 있는 멘토링
    vi.mocked(prisma.parentReport.findMany).mockResolvedValue([
      { id: "r1", mentoringId: "m1", token: "tok", createdAt: d("2026-09-26T00:00:00Z"), expiresAt: null, revokedAt: null },
    ] as never);

    const rows = await listStudentsForReportDispatch();

    // 학생 정렬 그대로 + 멘토링·리포트 병합
    expect(rows).toEqual([
      {
        studentId: "s1",
        studentName: "가학생",
        grade: "고1",
        school: "A고",
        latestMentoring: { id: "m1", date: d("2026-09-25T00:00:00Z"), mentorId: "u1", mentorName: "김멘토", hasNotes: true },
        parentReport: { id: "r1", token: "tok", createdAt: d("2026-09-26T00:00:00Z"), expiresAt: null, revokedAt: null },
      },
      {
        studentId: "s2",
        studentName: "나학생",
        grade: "고2",
        school: null,
        latestMentoring: { id: "m2", date: d("2026-09-20T00:00:00Z"), mentorId: "u2", mentorName: "박멘토", hasNotes: false },
        parentReport: null,
      },
      { studentId: "s3", studentName: "다학생", grade: "고3", school: "C고", latestMentoring: null, parentReport: null },
    ]);

    // 최신 멘토링은 DB 에서 학생별로 (기존 중첩 orderBy 와 같은 정렬)
    expect(vi.mocked(latestIdsPerGroup).mock.calls[0][0]).toMatchObject({
      table: "Mentoring",
      groupBy: "studentId",
      groupIds: ["s1", "s2", "s3"],
      orderBy: [
        { column: "actualDate", dir: "desc" },
        { column: "scheduledAt", dir: "desc" },
      ],
    });
    expect(vi.mocked(latestIdsPerGroup).mock.calls[1][0]).toMatchObject({
      table: "ParentReport",
      groupBy: "mentoringId",
      groupIds: ["m1", "m2"],
    });
    // 장문(notes·content·customNote)은 전송하지 않는다
    const [listCall, notedCall] = vi.mocked(prisma.mentoring.findMany).mock.calls.map((c) => c[0]!);
    expect(listCall.select).not.toHaveProperty("notes");
    expect(listCall.select).not.toHaveProperty("content");
    expect(notedCall.select).toEqual({ id: true });
    expect(vi.mocked(prisma.parentReport.findMany).mock.calls[0][0]!.select).not.toHaveProperty("customNote");
  });

  it("완료 멘토링이 없으면 추가 조회 없이 빈 값", async () => {
    vi.mocked(prisma.student.findMany).mockResolvedValue([
      { id: "s1", name: "가학생", grade: "고1", school: null },
    ] as never);
    vi.mocked(latestIdsPerGroup).mockResolvedValueOnce([]);

    const rows = await listStudentsForReportDispatch();

    expect(rows).toEqual([
      { studentId: "s1", studentName: "가학생", grade: "고1", school: null, latestMentoring: null, parentReport: null },
    ]);
    expect(prisma.mentoring.findMany).not.toHaveBeenCalled();
    expect(prisma.parentReport.findMany).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const db = {
    waitlist: { count: vi.fn(), deleteMany: vi.fn() },
    phoneVerification: { count: vi.fn(), deleteMany: vi.fn() },
    personalDataAccessLog: { count: vi.fn(), deleteMany: vi.fn() },
    aiTransferLog: { count: vi.fn(), deleteMany: vi.fn() },
    student: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    accessDevice: { count: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    tuitionInvoice: { count: vi.fn(), updateMany: vi.fn() },
    photo: { deleteMany: vi.fn() },
    calendarEvent: { deleteMany: vi.fn() },
    monthlyNote: { deleteMany: vi.fn() },
    accessEvent: { deleteMany: vi.fn() },
    reportAiJob: { deleteMany: vi.fn() },
    appSetting: { upsert: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  // 배열은 순서대로, 함수(대화형 트랜잭션)는 db 를 tx 로 넘긴다
  db.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: typeof db) => unknown)(db) : Promise.all(arg as unknown[]),
  );
  return db;
});
vi.mock("@/lib/prisma", () => ({ prisma: db }));
const blob = vi.hoisted(() => ({ del: vi.fn() }));
vi.mock("@vercel/blob", () => blob);
const access = vi.hoisted(() => ({ bumpAccessRev: vi.fn() }));
vi.mock("@/lib/access-control/store", () => access);

import {
  collectBlobUrls,
  expiredStudentWhere,
  expiredWaitlistWhere,
  isExpiredStudent,
  PURGED_STUDENT_NAME,
  retentionCutoffs,
  runRetention,
  STUDENT_PURGE_BATCH,
} from "../retention";

const now = new Date("2026-11-22T00:00:00.000Z");
const BLOB = "https://abc123.public.blob.vercel-storage.com";

/** 3년보다 오래전에 퇴원한 학생 — findFirst 가 돌려주는 모양 */
function expiredStudent(over: Record<string, unknown> = {}) {
  return {
    id: "s1",
    name: "학생",
    status: "WITHDRAWN",
    startDate: new Date("2021-03-02"),
    endDate: new Date("2023-01-31"),
    imageUrl: null,
    authIdentity: null,
    photos: [],
    mentorings: [],
    consultations: [],
    monthlyReports: [],
    parentReports: [],
    studyPlanReports: [],
    onlineParentReports: [],
    assignments: [],
    mentoringSessions: [],
    performanceTasks: [],
    portalChats: [],
    studentQuestions: [],
    familyChat: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const t of [db.waitlist, db.phoneVerification, db.personalDataAccessLog, db.aiTransferLog]) {
    t.count.mockResolvedValue(2);
    t.deleteMany.mockResolvedValue({ count: 2 });
  }
  db.student.count.mockResolvedValue(0);
  db.student.findMany.mockResolvedValue([]);
  db.student.findFirst.mockResolvedValue(null);
  db.student.create.mockResolvedValue({ id: "anon1" });
  db.student.deleteMany.mockResolvedValue({ count: 1 });
  db.accessDevice.count.mockResolvedValue(0);
  db.accessDevice.updateMany.mockResolvedValue({ count: 0 });
  db.accessDevice.deleteMany.mockResolvedValue({ count: 0 });
  db.tuitionInvoice.count.mockResolvedValue(0);
  blob.del.mockResolvedValue(undefined);
  delete process.env.RETENTION_PURGE;
  delete process.env.RETENTION_PURGE_STUDENTS;
});

describe("보유 기간", () => {
  it("처리방침과 같은 기간으로 자른다", () => {
    const cut = retentionCutoffs(now);
    expect(cut.waitlist.toISOString().slice(0, 10)).toBe("2025-11-22");
    expect(cut.student.toISOString().slice(0, 10)).toBe("2023-11-22");
    expect(cut.log.toISOString().slice(0, 10)).toBe("2024-11-22");
    expect(cut.unassignedDevice.toISOString().slice(0, 10)).toBe("2026-10-23");
  });

  it("응대 전 신청·등록된 학생의 신청·종료일 없는 학생은 대상이 아니다", () => {
    const w = expiredWaitlistWhere(now);
    expect(w.studentId).toBeNull();
    expect(JSON.stringify(w)).not.toContain("WAITING");
    expect(expiredStudentWhere(now)).toEqual({
      status: { in: ["WITHDRAWN", "GRADUATED"] },
      endDate: { lt: now },
      NOT: { name: PURGED_STUDENT_NAME },
    });
  });

  it("재원·휴원생, 종료일 없거나 기간이 안 지난 학생, 이미 파기한 행은 직전 확인에서 막힌다", () => {
    const cut = retentionCutoffs(now).student;
    const old = new Date("2023-01-31");
    expect(isExpiredStudent({ status: "ACTIVE", endDate: old, name: "a" }, cut)).toBe(false);
    expect(isExpiredStudent({ status: "INACTIVE", endDate: old, name: "a" }, cut)).toBe(false);
    expect(isExpiredStudent({ status: "WITHDRAWN", endDate: null, name: "a" }, cut)).toBe(false);
    expect(isExpiredStudent({ status: "WITHDRAWN", endDate: new Date("2024-01-31"), name: "a" }, cut)).toBe(false);
    expect(isExpiredStudent({ status: "WITHDRAWN", endDate: old, name: PURGED_STUDENT_NAME }, cut)).toBe(false);
    expect(isExpiredStudent({ status: "WITHDRAWN", endDate: old, name: "a" }, cut)).toBe(true);
    expect(isExpiredStudent({ status: "GRADUATED", endDate: old, name: "a" }, cut)).toBe(true);
  });
});

describe("collectBlobUrls", () => {
  it("주소 칸·첨부 JSON·본문에 넣은 이미지를 모으고 바깥 주소는 뺀다", () => {
    const urls = collectBlobUrls({
      imageUrl: `${BLOB}/students/a%20(1).jpg`,
      attachments: [{ url: `${BLOB}/family-chat/s1/x.png`, name: "x.png" }],
      notes: `상담 메모 ![](${BLOB}/study-plans/1-u.jpg) 그리고 <img src="${BLOB}/study-plans/2-u.png">`,
      receiptUrl: "https://example.com/receipt.jpg",
      at: new Date(),
    });
    expect([...urls].sort()).toEqual(
      [
        `${BLOB}/family-chat/s1/x.png`,
        `${BLOB}/students/a%20(1).jpg`,
        `${BLOB}/study-plans/1-u.jpg`,
        `${BLOB}/study-plans/2-u.png`,
      ].sort(),
    );
  });
});

describe("runRetention", () => {
  it("RETENTION_PURGE=0 이면 건수만 세고 아무것도 지우지 않는다", async () => {
    process.env.RETENTION_PURGE = "0";
    process.env.RETENTION_PURGE_STUDENTS = "1";
    const r = await runRetention(now);
    expect(r.purged).toBeNull();
    expect(r.studentPurgeEnabled).toBe(false);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.waitlist.deleteMany).not.toHaveBeenCalled();
    expect(db.accessDevice.updateMany).not.toHaveBeenCalled();
    expect(db.student.findMany).not.toHaveBeenCalled();
    expect(db.appSetting.upsert).toHaveBeenCalledOnce();
  });

  it("기본은 지우되 학생은 RETENTION_PURGE_STUDENTS 없이는 건드리지 않는다", async () => {
    db.student.count.mockResolvedValue(3);
    const r = await runRetention(now);
    expect(r.purged).toMatchObject({ waitlist: 2, phoneVerification: 2, logs: 4, students: 0 });
    expect(r.students).toBe(3);
    expect(r.studentPurgeEnabled).toBe(false);
    expect(db.student.findMany).not.toHaveBeenCalled();
    expect(db.student.deleteMany).not.toHaveBeenCalled();
    expect(blob.del).not.toHaveBeenCalled();
  });

  describe("퇴원생 파기 (RETENTION_PURGE_STUDENTS=1)", () => {
    beforeEach(() => {
      process.env.RETENTION_PURGE_STUDENTS = "1";
      db.student.findMany.mockResolvedValue([{ id: "s1" }]);
    });

    it("한 번에 20명까지, 퇴원·졸업하고 3년 지난 학생만 찾는다", async () => {
      await runRetention(now);
      const arg = db.student.findMany.mock.calls[0][0];
      expect(STUDENT_PURGE_BATCH).toBe(20);
      expect(arg.take).toBe(20);
      expect(arg.where).toEqual(expiredStudentWhere(retentionCutoffs(now).student));
    });

    it("조건이 잘못돼 재원생이 넘어와도 파일·기록을 지우지 않는다", async () => {
      db.student.findFirst.mockResolvedValue(expiredStudent({ status: "ACTIVE", imageUrl: `${BLOB}/a.jpg` }));
      const r = await runRetention(now);
      expect(r.purged?.students).toBe(0);
      expect(blob.del).not.toHaveBeenCalled();
      expect(db.student.deleteMany).not.toHaveBeenCalled();
      expect(db.photo.deleteMany).not.toHaveBeenCalled();
    });

    it("지우는 순간에도 퇴원 조건을 다시 걸고, 맞는 행이 없으면 되돌린다", async () => {
      db.student.findFirst.mockResolvedValue(expiredStudent());
      db.student.deleteMany.mockResolvedValue({ count: 0 });
      const r = await runRetention(now);
      expect(r.purged?.students).toBe(0);
      const where = db.student.deleteMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ id: "s1", status: { in: ["WITHDRAWN", "GRADUATED"] } });
    });

    it("학생 파일(Blob)을 먼저 지우고 학생 행을 지운다", async () => {
      db.student.findFirst.mockResolvedValue(
        expiredStudent({
          imageUrl: `${BLOB}/profile.jpg`,
          photos: [{ url: `${BLOB}/photos/1.jpg`, thumbnailUrl: `${BLOB}/photos/1.thumb.webp` }],
          familyChat: { messages: [{ attachments: [{ url: `${BLOB}/family-chat/s1/v.mp4` }] }] },
          consultations: [{ id: "c1", notes: `메모 ![](${BLOB}/study-plans/9.jpg)` }],
          monthlyReports: [{ id: "m1" }],
        }),
      );
      const r = await runRetention(now);
      expect(r.purged?.students).toBe(1);
      expect([...blob.del.mock.calls[0][0]].sort()).toEqual(
        [
          `${BLOB}/family-chat/s1/v.mp4`,
          `${BLOB}/photos/1.jpg`,
          `${BLOB}/photos/1.thumb.webp`,
          `${BLOB}/profile.jpg`,
          `${BLOB}/study-plans/9.jpg`,
        ].sort(),
      );
      expect(blob.del.mock.invocationCallOrder[0]).toBeLessThan(db.student.deleteMany.mock.invocationCallOrder[0]);
      // 학생 행을 지워도 남는 것들
      expect(db.photo.deleteMany).toHaveBeenCalled();
      expect(db.waitlist.deleteMany).toHaveBeenCalledWith({ where: { studentId: "s1" } });
      expect(db.monthlyNote.deleteMany).toHaveBeenCalledWith({ where: { studentId: "s1" } });
      expect(db.reportAiJob.deleteMany).toHaveBeenCalledWith({ where: { targetId: { in: ["m1"] } } });
      expect(db.student.create).not.toHaveBeenCalled();
      expect(access.bumpAccessRev).toHaveBeenCalled();
    });

    it("파일 삭제가 실패하면 그 학생 기록은 지우지 않는다", async () => {
      db.student.findFirst.mockResolvedValue(expiredStudent({ imageUrl: `${BLOB}/profile.jpg` }));
      blob.del.mockRejectedValue(new Error("blob down"));
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      const r = await runRetention(now);
      err.mockRestore();
      expect(r.purged?.students).toBe(0);
      expect(db.student.deleteMany).not.toHaveBeenCalled();
    });

    it("수납 기록이 있으면 이름 없는 행으로 옮겨 남기고 원래 행을 지운다", async () => {
      db.student.findFirst.mockResolvedValue(expiredStudent());
      db.tuitionInvoice.count.mockResolvedValue(2);
      const r = await runRetention(now);
      expect(r.purged?.students).toBe(1);
      const data = db.student.create.mock.calls[0][0].data;
      expect(data).toEqual({
        name: PURGED_STUDENT_NAME,
        parentPhone: "",
        grade: "",
        status: "WITHDRAWN",
        startDate: new Date("2021-03-02"),
        endDate: new Date("2023-01-31"),
      });
      expect(db.tuitionInvoice.updateMany).toHaveBeenCalledWith({ where: { studentId: "s1" }, data: { studentId: "anon1" } });
      expect(db.tuitionInvoice.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        db.student.deleteMany.mock.invocationCallOrder[0],
      );
      expect(db.student.deleteMany.mock.calls[0][0].where.id).toBe("s1");
    });
  });

  describe("와이파이 기기", () => {
    it("퇴원생 기기는 연결을 풀고 30일 안 보인 미배정 기기는 지운다 (EXEMPT 제외)", async () => {
      db.accessDevice.updateMany.mockResolvedValue({ count: 1 });
      db.accessDevice.deleteMany.mockResolvedValue({ count: 2 });
      const r = await runRetention(now);
      const unassign = db.accessDevice.updateMany.mock.calls[0][0];
      expect(unassign.where.status).toBe("ASSIGNED");
      expect(unassign.data).toEqual({ studentId: null, status: "UNASSIGNED", label: null });
      expect(db.accessDevice.deleteMany).toHaveBeenCalledWith({
        where: { status: "UNASSIGNED", lastSeenAt: { lt: retentionCutoffs(now).unassignedDevice } },
      });
      expect(JSON.stringify([unassign, db.accessDevice.deleteMany.mock.calls[0][0]])).not.toContain("EXEMPT");
      expect(r.purged).toMatchObject({ devicesUnassigned: 1, devicesDeleted: 2 });
      expect(access.bumpAccessRev).toHaveBeenCalledOnce();
    });

    it("바뀐 게 없으면 장비 정책 번호를 올리지 않는다", async () => {
      await runRetention(now);
      expect(access.bumpAccessRev).not.toHaveBeenCalled();
    });
  });
});

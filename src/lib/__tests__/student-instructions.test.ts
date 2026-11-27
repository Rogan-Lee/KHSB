import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
    communication: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    student: { findUnique: vi.fn() },
    studentInstruction: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));
vi.mock("@/lib/mobile-push", () => ({
  notifyAssignedStaffOfParentRequest: vi.fn(),
  sendMobilePush: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import {
  ackInstruction,
  draftInstructionFromRequest,
  listInstructionsForStudent,
  mentionsParent,
  parseAiInstruction,
  sendInstruction,
} from "@/lib/student-instructions";

const sentRow = {
  id: "i-1",
  content: "오늘부터 수학 문제집을 하루 1시간 더 풀어 봐요.",
  sentByName: "김조교",
  sentAt: new Date("2026-11-16T10:00:00Z"),
  ackedAt: null,
  createdAt: new Date("2026-11-16T09:00:00Z"),
  student: { id: "s-1", name: "학생", grade: "고2" },
  communication: { id: "c-1", content: "[학습] 수학 더 시켜 주세요", createdAt: new Date(), createdByName: "어머니" },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.student.findUnique).mockResolvedValue({ id: "s-1" } as never);
  vi.mocked(prisma.studentInstruction.create).mockResolvedValue(sentRow as never);
});

describe("AI 초안 걸러내기", () => {
  it("학부모를 떠올리게 하는 말을 잡는다", () => {
    expect(mentionsParent("부모님이 걱정하셔서 수학을 더 하자")).toBe(true);
    expect(mentionsParent("어머님 말씀대로")).toBe(true);
    expect(mentionsParent("오늘부터 수학 1시간 더 해요")).toBe(false);
  });

  it("JSON 응답에서 지시만 꺼내고, 학부모 언급·빈 값·깨진 응답은 버린다", () => {
    expect(parseAiInstruction('{"instruction": " 영어 단어 30개씩 외워요 "}')).toBe("영어 단어 30개씩 외워요");
    expect(parseAiInstruction('```json\n{"instruction":"쉬는 시간을 10분으로 줄여요"}\n```')).toBe(
      "쉬는 시간을 10분으로 줄여요",
    );
    expect(parseAiInstruction('{"instruction": null}')).toBeNull();
    expect(parseAiInstruction('{"instruction": "엄마가 수학 더 하래요"}')).toBeNull();
    expect(parseAiInstruction("모르겠어요")).toBeNull();
    expect(parseAiInstruction(undefined)).toBeNull();
  });
});

describe("학생에게는 학부모 요청을 숨긴다", () => {
  it("학생 목록 조회는 원본 요청(communication)을 읽지 않고 내보내지도 않는다", async () => {
    vi.mocked(prisma.studentInstruction.findMany).mockResolvedValue([sentRow] as never);
    const result = await listInstructionsForStudent("s-1");

    const query = vi.mocked(prisma.studentInstruction.findMany).mock.calls[0][0]!;
    expect(query.select).not.toHaveProperty("communication");
    expect(query.where).toMatchObject({ studentId: "s-1", sentAt: { not: null } });
    expect(Object.keys(result.items[0]).sort()).toEqual(["ackedAt", "content", "id", "sentAt", "sentByName"]);
    expect(JSON.stringify(result)).not.toContain("수학 더 시켜");
    expect(result.unacked).toBe(1);
  });
});

describe("지시 보내기", () => {
  it("다른 학생의 학부모 요청에는 붙일 수 없다", async () => {
    vi.mocked(prisma.communication.findFirst).mockResolvedValue(null);
    await expect(
      sendInstruction({ id: "u-1", name: "김조교" }, { studentId: "s-1", content: "수학 더 해요", requestId: "c-9" }),
    ).rejects.toMatchObject({ status: 404 });
    expect(vi.mocked(prisma.communication.findFirst).mock.calls[0][0]).toMatchObject({
      where: { id: "c-9", studentId: "s-1", type: "PARENT_REQUEST" },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("학부모 요청에서 보내면 요청을 확인 처리하고 남은 초안을 지우며, 요청한 학부모에게 알릴 정보를 돌려준다", async () => {
    vi.mocked(prisma.communication.findFirst).mockResolvedValue({ createdById: "parent-auth-1" } as never);
    const { push } = await sendInstruction(
      { id: "u-1", name: " 김조교 " },
      { studentId: "s-1", content: " 수학 1시간 더 해요 ", requestId: "c-1" },
    );

    expect(prisma.communication.updateMany).toHaveBeenCalledWith({
      where: { id: "c-1", isChecked: false },
      data: { isChecked: true, checkedAt: expect.any(Date) },
    });
    expect(prisma.studentInstruction.deleteMany).toHaveBeenCalledWith({
      where: { communicationId: "c-1", sentAt: null },
    });
    expect(push).toEqual({
      studentId: "s-1",
      content: "수학 1시간 더 해요",
      sentByName: "김조교",
      requesterId: "parent-auth-1",
    });
  });

  it("이미 보낸 초안은 다시 보낼 수 없다", async () => {
    vi.mocked(prisma.studentInstruction.findFirst).mockResolvedValue(null);
    await expect(
      sendInstruction({ id: "u-1" }, { studentId: "s-1", content: "수학 더 해요", draftId: "d-1" }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("학생 확인", () => {
  it("본인 지시가 아니면 404", async () => {
    vi.mocked(prisma.studentInstruction.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.studentInstruction.findFirst).mockResolvedValue(null);
    await expect(ackInstruction("s-2", "i-1")).rejects.toMatchObject({ status: 404 });
    expect(vi.mocked(prisma.studentInstruction.updateMany).mock.calls[0][0]).toMatchObject({
      where: { id: "i-1", studentId: "s-2", ackedAt: null },
    });
  });
});

describe("AI 초안 시작일", () => {
  it("처리방침 시행일(2026-11-24) 전에는 초안을 만들지 않는다", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-23T23:59:00+09:00") });
    try {
      vi.mocked(prisma.communication.findFirst).mockResolvedValue({
        id: "c-1",
        content: "[학습] 수학 더",
        studentId: "s-1",
        student: { grade: "고2" },
        instructions: [],
      } as never);
      await expect(draftInstructionFromRequest("c-1")).resolves.toBeNull();
      await expect(draftInstructionFromRequest("c-1", { force: true })).rejects.toMatchObject({ status: 422 });
      expect(prisma.studentInstruction.create).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    attendanceRecord: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    mentoring: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    questionMessage: {
      create: vi.fn(),
    },
    student: {
      findFirst: vi.fn(),
    },
    studentQuestion: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock("@/lib/slack", () => ({ notifySlack: vi.fn() }));

import { prisma } from "@/lib/prisma";
import {
  answerMobileStudentQuestion,
  completeMobileMentoring,
  createMobileStudentQuestion,
  getMobileMentoringRecord,
  getMobileStudentQuestionThread,
  updateMobileAttendance,
} from "@/lib/mobile-workflows";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
});

describe("mobile question workflows", () => {
  it("creates a student question with a first message", async () => {
    vi.mocked(prisma.studentQuestion.create).mockResolvedValue({
      id: "question-1",
    } as never);

    await expect(
      createMobileStudentQuestion(
        { grade: "고2", id: "student-1", name: "홍길동" },
        {
          content: " 풀이가 이해되지 않아요 ",
          subject: " 수학 ",
          title: " 미분 문제 ",
        },
      ),
    ).resolves.toEqual({ id: "question-1" });

    expect(prisma.studentQuestion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentId: "student-1",
          subject: "수학",
          title: "미분 문제",
          messages: {
            create: expect.objectContaining({
              content: "풀이가 이해되지 않아요",
              senderType: "STUDENT",
            }),
          },
        }),
      }),
    );
  });

  it("does not expose another student's thread", async () => {
    vi.mocked(prisma.studentQuestion.findFirst).mockResolvedValue(null);

    await expect(
      getMobileStudentQuestionThread("student-1", "question-2"),
    ).rejects.toMatchObject({
      message: "질문을 찾을 수 없습니다",
      status: 404,
    });
  });

  it("answers and automatically claims an open question", async () => {
    vi.mocked(prisma.studentQuestion.findUnique).mockResolvedValue({
      claimedById: null,
      id: "question-1",
      status: "OPEN",
    } as never);

    await answerMobileStudentQuestion("staff-1", "question-1", {
      content: "이 순서로 미분하면 됩니다.",
    });

    expect(prisma.questionMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          questionId: "question-1",
          senderType: "STAFF",
          senderUserId: "staff-1",
        }),
      }),
    );
    expect(prisma.studentQuestion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          claimedById: "staff-1",
          status: "ANSWERED",
          studentReadAt: null,
        }),
      }),
    );
  });
});

describe("mobile attendance workflows", () => {
  const now = new Date("2026-06-20T00:45:00.000Z");

  it("marks a late check-in as TARDY", async () => {
    vi.mocked(prisma.student.findFirst).mockResolvedValue({
      id: "student-1",
      schedules: [{ startTime: "09:00" }],
    } as never);
    vi.mocked(prisma.attendanceRecord.findUnique).mockResolvedValue(null);

    await updateMobileAttendance(
      "student-1",
      { action: "CHECK_IN" },
      now,
    );

    expect(prisma.attendanceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          checkIn: now,
          type: "TARDY",
        }),
        update: expect.objectContaining({
          checkIn: now,
          type: "TARDY",
        }),
      }),
    );
  });

  it("rejects checkout before check-in", async () => {
    vi.mocked(prisma.student.findFirst).mockResolvedValue({
      id: "student-1",
      schedules: [],
    } as never);
    vi.mocked(prisma.attendanceRecord.findUnique).mockResolvedValue(null);

    await expect(
      updateMobileAttendance(
        "student-1",
        { action: "CHECK_OUT" },
        now,
      ),
    ).rejects.toMatchObject({
      message: "현재 상태에서는 퇴실 처리할 수 없습니다",
      status: 409,
    });
  });

  it("rejects starting another outing while already away", async () => {
    vi.mocked(prisma.student.findFirst).mockResolvedValue({
      id: "student-1",
      schedules: [],
    } as never);
    vi.mocked(prisma.attendanceRecord.findUnique).mockResolvedValue({
      checkIn: now,
      checkOut: null,
      outEnd: null,
      outStart: now,
      type: "NORMAL",
    } as never);

    await expect(
      updateMobileAttendance(
        "student-1",
        { action: "START_OUTING" },
        now,
      ),
    ).rejects.toMatchObject({
      message: "입실 중인 학생만 외출 처리할 수 있습니다",
      status: 409,
    });
  });

  it("does not overwrite a checked-in student as absent", async () => {
    vi.mocked(prisma.student.findFirst).mockResolvedValue({
      id: "student-1",
      schedules: [],
    } as never);
    vi.mocked(prisma.attendanceRecord.findUnique).mockResolvedValue({
      checkIn: now,
      checkOut: null,
      outEnd: null,
      outStart: null,
      type: "NORMAL",
    } as never);

    await expect(
      updateMobileAttendance(
        "student-1",
        { action: "MARK_ABSENT" },
        now,
      ),
    ).rejects.toMatchObject({
      message: "미입실 학생만 결석 처리할 수 있습니다",
      status: 409,
    });
  });
});

describe("mobile mentoring workflows", () => {
  it("prevents a mentor from editing another mentor's session", async () => {
    vi.mocked(prisma.mentoring.findUnique).mockResolvedValue({
      id: "mentoring-1",
      mentorId: "mentor-2",
      student: {},
    } as never);

    await expect(
      getMobileMentoringRecord("mentoring-1", "mentor-1", "MENTOR"),
    ).rejects.toMatchObject({
      message: "이 멘토링을 수정할 수 없습니다",
      status: 403,
    });
  });

  it("stores content and completes an authorized mentoring", async () => {
    vi.mocked(prisma.mentoring.findUnique).mockResolvedValue({
      id: "mentoring-1",
      mentorId: "mentor-1",
      scheduledAt: new Date("2026-06-20T00:00:00.000Z"),
      scheduledTimeStart: "19:30",
      status: "SCHEDULED",
    } as never);
    const now = new Date("2026-06-20T12:00:00.000Z");

    await completeMobileMentoring(
      "mentoring-1",
      "mentor-1",
      "MENTOR",
      {
        content: "수학 진도와 오답을 점검함",
        nextGoals: "오답 20문제 복습",
      },
      now,
    );

    expect(prisma.mentoring.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actualEndTime: "21:00",
          actualStartTime: "19:30",
          content: "수학 진도와 오답을 점검함",
          nextGoals: "오답 20문제 복습",
          status: "COMPLETED",
        }),
      }),
    );
  });

  it("rejects completing a future mentoring", async () => {
    vi.mocked(prisma.mentoring.findUnique).mockResolvedValue({
      id: "mentoring-1",
      mentorId: "mentor-1",
      scheduledAt: new Date("2026-06-20T00:00:00.000Z"),
      scheduledTimeStart: "22:30",
      status: "SCHEDULED",
    } as never);

    await expect(
      completeMobileMentoring(
        "mentoring-1",
        "mentor-1",
        "MENTOR",
        { content: "조기 기록 시도" },
        new Date("2026-06-20T12:00:00.000Z"),
      ),
    ).rejects.toMatchObject({
      message: "예정 시간이 지난 뒤 기록할 수 있습니다",
      status: 409,
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/slack", () => ({ notifySlack: vi.fn() }));
vi.mock("@/lib/student-auth", () => ({ validateMagicLink: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    studentQuestion: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    questionMessage: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateMagicLink } from "@/lib/student-auth";
import {
  createStudentQuestion,
  addStudentQuestionMessage,
  markStudentQuestionRead,
  answerStudentQuestion,
  claimStudentQuestion,
  listStaffQuestionInbox,
} from "@/actions/student-questions";

const student = { id: "s1", name: "홍길동", grade: "고2" };
const studentSession = { student, link: {} };
const staff = { user: { id: "u1", role: "MENTOR", name: "멘토김" } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
});

describe("createStudentQuestion", () => {
  it("creates a question with a first STUDENT message", async () => {
    vi.mocked(validateMagicLink).mockResolvedValue(studentSession as never);
    vi.mocked(prisma.studentQuestion.create).mockResolvedValue({ id: "q1" } as never);

    const res = await createStudentQuestion({
      studentToken: "tok",
      title: "  미적분 28번  ",
      subject: "수학",
      content: "여기서 막혔어요",
      attachments: [
        { url: "https://blob/x.jpg", name: "x.jpg", sizeBytes: 10, mimeType: "image/jpeg" },
      ],
    });

    expect(res).toEqual({ id: "q1" });
    expect(prisma.studentQuestion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentId: "s1",
          title: "미적분 28번",
          subject: "수학",
          status: "OPEN",
          staffReadAt: null,
          messages: {
            create: expect.objectContaining({
              senderType: "STUDENT",
              content: "여기서 막혔어요",
            }),
          },
        }),
      })
    );
  });

  it("rejects empty title", async () => {
    vi.mocked(validateMagicLink).mockResolvedValue(studentSession as never);
    await expect(
      createStudentQuestion({ studentToken: "tok", title: "   ", content: "x" })
    ).rejects.toThrow("질문 제목");
  });

  it("rejects when neither content nor attachment is provided", async () => {
    vi.mocked(validateMagicLink).mockResolvedValue(studentSession as never);
    await expect(
      createStudentQuestion({ studentToken: "tok", title: "제목", content: "  " })
    ).rejects.toThrow();
  });

  it("rejects an expired/invalid token", async () => {
    vi.mocked(validateMagicLink).mockResolvedValue(null);
    await expect(
      createStudentQuestion({ studentToken: "bad", title: "제목", content: "x" })
    ).rejects.toThrow("인증이 만료");
  });
});

describe("addStudentQuestionMessage", () => {
  it("rejects a question that does not belong to the student", async () => {
    vi.mocked(validateMagicLink).mockResolvedValue(studentSession as never);
    vi.mocked(prisma.studentQuestion.findUnique).mockResolvedValue({
      id: "q1",
      studentId: "OTHER",
      title: "t",
    } as never);
    await expect(
      addStudentQuestionMessage({ studentToken: "tok", questionId: "q1", content: "x" })
    ).rejects.toThrow("질문을 찾을 수 없습니다");
  });

  it("resets staffReadAt to null so staff sees it as unread", async () => {
    vi.mocked(validateMagicLink).mockResolvedValue(studentSession as never);
    vi.mocked(prisma.studentQuestion.findUnique).mockResolvedValue({
      id: "q1",
      studentId: "s1",
      title: "t",
    } as never);

    await addStudentQuestionMessage({ studentToken: "tok", questionId: "q1", content: "추가 질문" });

    expect(prisma.questionMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ senderType: "STUDENT", questionId: "q1" }) })
    );
    expect(prisma.studentQuestion.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ staffReadAt: null }) })
    );
  });
});

describe("markStudentQuestionRead", () => {
  it("rejects a question owned by someone else", async () => {
    vi.mocked(validateMagicLink).mockResolvedValue(studentSession as never);
    vi.mocked(prisma.studentQuestion.findUnique).mockResolvedValue({
      id: "q1",
      studentId: "OTHER",
    } as never);
    await expect(
      markStudentQuestionRead({ studentToken: "tok", questionId: "q1" })
    ).rejects.toThrow("질문을 찾을 수 없습니다");
  });
});

describe("answerStudentQuestion (staff)", () => {
  it("rejects non-staff roles", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "c1", role: "CONSULTANT", name: "컨" } } as never);
    await expect(
      answerStudentQuestion({ questionId: "q1", content: "풀이" })
    ).rejects.toThrow("Forbidden");
  });

  it("flips OPEN→ANSWERED, auto-claims, and resets studentReadAt", async () => {
    vi.mocked(auth).mockResolvedValue(staff as never);
    vi.mocked(prisma.studentQuestion.findUnique).mockResolvedValue({
      id: "q1",
      status: "OPEN",
      claimedById: null,
    } as never);

    await answerStudentQuestion({ questionId: "q1", content: "이렇게 푸시면 됩니다" });

    expect(prisma.questionMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ senderType: "STAFF", senderUserId: "u1", questionId: "q1" }),
      })
    );
    expect(prisma.studentQuestion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ANSWERED",
          studentReadAt: null,
          claimedById: "u1",
        }),
      })
    );
  });

  it("keeps status when not OPEN and does not steal an existing claim", async () => {
    vi.mocked(auth).mockResolvedValue(staff as never);
    vi.mocked(prisma.studentQuestion.findUnique).mockResolvedValue({
      id: "q1",
      status: "ANSWERED",
      claimedById: "u2",
    } as never);

    await answerStudentQuestion({ questionId: "q1", content: "추가 설명" });

    const call = vi.mocked(prisma.studentQuestion.update).mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.status).toBe("ANSWERED");
    expect(call.data).not.toHaveProperty("claimedById");
  });

  it("rejects an empty answer", async () => {
    vi.mocked(auth).mockResolvedValue(staff as never);
    vi.mocked(prisma.studentQuestion.findUnique).mockResolvedValue({
      id: "q1",
      status: "OPEN",
      claimedById: null,
    } as never);
    await expect(answerStudentQuestion({ questionId: "q1", content: "  " })).rejects.toThrow();
  });
});

describe("claimStudentQuestion", () => {
  it("returns the previous claimer's name when taking over someone else's claim", async () => {
    vi.mocked(auth).mockResolvedValue(staff as never);
    vi.mocked(prisma.studentQuestion.findUnique).mockResolvedValue({
      id: "q1",
      claimedBy: { id: "u2", name: "다른멘토" },
    } as never);
    vi.mocked(prisma.studentQuestion.update).mockResolvedValue({} as never);

    const res = await claimStudentQuestion({ questionId: "q1" });
    expect(res).toEqual({ ok: true, previousClaimerName: "다른멘토" });
  });

  it("returns null previousClaimerName when unclaimed or already mine", async () => {
    vi.mocked(auth).mockResolvedValue(staff as never);
    vi.mocked(prisma.studentQuestion.findUnique).mockResolvedValue({
      id: "q1",
      claimedBy: { id: "u1", name: "멘토김" },
    } as never);
    vi.mocked(prisma.studentQuestion.update).mockResolvedValue({} as never);

    const res = await claimStudentQuestion({ questionId: "q1" });
    expect(res).toEqual({ ok: true, previousClaimerName: null });
  });
});

describe("listStaffQuestionInbox", () => {
  it("rejects non-staff roles", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "m1", role: "MANAGER_MENTOR", name: "관" } } as never);
    await expect(listStaffQuestionInbox()).rejects.toThrow("Forbidden");
  });

  it("filters by OPEN status by default", async () => {
    vi.mocked(auth).mockResolvedValue(staff as never);
    vi.mocked(prisma.studentQuestion.findMany).mockResolvedValue([] as never);
    await listStaffQuestionInbox();
    expect(prisma.studentQuestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "OPEN" } })
    );
  });

  it("filters by claimer for the 'mine' filter", async () => {
    vi.mocked(auth).mockResolvedValue(staff as never);
    vi.mocked(prisma.studentQuestion.findMany).mockResolvedValue([] as never);
    await listStaffQuestionInbox({ filter: "mine" });
    expect(prisma.studentQuestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { claimedById: "u1" } })
    );
  });
});

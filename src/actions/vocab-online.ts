"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireStaff } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import { parseVocabCsv } from "@/lib/csv";
import { buildPrompt, expandExpected, isAnswerCorrect } from "@/lib/vocab-grade";
import { issueMagicLink } from "@/lib/student-auth";
import { notifySlack } from "@/lib/slack";
import type { VocabExamDirection } from "@/generated/prisma";

const ADMIN_PATH = "/vocab-test";

async function requireStaffSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  requireStaff(session.user.role);
  return session.user;
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 한 셀에 적힌 복수 뜻/철자를 배열로 (`;` `/` `,` 줄바꿈 구분). */
function splitMeaningInput(raw: string): string[] {
  return raw
    .split(/[;/,\n]+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickItemDirection(
  examDir: VocabExamDirection
): "EN_TO_KO" | "KO_TO_EN" {
  if (examDir === "MIXED") return Math.random() < 0.5 ? "EN_TO_KO" : "KO_TO_EN";
  return examDir;
}

// ─────────────────────────── 단어장 (VocabBook) ───────────────────────────

export async function createVocabBook(name: string, description?: string) {
  const user = await requireStaffSession();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("단어장 이름을 입력하세요");
  const book = await prisma.vocabBook.create({
    data: { name: trimmed, description: description?.trim() || null, createdById: user.id },
  });
  revalidatePath(ADMIN_PATH);
  return book.id;
}

export async function renameVocabBook(id: string, name: string, description?: string) {
  await requireStaffSession();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("단어장 이름을 입력하세요");
  await prisma.vocabBook.update({
    where: { id },
    data: { name: trimmed, description: description?.trim() || null },
  });
  revalidatePath(ADMIN_PATH);
}

export async function setVocabBookArchived(id: string, archived: boolean) {
  await requireStaffSession();
  await prisma.vocabBook.update({ where: { id }, data: { isArchived: archived } });
  revalidatePath(ADMIN_PATH);
}

export async function deleteVocabBook(id: string) {
  await requireStaffSession();
  const examCount = await prisma.vocabExam.count({ where: { bookId: id } });
  if (examCount > 0) {
    throw new Error("이 단어장으로 출제된 시험이 있어 삭제할 수 없습니다. 보관 처리하세요.");
  }
  await prisma.vocabBook.delete({ where: { id } });
  revalidatePath(ADMIN_PATH);
}

// ──────────────────────── 단어 항목 (VocabBookEntry) ────────────────────────

export async function getVocabBookEntries(bookId: string) {
  await requireStaffSession();
  return prisma.vocabBookEntry.findMany({
    where: { bookId },
    orderBy: { order: "asc" },
  });
}

export async function importVocabEntriesCsv(
  bookId: string,
  csvText: string,
  mode: "append" | "replace" = "append"
) {
  await requireStaffSession();
  const { rows, errors } = parseVocabCsv(csvText);
  if (rows.length === 0) {
    throw new Error(
      errors.length
        ? `가져올 단어가 없습니다: ${errors.map((e) => `${e.line ? `${e.line}행: ` : ""}${e.message}`).join(" / ")}`
        : "가져올 단어가 없습니다"
    );
  }

  let startOrder = 0;
  await prisma.$transaction(async (tx) => {
    if (mode === "replace") {
      await tx.vocabBookEntry.deleteMany({ where: { bookId } });
    } else {
      const last = await tx.vocabBookEntry.findFirst({
        where: { bookId },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      startOrder = last ? last.order + 1 : 0;
    }
    await tx.vocabBookEntry.createMany({
      data: rows.map((r, i) => ({
        bookId,
        word: r.word,
        meanings: r.meanings,
        unit: r.unit,
        partOfSpeech: r.partOfSpeech,
        example: r.example,
        order: startOrder + i,
      })),
    });
    await tx.vocabBook.update({ where: { id: bookId }, data: { updatedAt: new Date() } });
  });

  revalidatePath(ADMIN_PATH);
  return { added: rows.length, errors };
}

export async function addVocabEntry(
  bookId: string,
  input: { word: string; meaningsRaw: string; unit?: string; partOfSpeech?: string; example?: string }
) {
  await requireStaffSession();
  const word = input.word.trim();
  const meanings = splitMeaningInput(input.meaningsRaw);
  if (!word) throw new Error("영단어를 입력하세요");
  if (meanings.length === 0) throw new Error("뜻을 입력하세요");
  const last = await prisma.vocabBookEntry.findFirst({
    where: { bookId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  await prisma.vocabBookEntry.create({
    data: {
      bookId,
      word,
      meanings,
      unit: input.unit?.trim() || null,
      partOfSpeech: input.partOfSpeech?.trim() || null,
      example: input.example?.trim() || null,
      order: last ? last.order + 1 : 0,
    },
  });
  revalidatePath(ADMIN_PATH);
}

export async function updateVocabEntry(
  entryId: string,
  input: { word: string; meaningsRaw: string; unit?: string; partOfSpeech?: string; example?: string }
) {
  await requireStaffSession();
  const word = input.word.trim();
  const meanings = splitMeaningInput(input.meaningsRaw);
  if (!word) throw new Error("영단어를 입력하세요");
  if (meanings.length === 0) throw new Error("뜻을 입력하세요");
  await prisma.vocabBookEntry.update({
    where: { id: entryId },
    data: {
      word,
      meanings,
      unit: input.unit?.trim() || null,
      partOfSpeech: input.partOfSpeech?.trim() || null,
      example: input.example?.trim() || null,
    },
  });
  revalidatePath(ADMIN_PATH);
}

export async function deleteVocabEntry(entryId: string) {
  await requireStaffSession();
  await prisma.vocabBookEntry.delete({ where: { id: entryId } });
  revalidatePath(ADMIN_PATH);
}

// ─────────────────────────── 시험 출제 (VocabExam) ───────────────────────────

export type CreateVocabExamInput = {
  title: string;
  bookId: string;
  direction: VocabExamDirection;
  questionCount: number;
  perQuestionSeconds: number;
  units?: string[];
  entryIds?: string[];
  shuffle: boolean;
  studentIds: string[];
  notifyOnSlack?: boolean;
};

/** 단어 풀 크기 계산 (출제 폼 검증용). */
async function poolSize(bookId: string, units: string[], entryIds: string[]): Promise<number> {
  if (entryIds.length > 0) {
    return prisma.vocabBookEntry.count({ where: { id: { in: entryIds }, bookId } });
  }
  if (units.length > 0) {
    return prisma.vocabBookEntry.count({ where: { bookId, unit: { in: units } } });
  }
  return prisma.vocabBookEntry.count({ where: { bookId } });
}

export async function createVocabExam(input: CreateVocabExamInput) {
  const user = await requireStaffSession();
  const title = input.title.trim();
  if (!title) throw new Error("시험 이름을 입력하세요");
  if (input.studentIds.length === 0) throw new Error("대상 학생을 1명 이상 선택하세요");

  const book = await prisma.vocabBook.findUnique({ where: { id: input.bookId }, select: { id: true, name: true } });
  if (!book) throw new Error("단어장을 찾을 수 없습니다");

  const units = (input.units ?? []).filter(Boolean);
  const entryIds = (input.entryIds ?? []).filter(Boolean);
  const available = await poolSize(book.id, units, entryIds);
  if (available === 0) throw new Error("선택한 범위에 단어가 없습니다");

  const questionCount = Math.max(1, Math.min(Math.floor(input.questionCount) || 1, available));
  const perQuestionSeconds = Math.max(0, Math.min(Math.floor(input.perQuestionSeconds) || 0, 600));

  const students = await prisma.student.findMany({
    where: { id: { in: input.studentIds } },
    select: { id: true, name: true, isOnlineManaged: true },
  });

  const exam = await prisma.vocabExam.create({
    data: {
      title,
      bookId: book.id,
      direction: input.direction,
      questionCount,
      perQuestionSeconds,
      units,
      entryIds,
      shuffle: input.shuffle,
      createdById: user.id,
    },
  });

  const attempts: { studentId: string; name: string; token: string; magicLinkToken: string | null }[] = [];
  for (const s of students) {
    const attempt = await prisma.vocabAttempt.create({
      data: { examId: exam.id, studentId: s.id, assignedById: user.id, totalQuestions: questionCount },
      select: { token: true },
    });
    let magicLinkToken: string | null = null;
    if (s.isOnlineManaged) {
      const existing = await prisma.studentMagicLink.findFirst({
        where: { studentId: s.id, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { issuedAt: "desc" },
        select: { token: true },
      });
      if (existing) magicLinkToken = existing.token;
      else {
        const link = await issueMagicLink({ studentId: s.id, issuedById: user.id });
        magicLinkToken = link.token;
      }
    }
    attempts.push({ studentId: s.id, name: s.name, token: attempt.token, magicLinkToken });
  }

  if (input.notifyOnSlack) {
    notifySlack(
      `📝 영단어 시험 출제: "${title}" — 단어장 ${book.name} · ${questionCount}문항 · 대상 ${students.length}명`
    );
  }

  revalidatePath(ADMIN_PATH);
  return { examId: exam.id, attempts };
}

export async function assignExamToStudents(examId: string, studentIds: string[]) {
  const user = await requireStaffSession();
  const exam = await prisma.vocabExam.findUnique({ where: { id: examId }, select: { id: true, questionCount: true } });
  if (!exam) throw new Error("시험을 찾을 수 없습니다");
  // 이미 응시본이 있는 학생은 건너뜀
  const existing = await prisma.vocabAttempt.findMany({
    where: { examId, studentId: { in: studentIds } },
    select: { studentId: true },
  });
  const skip = new Set(existing.map((e) => e.studentId));
  const targets = studentIds.filter((id) => !skip.has(id));
  for (const studentId of targets) {
    await prisma.vocabAttempt.create({
      data: { examId, studentId, assignedById: user.id, totalQuestions: exam.questionCount },
    });
  }
  revalidatePath(ADMIN_PATH);
  return { added: targets.length, skipped: skip.size };
}

export async function cancelVocabAttempt(attemptId: string) {
  await requireStaffSession();
  const attempt = await prisma.vocabAttempt.findUnique({ where: { id: attemptId }, select: { status: true } });
  if (!attempt) throw new Error("응시 기록을 찾을 수 없습니다");
  if (attempt.status === "SUBMITTED") throw new Error("이미 제출된 응시는 취소할 수 없습니다");
  await prisma.vocabAttempt.update({ where: { id: attemptId }, data: { status: "EXPIRED" } });
  revalidatePath(ADMIN_PATH);
}

export async function reissueAttemptLink(attemptId: string) {
  await requireStaffSession();
  const updated = await prisma.vocabAttempt.update({
    where: { id: attemptId },
    data: { token: crypto.randomUUID(), status: "ASSIGNED", startedAt: null },
    select: { token: true },
  });
  // 기존 응시 문항 폐기 (재시작)
  await prisma.vocabAttemptItem.deleteMany({ where: { attemptId } });
  revalidatePath(ADMIN_PATH);
  return updated.token;
}

/** 응시의 오답 단어들로 새 시험(재시험)을 만들어 같은 학생에게 부여. */
export async function createRetakeFromAttempt(attemptId: string) {
  const user = await requireStaffSession();
  const attempt = await prisma.vocabAttempt.findUnique({
    where: { id: attemptId },
    include: { exam: true, items: { where: { isCorrect: false }, orderBy: { order: "asc" } } },
  });
  if (!attempt) throw new Error("응시 기록을 찾을 수 없습니다");
  if (attempt.status !== "SUBMITTED") throw new Error("제출 완료된 응시만 재시험을 만들 수 있습니다");
  const wrongEntryIds = [...new Set(attempt.items.map((i) => i.entryId))];
  if (wrongEntryIds.length === 0) throw new Error("오답이 없어 재시험이 필요 없습니다");

  const exam = await prisma.vocabExam.create({
    data: {
      title: `재시험: ${attempt.exam.title}`,
      bookId: attempt.exam.bookId,
      direction: attempt.exam.direction,
      questionCount: wrongEntryIds.length,
      perQuestionSeconds: attempt.exam.perQuestionSeconds,
      units: [],
      entryIds: wrongEntryIds,
      shuffle: attempt.exam.shuffle,
      retakeOfId: attempt.exam.id,
      createdById: user.id,
    },
  });
  const retake = await prisma.vocabAttempt.create({
    data: { examId: exam.id, studentId: attempt.studentId, assignedById: user.id, totalQuestions: wrongEntryIds.length },
    select: { token: true },
  });
  revalidatePath(ADMIN_PATH);
  return { examId: exam.id, token: retake.token };
}

export async function getVocabAttemptDetail(attemptId: string) {
  await requireStaffSession();
  return prisma.vocabAttempt.findUnique({
    where: { id: attemptId },
    include: {
      student: { select: { id: true, name: true, grade: true } },
      exam: { select: { id: true, title: true, direction: true, perQuestionSeconds: true } },
      items: { orderBy: { order: "asc" } },
    },
  });
}

// ───────────────────── 학생 응시 (/v/[token] 에서 호출) ─────────────────────

async function getAttemptByToken(token: string) {
  const attempt = await prisma.vocabAttempt.findUnique({
    where: { token },
    include: { exam: true },
  });
  if (!attempt) throw new Error("시험을 찾을 수 없습니다");
  if (attempt.status === "EXPIRED") throw new Error("만료되었거나 취소된 시험입니다");
  return attempt;
}

export type RunnerItem = { id: string; order: number; direction: "EN_TO_KO" | "KO_TO_EN"; prompt: string };
export type RunnerState = {
  status: "in_progress" | "submitted";
  perQuestionSeconds: number;
  examTitle: string;
  items: RunnerItem[];
  resumeFromOrder: number;
};

export async function startVocabAttempt(token: string): Promise<RunnerState> {
  const attempt = await getAttemptByToken(token);

  if (attempt.status === "SUBMITTED") {
    return { status: "submitted", perQuestionSeconds: attempt.exam.perQuestionSeconds, examTitle: attempt.exam.title, items: [], resumeFromOrder: 0 };
  }

  if (attempt.status === "ASSIGNED") {
    const exam = attempt.exam;
    // 단어 풀 결정
    let poolEntries: { id: string; word: string; meanings: string[] }[];
    if (exam.entryIds.length > 0) {
      const found = await prisma.vocabBookEntry.findMany({
        where: { id: { in: exam.entryIds }, bookId: exam.bookId },
        select: { id: true, word: true, meanings: true },
      });
      const byId = new Map(found.map((e) => [e.id, e]));
      poolEntries = exam.entryIds.map((id) => byId.get(id)).filter((e): e is NonNullable<typeof e> => !!e);
    } else if (exam.units.length > 0) {
      poolEntries = await prisma.vocabBookEntry.findMany({
        where: { bookId: exam.bookId, unit: { in: exam.units } },
        orderBy: { order: "asc" },
        select: { id: true, word: true, meanings: true },
      });
    } else {
      poolEntries = await prisma.vocabBookEntry.findMany({
        where: { bookId: exam.bookId },
        orderBy: { order: "asc" },
        select: { id: true, word: true, meanings: true },
      });
    }
    if (poolEntries.length === 0) throw new Error("출제할 단어가 없습니다");

    const n = Math.min(exam.questionCount, poolEntries.length);
    const ordered = exam.shuffle ? shuffleInPlace([...poolEntries]) : poolEntries;
    const selected = ordered.slice(0, n);

    await prisma.$transaction(async (tx) => {
      await tx.vocabAttemptItem.deleteMany({ where: { attemptId: attempt.id } });
      await tx.vocabAttemptItem.createMany({
        data: selected.map((e, i) => {
          const dir = pickItemDirection(exam.direction);
          return {
            attemptId: attempt.id,
            entryId: e.id,
            order: i,
            direction: dir,
            prompt: buildPrompt(e, dir),
            expectedAnswers: expandExpected(e, dir),
            word: e.word,
            meanings: e.meanings,
          };
        }),
      });
      await tx.vocabAttempt.update({
        where: { id: attempt.id },
        data: { status: "IN_PROGRESS", startedAt: new Date(), totalQuestions: n },
      });
    });
  }

  const items = await prisma.vocabAttemptItem.findMany({
    where: { attemptId: attempt.id },
    orderBy: { order: "asc" },
    select: { id: true, order: true, direction: true, prompt: true, answeredAt: true },
  });
  const resumeFromOrder = items.find((i) => !i.answeredAt)?.order ?? items.length;
  return {
    status: "in_progress",
    perQuestionSeconds: attempt.exam.perQuestionSeconds,
    examTitle: attempt.exam.title,
    items: items.map(({ id, order, direction, prompt }) => ({
      id,
      order,
      direction: direction === "KO_TO_EN" ? "KO_TO_EN" : "EN_TO_KO",
      prompt,
    })),
    resumeFromOrder,
  };
}

export async function submitVocabAnswer(
  token: string,
  itemId: string,
  answer: string,
  timeMs: number
) {
  const attempt = await getAttemptByToken(token);
  if (attempt.status !== "IN_PROGRESS") return; // 이미 끝났으면 무시
  const item = await prisma.vocabAttemptItem.findUnique({
    where: { id: itemId },
    select: { id: true, attemptId: true, expectedAnswers: true },
  });
  if (!item || item.attemptId !== attempt.id) throw new Error("문항을 찾을 수 없습니다");
  const trimmed = (answer ?? "").trim();
  await prisma.vocabAttemptItem.update({
    where: { id: itemId },
    data: {
      studentAnswer: trimmed,
      isCorrect: isAnswerCorrect(trimmed, item.expectedAnswers),
      timeMs: Math.max(0, Math.floor(timeMs) || 0),
      answeredAt: new Date(),
    },
  });
}

export async function finalizeVocabAttempt(token: string) {
  const attempt = await getAttemptByToken(token);
  if (attempt.status === "SUBMITTED") {
    return { score: attempt.score ?? 0, correctCount: attempt.correctCount, totalQuestions: attempt.totalQuestions };
  }
  if (attempt.status !== "IN_PROGRESS") throw new Error("시작되지 않은 시험입니다");

  const now = new Date();
  await prisma.vocabAttemptItem.updateMany({
    where: { attemptId: attempt.id, answeredAt: null },
    data: { studentAnswer: "", isCorrect: false, answeredAt: now },
  });
  const items = await prisma.vocabAttemptItem.findMany({
    where: { attemptId: attempt.id },
    select: { isCorrect: true, timeMs: true },
  });
  const total = items.length;
  const correct = items.filter((i) => i.isCorrect).length;
  const score = total > 0 ? Math.round((correct / total) * 1000) / 10 : 0;
  const durationMs = attempt.startedAt
    ? now.getTime() - attempt.startedAt.getTime()
    : items.reduce((s, i) => s + (i.timeMs ?? 0), 0);

  await prisma.vocabAttempt.update({
    where: { id: attempt.id },
    data: { status: "SUBMITTED", submittedAt: now, score, correctCount: correct, totalQuestions: total, durationMs },
  });
  revalidatePath(ADMIN_PATH);
  return { score, correctCount: correct, totalQuestions: total };
}

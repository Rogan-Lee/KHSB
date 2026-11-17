// 학생 지시 — 운영진이 학생에게 내리는 지시. 학부모 요청이 들어오면 AI 가 지시 초안을 미리 써 두고,
// 운영진이 고쳐서 보내면(승인) 학생에게 전달된다. 학부모 요청 없이 바로 보내는 지시도 같은 표.
//
// 원장 결정(2026-11-16): 학생에게는 학부모 요청이라는 사실을 보이지 않는다 → 학생용 응답은
// studentSelect·toStudentView 만 쓴다(원본 요청을 아예 읽지 않음). 학부모는 자기 요청에서 나온 지시 문장을 본다.
//
// 웹 서버 액션(src/actions/student-instructions.ts)·모바일 API·학생 웹 포털이 같은 함수를 쓴다.

import Groq from "groq-sdk";
import { z } from "zod";

import { GROQ_MODEL } from "@/lib/groq";
import { MobileApiError } from "@/lib/mobile-auth";
import { notifyAssignedStaffOfParentRequest, sendMobilePush } from "@/lib/mobile-push";
import { parseMobileBody } from "@/lib/mobile-parent-services";
import { prisma } from "@/lib/prisma";
import { INSTRUCTION_MAX_LEN, mentionsParent } from "@/lib/student-instruction-rules";

export { INSTRUCTION_MAX_LEN, mentionsParent };

/** AI 응답(JSON {"instruction": string | null})에서 초안 문장을 꺼낸다. 쓸 수 없으면 null */
export function parseAiInstruction(raw: string | null | undefined): string | null {
  const json = raw?.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  try {
    const value = (JSON.parse(json) as { instruction?: unknown }).instruction;
    if (typeof value !== "string") return null;
    const text = value.trim();
    if (!text || text.length > INSTRUCTION_MAX_LEN || mentionsParent(text)) return null;
    return text;
  } catch {
    return null;
  }
}

// ─── 보기 ─────────────────────────────────────────────────────────────

/** 학생에게 내보내도 되는 필드만 — communication(원본 학부모 요청)은 절대 넣지 않는다 */
const studentSelect = {
  id: true,
  content: true,
  sentByName: true,
  sentAt: true,
  ackedAt: true,
} as const;

type StudentRow = {
  id: string;
  content: string;
  sentByName: string | null;
  sentAt: Date | null;
  ackedAt: Date | null;
};

export function toStudentView(r: StudentRow) {
  return {
    id: r.id,
    content: r.content,
    sentByName: r.sentByName,
    sentAt: r.sentAt?.toISOString() ?? null,
    ackedAt: r.ackedAt?.toISOString() ?? null,
  };
}

export type StudentInstructionView = ReturnType<typeof toStudentView>;

const staffSelect = {
  ...studentSelect,
  createdAt: true,
  student: { select: { id: true, name: true, grade: true } },
  communication: { select: { id: true, content: true, createdAt: true, createdByName: true } },
} as const;

type StaffRow = StudentRow & {
  createdAt: Date;
  student: { id: string; name: string; grade: string };
  communication: { id: string; content: string; createdAt: Date; createdByName: string } | null;
};

function toStaffView(r: StaffRow) {
  return {
    ...toStudentView(r),
    isDraft: !r.sentAt,
    createdAt: r.createdAt.toISOString(),
    student: r.student,
    /** 학부모 요청에서 나온 지시면 원본 (운영진만 본다) */
    request: r.communication
      ? {
          id: r.communication.id,
          content: r.communication.content,
          createdAt: r.communication.createdAt.toISOString(),
          createdByName: r.communication.createdByName,
        }
      : null,
  };
}

export type StaffInstructionView = ReturnType<typeof toStaffView>;

/**
 * 운영진 받은함 — pending: 아직 처리 안 한 학부모 요청(+AI 초안), sent: 최근 보낸 지시(학생 확인 여부).
 * pending 기준은 기존 "확인" 체크(isChecked=false)와 같다 — 입퇴실 화면·주의 목록과 숫자가 맞는다.
 */
export async function getInstructionInbox() {
  const [requests, sent] = await Promise.all([
    prisma.communication.findMany({
      where: { type: "PARENT_REQUEST", isChecked: false, student: { status: "ACTIVE" } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        content: true,
        createdAt: true,
        createdByName: true,
        student: { select: { id: true, name: true, grade: true } },
        instructions: {
          where: { sentAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, content: true },
        },
      },
    }),
    prisma.studentInstruction.findMany({
      where: { sentAt: { not: null } },
      orderBy: { sentAt: "desc" },
      take: 100,
      select: staffSelect,
    }),
  ]);
  return {
    pending: requests.map((r) => ({
      id: r.id,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
      createdByName: r.createdByName,
      student: r.student,
      draft: r.instructions[0] ?? null,
    })),
    sent: sent.map(toStaffView),
  };
}

export type InstructionInbox = Awaited<ReturnType<typeof getInstructionInbox>>;

/** 학생 한 명의 보낸 지시 기록 — 학생 상세·멘토링 화면 (초안은 받은함에서만 다룬다) */
export async function getStudentInstructionsForStaff(studentId: string) {
  const rows = await prisma.studentInstruction.findMany({
    where: { studentId, sentAt: { not: null } },
    orderBy: { sentAt: "desc" },
    take: 30,
    select: staffSelect,
  });
  return rows.map(toStaffView);
}

/** 학생 본인 — 받은 지시 (최신순) */
export async function listInstructionsForStudent(studentId: string) {
  const rows = await prisma.studentInstruction.findMany({
    where: { studentId, sentAt: { not: null } },
    orderBy: { sentAt: "desc" },
    take: 30,
    select: studentSelect,
  });
  const items = rows.map(toStudentView);
  return { items, unacked: items.filter((i) => !i.ackedAt).length };
}

export async function countUnackedInstructions(studentId: string) {
  return prisma.studentInstruction.count({
    where: { studentId, sentAt: { not: null }, ackedAt: null },
  });
}

/** 받은함 배지 — 처리 안 한 학부모 요청 수 (getInstructionInbox 의 pending 과 같은 기준) */
export function countPendingParentRequests() {
  return prisma.communication.count({
    where: { type: "PARENT_REQUEST", isChecked: false, student: { status: "ACTIVE" } },
  });
}

// ─── 보내기 · 확인 ────────────────────────────────────────────────────

const sendSchema = z.object({
  studentId: z.string().min(1, "학생을 골라 주세요"),
  content: z
    .string()
    .trim()
    .min(2, "지시 내용을 적어 주세요")
    .max(INSTRUCTION_MAX_LEN, `지시는 ${INSTRUCTION_MAX_LEN}자까지 쓸 수 있어요`),
  /** 학부모 요청(Communication.id)에서 나온 지시면 */
  requestId: z.string().min(1).optional(),
  /** AI 초안을 고쳐 보내면 그 초안 id */
  draftId: z.string().min(1).optional(),
});

export type InstructionPush = {
  studentId: string;
  content: string;
  sentByName: string;
  /** 요청을 남긴 학부모 AuthUser.id — 운영진이 대신 적은 요청이면 학부모 연결이 없어 푸시가 안 간다 */
  requesterId: string | null;
};

/**
 * 지시 보내기 — 초안 승인(draftId) 또는 새 지시. 학부모 요청에서 나왔으면 그 요청을 확인 처리하고
 * 남은 초안을 지운다. 푸시는 반환값을 라우트·액션이 after() 로 sendInstructionPushes 에 넘긴다.
 */
export async function sendInstruction(staff: { id: string; name?: string | null }, input: unknown) {
  const body = parseMobileBody(sendSchema, input);
  const student = await prisma.student.findUnique({
    where: { id: body.studentId },
    select: { id: true },
  });
  if (!student) throw new MobileApiError("학생을 찾을 수 없습니다", 404);

  let requestId = body.requestId ?? null;
  if (body.draftId) {
    const draft = await prisma.studentInstruction.findFirst({
      where: { id: body.draftId, studentId: student.id, sentAt: null },
      select: { communicationId: true },
    });
    if (!draft) throw new MobileApiError("이미 보냈거나 지운 초안이에요", 409);
    requestId ??= draft.communicationId;
  }
  const request = requestId
    ? await prisma.communication.findFirst({
        where: { id: requestId, studentId: student.id, type: "PARENT_REQUEST" },
        select: { createdById: true },
      })
    : null;
  if (requestId && !request) throw new MobileApiError("학부모 요청을 찾을 수 없습니다", 404);

  const now = new Date();
  const sentByName = staff.name?.trim() || "운영진";
  const data = {
    content: body.content,
    communicationId: requestId,
    sentAt: now,
    sentById: staff.id,
    sentByName,
  };
  const [row] = await prisma.$transaction([
    body.draftId
      ? prisma.studentInstruction.update({ where: { id: body.draftId }, data, select: staffSelect })
      : prisma.studentInstruction.create({
          data: { ...data, studentId: student.id },
          select: staffSelect,
        }),
    ...(requestId
      ? [
          prisma.communication.updateMany({
            where: { id: requestId, isChecked: false },
            data: { isChecked: true, checkedAt: now },
          }),
          prisma.studentInstruction.deleteMany({ where: { communicationId: requestId, sentAt: null } }),
        ]
      : []),
  ]);

  const push: InstructionPush = {
    studentId: student.id,
    content: body.content,
    sentByName,
    requesterId: request?.createdById ?? null,
  };
  return { item: toStaffView(row), push };
}

/** 학생(지시 내용을 알림 본문에 담아 구버전 앱에서도 읽히게) + 요청한 학부모에게 푸시. 실패해도 던지지 않는다 */
export async function sendInstructionPushes(push: InstructionPush) {
  try {
    const [studentUser, parentLink] = await Promise.all([
      prisma.authUser.findUnique({ where: { studentId: push.studentId }, select: { id: true } }),
      push.requesterId
        ? prisma.parentLink.findUnique({
            where: { authUserId_studentId: { authUserId: push.requesterId, studentId: push.studentId } },
            select: { authUserId: true },
          })
        : null,
    ]);
    const body = push.content.slice(0, 150);
    await Promise.all([
      studentUser &&
        sendMobilePush({
          authUserIds: [studentUser.id],
          title: `${push.sentByName} 선생님의 지시`,
          body,
          category: "SYSTEM",
          data: { url: "/(student)/instructions" },
        }),
      parentLink &&
        sendMobilePush({
          authUserIds: [parentLink.authUserId],
          title: "요청하신 내용을 학생에게 전달했어요",
          body,
          category: "SYSTEM",
          data: { url: "/(parent)/inquiries", audience: "parent", studentId: push.studentId },
        }),
    ]);
  } catch (error) {
    console.error("[instruction push]", error);
  }
}

/** 학생이 [확인했어요] — 본인 지시만, 여러 번 눌러도 처음 시각 유지 */
export async function ackInstruction(studentId: string, id: string) {
  const { count } = await prisma.studentInstruction.updateMany({
    where: { id, studentId, sentAt: { not: null }, ackedAt: null },
    data: { ackedAt: new Date() },
  });
  if (count === 0) {
    const exists = await prisma.studentInstruction.findFirst({
      where: { id, studentId, sentAt: { not: null } },
      select: { id: true },
    });
    if (!exists) throw new MobileApiError("지시를 찾을 수 없습니다", 404);
  }
  return { ok: true as const };
}

/** AI 초안 버리기 — 보낸 지시는 지울 수 없다 (학생·학부모가 이미 본 기록) */
export async function discardInstructionDraft(id: string) {
  const { count } = await prisma.studentInstruction.deleteMany({ where: { id, sentAt: null } });
  if (count === 0) throw new MobileApiError("초안을 찾을 수 없습니다", 404);
  return { ok: true as const };
}

// ─── AI 초안 ──────────────────────────────────────────────────────────

const DRAFT_PROMPT = `너는 관리형 독서실 "강한선배"의 운영조교다. 학생들은 학교가 끝나면 독서실에 와서 자습하고, 운영진(조교·멘토)이 플래너·휴대폰 수거·순공 시간을 관리한다. 학부모가 남긴 요청을 읽고, 조교가 학생에게 직접 건넬 지시를 쓴다.

[규칙]
- 학생은 이 지시가 학부모 요청에서 나왔다는 걸 몰라야 한다. 부모님·어머니·아버지·학부모·보호자 같은 말이나 요청에만 나오는 집안 사정을 쓰지 않는다. 조교가 직접 보고 판단한 것처럼 쓴다.
- 독서실 안에서 할 행동을 쓴다. 학교 수업·방과후·등교·교실 같은 말은 쓰지 않는다.
- 시간·분량·시각 같은 숫자는 요청에 있을 때만 쓴다. 없으면 행동을 구체적으로 쓰고 양은 "지금보다 조금 더"처럼 둔다 (운영진이 고쳐서 보낸다).
- 해요체, 다정하지만 단호하게. 1~2문장, 100자 이내. 이모지와 한자는 쓰지 않는다.
- 학생에게 시킬 공부나 생활 습관이 없는 요청이면 null: 상담 신청, 결석·지각·조퇴·외출 연락, 병원·가족 일정, 수강료·결제·행정, 시설·도시락 문의, 단순 질문.

[예시]
요청: [학습] 영어 단어를 너무 안 외우는 것 같아요
{"instruction": "이번 주부터 자습 시작할 때 영어 단어부터 외우고, 끝나기 전에 스스로 시험 봐서 플래너에 점수를 적어 주세요."}
요청: [출결] 금요일에 가족 행사가 있어서 쉽니다
{"instruction": null}

[출력]
JSON 하나만: {"instruction": "지시 문장"} 또는 {"instruction": null}`;

// 처리방침 2026-11-24 시행분부터 학부모 요청을 Groq 로 보낸다고 알렸다 — 그 전에는 초안을 만들지 않는다.
// ponytail: 날짜가 지나면 이 상수와 검사를 지워도 된다
const AI_DRAFT_FROM = Date.parse("2026-11-24T00:00:00+09:00");

async function askAiForInstruction(requestText: string, grade: string) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  try {
    // 학생 이름은 보내지 않는다 — 문장에 필요 없음
    const result = await new Groq({ apiKey }).chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: DRAFT_PROMPT },
        { role: "user", content: `학년: ${grade || "모름"}\n학부모 요청: ${requestText}` },
      ],
    });
    return parseAiInstruction(result.choices[0]?.message?.content);
  } catch (error) {
    console.error("[instruction draft]", error);
    return null;
  }
}

/**
 * 학부모 요청 하나로 지시 초안을 만든다. 이미 초안·보낸 지시가 있으면 건너뛴다(force 면 초안만 새로 만든다).
 * AI 가 시킬 일이 없다고 보거나 실패하면 null.
 */
export async function draftInstructionFromRequest(requestId: string, opts: { force?: boolean } = {}) {
  const request = await prisma.communication.findFirst({
    where: { id: requestId, type: "PARENT_REQUEST" },
    select: {
      id: true,
      content: true,
      studentId: true,
      student: { select: { grade: true } },
      instructions: { select: { sentAt: true } },
    },
  });
  if (!request) throw new MobileApiError("학부모 요청을 찾을 수 없습니다", 404);
  if (Date.now() < AI_DRAFT_FROM) {
    if (opts.force) throw new MobileApiError("AI 초안은 11월 24일부터 쓸 수 있어요. 직접 적어 주세요", 422);
    return null;
  }
  const hasSent = request.instructions.some((i) => i.sentAt);
  if (hasSent || (!opts.force && request.instructions.length > 0)) return null;

  const content = await askAiForInstruction(request.content, request.student.grade);
  if (!content) return null;
  const [, draft] = await prisma.$transaction([
    prisma.studentInstruction.deleteMany({ where: { communicationId: request.id, sentAt: null } }),
    prisma.studentInstruction.create({
      data: { studentId: request.studentId, communicationId: request.id, content },
      select: { id: true, content: true },
    }),
  ]);
  return draft;
}

/**
 * 새 학부모 요청 뒤처리 — AI 초안을 먼저 만들어 두고 담당 운영진(담임 멘토·운영조교, 없으면 원장급)에게 푸시.
 * 학부모 앱·운영진이 대신 적은 요청 모두 라우트·서버 액션이 after() 로 부른다.
 */
export async function afterParentRequestCreated(requestId: string) {
  try {
    const request = await prisma.communication.findUnique({
      where: { id: requestId },
      select: { type: true, studentId: true, content: true, student: { select: { name: true } } },
    });
    if (request?.type !== "PARENT_REQUEST") return;
    const draft = await draftInstructionFromRequest(requestId).catch(() => null);
    await notifyAssignedStaffOfParentRequest({
      studentId: request.studentId,
      studentName: request.student.name,
      content: request.content,
      hasDraft: !!draft,
    });
  } catch (error) {
    console.error("[parent request]", error);
  }
}

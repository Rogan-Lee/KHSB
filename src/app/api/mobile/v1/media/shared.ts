import crypto from "node:crypto";

import type { getAuthIdentity } from "@/lib/auth";
import { isAnyStaff, isStaff } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

// 모바일 미디어 업로드 공용 규칙 — route.ts(서버 경유 업로드)와
// client-token/route.ts(blob 직접 업로드 토큰 발급)가 함께 사용한다.

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  ...ALLOWED_IMAGE_MIME_TYPES,
  "application/msword",
  "application/octet-stream",
  "application/pdf",
  "application/vnd.hancom.hwp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/x-hwp",
  "application/zip",
  "application/x-zip-compressed",
  // Video
  "video/mp4",
  "video/quicktime",
  "video/webm",
  // PowerPoint
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Excel
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export const ALLOWED_DOCUMENT_EXTENSIONS = new Set([
  "doc",
  "docx",
  "gif",
  "heic",
  "heif",
  "hwp",
  "hwpx",
  "jpeg",
  "jpg",
  "mov",
  "mp4",
  "pdf",
  "png",
  "ppt",
  "pptx",
  "webp",
  "webm",
  "xls",
  "xlsx",
  "zip",
]);

// KDA 는 운영 종료 — 신규 업로드 차단 (과거 데이터는 표시 유지)
const MENTORING_TAGS = new Set(["EXTRA", "FREE"]);

export function safeName(filename: string) {
  return filename
    .replace(/[\\/]/g, "_")
    .replace(/\.\./g, "_")
    .slice(0, 160);
}

export function extension(filename: string) {
  return filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
}

export function buildBlobKey(prefix: string, filename: string) {
  return `${prefix}/${crypto.randomUUID()}-${safeName(filename)}`;
}

export type MobileMediaContext =
  | "question"
  | "mentoring"
  | "task"
  | "feedback"
  | "chat";

export function isMobileMediaContext(
  value: unknown,
): value is MobileMediaContext {
  return (
    value === "question" ||
    value === "mentoring" ||
    value === "task" ||
    value === "feedback" ||
    value === "chat"
  );
}

type Identity = NonNullable<
  Awaited<ReturnType<typeof getAuthIdentity>>
>["identity"];

export type MediaUploadRefs = {
  taskId?: string;
  submissionId?: string;
  chatId?: string;
  mentoringId?: string;
  tag?: string;
};

export type MediaUploadAuth =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      prefix: string;
      mentoring: { id: string; mentorId: string; studentId: string } | null;
      mentoringTag: string;
    };

/** 컨텍스트별 인가 + blob 경로 prefix 산출. route.ts 의 기존 로직을 그대로 옮긴 것. */
export async function authorizeMediaUpload(
  identity: Identity,
  context: MobileMediaContext,
  refs: MediaUploadRefs,
): Promise<MediaUploadAuth> {
  const appUser = identity.appUser;
  const student = identity.student;

  if (context === "question") {
    const validStudent = student?.status === "ACTIVE";
    const validStaff = appUser?.status === "ACTIVE" && isStaff(appUser.role);
    if (!validStudent && !validStaff) {
      return { ok: false, status: 403, error: "권한이 없습니다" };
    }
    return {
      ok: true,
      prefix: "student-questions/incoming",
      mentoring: null,
      mentoringTag: "FREE",
    };
  }

  if (context === "task") {
    if (!student || student.status !== "ACTIVE") {
      return { ok: false, status: 403, error: "학생 권한이 필요합니다" };
    }
    if (!refs.taskId) {
      return { ok: false, status: 400, error: "수행평가를 확인하세요" };
    }
    const task = await prisma.performanceTask.findFirst({
      where: { id: refs.taskId, studentId: student.id },
      select: { id: true },
    });
    if (!task) {
      return { ok: false, status: 404, error: "수행평가를 찾을 수 없습니다" };
    }
    return {
      ok: true,
      prefix: `online/tasks/${task.id}`,
      mentoring: null,
      mentoringTag: "FREE",
    };
  }

  if (context === "feedback") {
    if (
      !appUser ||
      appUser.status !== "ACTIVE" ||
      !["SUPER_ADMIN", "DIRECTOR", "CONSULTANT"].includes(appUser.role)
    ) {
      return {
        ok: false,
        status: 403,
        error: "수행평가 피드백 권한이 필요합니다",
      };
    }
    if (!refs.submissionId) {
      return { ok: false, status: 400, error: "제출물을 확인하세요" };
    }
    const submission = await prisma.taskSubmission.findUnique({
      where: { id: refs.submissionId },
      select: { id: true },
    });
    if (!submission) {
      return { ok: false, status: 404, error: "제출물을 찾을 수 없습니다" };
    }
    return {
      ok: true,
      prefix: `online/feedback/${submission.id}`,
      mentoring: null,
      mentoringTag: "FREE",
    };
  }

  if (context === "chat") {
    const validStudent = student?.status === "ACTIVE";
    // 채팅 상대는 온라인 담당자(컨설턴트·관리 멘토)도 포함 — 방 소유권으로 최종 판정
    const validStaff = appUser?.status === "ACTIVE" && isAnyStaff(appUser.role);
    if (!validStudent && !validStaff) {
      return { ok: false, status: 403, error: "권한이 없습니다" };
    }
    if (!refs.chatId) {
      return { ok: false, status: 400, error: "채팅방을 확인하세요" };
    }
    const chat = await prisma.portalChat.findUnique({
      where: { id: refs.chatId },
      select: { id: true, studentId: true, staffId: true },
    });
    if (!chat) {
      return { ok: false, status: 404, error: "채팅방을 찾을 수 없습니다" };
    }
    const owned = validStudent
      ? chat.studentId === student!.id
      : chat.staffId === appUser!.id;
    if (!owned) {
      return {
        ok: false,
        status: 403,
        error: "이 채팅방에 파일을 보낼 수 없습니다",
      };
    }
    return {
      ok: true,
      prefix: `portal-chat/${chat.id}`,
      mentoring: null,
      mentoringTag: "FREE",
    };
  }

  // context === "mentoring"
  if (!appUser || appUser.status !== "ACTIVE" || !isStaff(appUser.role)) {
    return { ok: false, status: 403, error: "권한이 없습니다" };
  }
  if (!refs.mentoringId) {
    return { ok: false, status: 400, error: "멘토링 기록을 확인하세요" };
  }
  const mentoringTag =
    refs.tag && MENTORING_TAGS.has(refs.tag) ? refs.tag : "FREE";
  const mentoring = await prisma.mentoring.findUnique({
    where: { id: refs.mentoringId },
    select: { id: true, mentorId: true, studentId: true },
  });
  if (!mentoring) {
    return { ok: false, status: 404, error: "멘토링을 찾을 수 없습니다" };
  }
  if (appUser.role === "MENTOR" && mentoring.mentorId !== appUser.id) {
    return {
      ok: false,
      status: 403,
      error: "이 멘토링에 사진을 추가할 수 없습니다",
    };
  }
  return {
    ok: true,
    prefix: `mentoring/${mentoring.id}`,
    mentoring,
    mentoringTag,
  };
}

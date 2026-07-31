import { put } from "@vercel/blob";
import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import crypto from "node:crypto";

import { getAuthIdentity } from "@/lib/auth";
import { isStaff } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  ...ALLOWED_IMAGE_MIME_TYPES,
  "application/msword",
  "application/octet-stream",
  "application/pdf",
  "application/vnd.hancom.hwp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/x-hwp",
  "application/zip",
  "application/x-zip-compressed",
  // PowerPoint
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Excel
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const ALLOWED_DOCUMENT_EXTENSIONS = new Set([
  "doc",
  "docx",
  "gif",
  "heic",
  "heif",
  "hwp",
  "hwpx",
  "jpeg",
  "jpg",
  "pdf",
  "png",
  "ppt",
  "pptx",
  "webp",
  "xls",
  "xlsx",
  "zip",
]);
const MENTORING_TAGS = new Set(["KDA", "EXTRA", "FREE"]);

function safeName(filename: string) {
  return filename
    .replace(/[\\/]/g, "_")
    .replace(/\.\./g, "_")
    .slice(0, 160);
}

function extension(filename: string) {
  return filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
}

export async function POST(request: NextRequest) {
  const current = await getAuthIdentity(request.headers);
  if (!current) {
    return Response.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "잘못된 요청 형식" }, { status: 400 });
  }

  const file = formData.get("file");
  const context = formData.get("context");
  if (!(file instanceof File)) {
    return Response.json({ error: "파일을 선택하세요" }, { status: 400 });
  }
  if (
    context !== "question" &&
    context !== "mentoring" &&
    context !== "task" &&
    context !== "feedback" &&
    context !== "chat"
  ) {
    return Response.json({ error: "업로드 용도를 확인하세요" }, { status: 400 });
  }
  const isDocumentContext =
    context === "task" ||
    context === "feedback" ||
    context === "chat" ||
    context === "question";
  const maxFileSize = isDocumentContext ? MAX_DOCUMENT_SIZE : MAX_IMAGE_SIZE;
  if (file.size > maxFileSize) {
    return Response.json(
      {
        error: isDocumentContext
          ? "파일은 개당 50MB 이하여야 합니다"
          : "사진은 장당 10MB 이하여야 합니다",
      },
      { status: 413 },
    );
  }
  const allowedType = isDocumentContext
    ? ALLOWED_DOCUMENT_MIME_TYPES.has(file.type) ||
      ALLOWED_DOCUMENT_EXTENSIONS.has(extension(file.name))
    : ALLOWED_IMAGE_MIME_TYPES.has(file.type);
  if (!allowedType) {
    return Response.json(
      {
        error: isDocumentContext
          ? "PDF, 이미지, DOCX, HWP, PPT, XLSX, ZIP 파일만 업로드할 수 있습니다"
          : "JPG, PNG, WEBP, GIF, HEIC 사진만 업로드할 수 있습니다",
      },
      { status: 415 },
    );
  }

  const appUser = current.identity.appUser;
  const student = current.identity.student;
  if (context === "question") {
    const validStudent = student?.status === "ACTIVE";
    const validStaff =
      appUser?.status === "ACTIVE" && isStaff(appUser.role);
    if (!validStudent && !validStaff) {
      return Response.json({ error: "권한이 없습니다" }, { status: 403 });
    }
  }

  let taskId: string | null = null;
  if (context === "task") {
    if (!student || student.status !== "ACTIVE") {
      return Response.json({ error: "학생 권한이 필요합니다" }, { status: 403 });
    }
    const rawTaskId = formData.get("taskId");
    if (typeof rawTaskId !== "string" || !rawTaskId) {
      return Response.json({ error: "수행평가를 확인하세요" }, { status: 400 });
    }
    const task = await prisma.performanceTask.findFirst({
      where: { id: rawTaskId, studentId: student.id },
      select: { id: true },
    });
    if (!task) {
      return Response.json(
        { error: "수행평가를 찾을 수 없습니다" },
        { status: 404 },
      );
    }
    taskId = task.id;
  }

  let submissionId: string | null = null;
  if (context === "feedback") {
    if (
      !appUser ||
      appUser.status !== "ACTIVE" ||
      !["SUPER_ADMIN", "DIRECTOR", "CONSULTANT"].includes(appUser.role)
    ) {
      return Response.json(
        { error: "수행평가 피드백 권한이 필요합니다" },
        { status: 403 },
      );
    }
    const rawSubmissionId = formData.get("submissionId");
    if (typeof rawSubmissionId !== "string" || !rawSubmissionId) {
      return Response.json({ error: "제출물을 확인하세요" }, { status: 400 });
    }
    const submission = await prisma.taskSubmission.findUnique({
      where: { id: rawSubmissionId },
      select: { id: true },
    });
    if (!submission) {
      return Response.json(
        { error: "제출물을 찾을 수 없습니다" },
        { status: 404 },
      );
    }
    submissionId = submission.id;
  }

  let chatId: string | null = null;
  if (context === "chat") {
    const validStudent = student?.status === "ACTIVE";
    const validStaff = appUser?.status === "ACTIVE" && isStaff(appUser.role);
    if (!validStudent && !validStaff) {
      return Response.json({ error: "권한이 없습니다" }, { status: 403 });
    }
    const rawChatId = formData.get("chatId");
    if (typeof rawChatId !== "string" || !rawChatId) {
      return Response.json({ error: "채팅방을 확인하세요" }, { status: 400 });
    }
    const chat = await prisma.portalChat.findUnique({
      where: { id: rawChatId },
      select: { id: true, studentId: true, staffId: true },
    });
    if (!chat) {
      return Response.json({ error: "채팅방을 찾을 수 없습니다" }, { status: 404 });
    }
    const owned = validStudent
      ? chat.studentId === student!.id
      : chat.staffId === appUser!.id;
    if (!owned) {
      return Response.json({ error: "이 채팅방에 파일을 보낼 수 없습니다" }, { status: 403 });
    }
    chatId = chat.id;
  }

  let mentoring:
    | { id: string; mentorId: string; studentId: string }
    | null = null;
  let mentoringTag = "FREE";
  if (context === "mentoring") {
    if (
      !appUser ||
      appUser.status !== "ACTIVE" ||
      !isStaff(appUser.role)
    ) {
      return Response.json({ error: "권한이 없습니다" }, { status: 403 });
    }
    const mentoringId = formData.get("mentoringId");
    const tag = formData.get("tag");
    if (typeof mentoringId !== "string" || !mentoringId) {
      return Response.json(
        { error: "멘토링 기록을 확인하세요" },
        { status: 400 },
      );
    }
    if (typeof tag === "string" && MENTORING_TAGS.has(tag)) {
      mentoringTag = tag;
    }
    mentoring = await prisma.mentoring.findUnique({
      where: { id: mentoringId },
      select: { id: true, mentorId: true, studentId: true },
    });
    if (!mentoring) {
      return Response.json(
        { error: "멘토링을 찾을 수 없습니다" },
        { status: 404 },
      );
    }
    if (appUser.role === "MENTOR" && mentoring.mentorId !== appUser.id) {
      return Response.json(
        { error: "이 멘토링에 사진을 추가할 수 없습니다" },
        { status: 403 },
      );
    }
  }

  const prefix =
    context === "mentoring" && mentoring
      ? `mentoring/${mentoring.id}`
      : context === "task" && taskId
        ? `online/tasks/${taskId}`
        : context === "feedback" && submissionId
          ? `online/feedback/${submissionId}`
          : context === "chat" && chatId
            ? `portal-chat/${chatId}`
            : "student-questions/incoming";
  const blobKey = `${prefix}/${crypto.randomUUID()}-${safeName(file.name)}`;

  try {
    const blob = await put(blobKey, file, {
      access: "public",
      addRandomSuffix: false,
      contentType: file.type,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const attachment = {
      mimeType: file.type,
      name: file.name,
      sizeBytes: file.size,
      url: blob.url,
    };

    if (context === "mentoring" && mentoring && appUser) {
      const photo = await prisma.photo.create({
        data: {
          fileName: file.name,
          folderId: null,
          mentoringId: mentoring.id,
          mentoringTag,
          mimeType: file.type,
          sizeBytes: file.size,
          studentId: mentoring.studentId,
          uploadedById: appUser.id,
          uploadedByName: appUser.name || "알 수 없음",
          url: blob.url,
        },
        select: { id: true },
      });
      revalidatePath("/photos");
      revalidatePath(`/mentoring/${mentoring.id}`);
      return Response.json({ ...attachment, id: photo.id });
    }

    return Response.json(attachment);
  } catch (error) {
    console.error("[mobile-media]", error);
    return Response.json({ error: "사진 업로드에 실패했습니다" }, { status: 500 });
  }
}

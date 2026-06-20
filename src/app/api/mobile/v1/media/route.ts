import { put } from "@vercel/blob";
import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import crypto from "node:crypto";

import { getAuthIdentity } from "@/lib/auth";
import { isStaff } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const MENTORING_TAGS = new Set(["KDA", "EXTRA", "FREE"]);

function safeName(filename: string) {
  return filename
    .replace(/[\\/]/g, "_")
    .replace(/\.\./g, "_")
    .slice(0, 160);
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
    return Response.json({ error: "사진을 선택하세요" }, { status: 400 });
  }
  if (context !== "question" && context !== "mentoring") {
    return Response.json({ error: "업로드 용도를 확인하세요" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return Response.json(
      { error: "사진은 장당 10MB 이하여야 합니다" },
      { status: 413 },
    );
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return Response.json(
      { error: "JPG, PNG, WEBP, GIF, HEIC 사진만 업로드할 수 있습니다" },
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

import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isStaff } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import crypto from "node:crypto";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIME_TYPES = new Set<string>([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const ALLOWED_TAGS = new Set<string>(["KDA", "EXTRA", "FREE"]);

function safeName(filename: string): string {
  return filename
    .replace(/[\\/]/g, "_")
    .replace(/\.\./g, "_")
    .slice(0, 200);
}

/**
 * 오프라인 멘토링 기록 첨부 사진 업로드 (Sprint 5 PR 5.1 이식).
 *
 * multipart/form-data:
 * - file: 이미지 파일 (≤10MB, png/jpg/jpeg/webp/gif)
 * - mentoringId: Mentoring.id
 * - tag: "KDA" | "EXTRA" | "FREE"
 *
 * 응답: { url, mimeType, fileName, sizeBytes }
 *
 * 인증: 스태프 (SUPER_ADMIN/DIRECTOR/HEAD_MENTOR/MENTOR/STAFF)
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !isStaff(session.user.role)) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식" }, { status: 400 });
  }

  const file = formData.get("file");
  const mentoringId = formData.get("mentoringId");
  const tag = formData.get("tag");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일이 누락되었습니다" }, { status: 400 });
  }
  if (typeof mentoringId !== "string" || !mentoringId) {
    return NextResponse.json(
      { error: "mentoringId 가 필요합니다" },
      { status: 400 }
    );
  }
  if (typeof tag !== "string" || !ALLOWED_TAGS.has(tag)) {
    return NextResponse.json({ error: "tag 가 올바르지 않습니다" }, { status: 400 });
  }

  // 멘토링 기록 존재 검증 (외래키 정합성 + 권한 게이트 추가 레이어)
  const target = await prisma.mentoring.findUnique({
    where: { id: mentoringId },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json(
      { error: "멘토링 기록을 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "파일 크기는 10MB 이하여야 합니다" },
      { status: 413 }
    );
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "이미지 파일만 업로드할 수 있습니다 (PNG/JPG/JPEG/WEBP/GIF)" },
      { status: 415 }
    );
  }

  const blobKey = `mentoring/${mentoringId}/${crypto.randomUUID()}-${safeName(file.name)}`;

  try {
    const blob = await put(blobKey, file, {
      access: "public",
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType: file.type,
    });
    return NextResponse.json({
      url: blob.url,
      mimeType: file.type,
      fileName: file.name,
      sizeBytes: file.size,
    });
  } catch (err) {
    console.error("[upload/mentoring] blob put failed", err);
    return NextResponse.json({ error: "업로드 실패" }, { status: 500 });
  }
}

// Sprint 5 PR 5.1 — MentoringSession KDA/EXTRA/FREE 사진 업로드 엔드포인트.
// POST multipart/form-data: { file, sessionId, tag }
// 1) Staff 권한 + 세션 존재 확인
// 2) MIME / 사이즈 검증 (10MB, image+pdf)
// 3) Vercel Blob 에 mentoring-sessions/{sessionId}/{uuid}-{filename} 으로 put
// 4) { url, fileName, mimeType, sizeBytes } 반환
// DB row 기록은 클라이언트가 attachSessionPhoto server action 으로 후속 호출.

import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import crypto from "node:crypto";
import { auth } from "@/lib/auth";
import { isStaff } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const ALLOWED_MIMES = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "application/pdf",
]);

function safeName(filename: string): string {
  return filename
    .replace(/[\\/]/g, "_")
    .replace(/\.\./g, "_")
    .slice(0, 200);
}

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
  const sessionId = formData.get("sessionId");
  const tag = formData.get("tag");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일이 누락되었습니다" }, { status: 400 });
  }
  if (typeof sessionId !== "string" || !sessionId) {
    return NextResponse.json({ error: "sessionId 가 필요합니다" }, { status: 400 });
  }
  if (typeof tag !== "string" || !["KDA", "EXTRA", "FREE"].includes(tag)) {
    return NextResponse.json(
      { error: "tag 는 KDA / EXTRA / FREE 중 하나여야 합니다" },
      { status: 400 }
    );
  }

  // 세션 존재 확인 (route 단계에서 가드 — 잘못된 sessionId 로 blob 만 쌓이는 것 방지)
  const target = await prisma.mentoringSession.findUnique({
    where: { id: sessionId },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json({ error: "세션을 찾을 수 없습니다" }, { status: 404 });
  }

  // 사이즈 / 타입 검증
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `파일 크기는 ${MAX_FILE_SIZE_MB}MB 이하여야 합니다` },
      { status: 413 }
    );
  }
  const mime = file.type || "";
  if (!ALLOWED_MIMES.has(mime)) {
    return NextResponse.json(
      { error: "이미지(PNG/JPEG/WebP) 또는 PDF 만 업로드할 수 있습니다" },
      { status: 415 }
    );
  }

  const filename = safeName(file.name);
  const key = `mentoring-sessions/${sessionId}/${crypto.randomUUID()}-${filename}`;

  try {
    const blob = await put(key, file, {
      access: "public",
      addRandomSuffix: false,
      contentType: mime,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return NextResponse.json({
      url: blob.url,
      fileName: file.name,
      mimeType: mime,
      sizeBytes: file.size,
    });
  } catch (err) {
    console.error("[mentoring-session upload] blob put failed", err);
    return NextResponse.json({ error: "업로드 실패" }, { status: 500 });
  }
}

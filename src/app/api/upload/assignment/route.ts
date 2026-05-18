import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { requireStaff } from "@/lib/roles";
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

// 과제 첨부 허용 mime: pdf, png, jpg/jpeg, hwp, docx
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/x-hwp",
  "application/haansofthwp",
  "application/vnd.hancom.hwp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
];

// 확장자 기반 fallback (hwp는 브라우저가 mime을 비워서 보낼 때가 잦음)
const ALLOWED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "hwp", "docx"];

function sanitizeFileName(name: string): string {
  // 경로 분리자, 제어문자 제거
  return name.replace(/[\\/\x00-\x1f]/g, "_").slice(0, 200) || "file";
}

function getExtension(name: string): string {
  const m = name.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : "";
}

export async function POST(request: NextRequest) {
  const session = await auth();
  try {
    requireStaff(session?.user?.role);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const assignmentId = (formData.get("assignmentId") as string | null)?.trim() ?? "";

  if (!file) {
    return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
  }
  if (!assignmentId) {
    return NextResponse.json({ error: "assignmentId가 필요합니다" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "파일 크기는 20MB를 초과할 수 없습니다" },
      { status: 413 }
    );
  }

  const ext = getExtension(file.name);
  const mimeOk = ALLOWED_MIME_TYPES.includes(file.type);
  const extOk = ALLOWED_EXTENSIONS.includes(ext);
  if (!mimeOk && !extOk) {
    return NextResponse.json(
      { error: "허용되지 않은 파일 형식입니다 (PDF, PNG, JPG, HWP, DOCX)" },
      { status: 400 }
    );
  }

  const safeName = sanitizeFileName(file.name);
  const key = `assignments/${assignmentId}/${crypto.randomUUID()}-${safeName}`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const blob = await put(key, buffer, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType: file.type || undefined,
    });

    return NextResponse.json({
      url: blob.url,
      fileName: safeName,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    });
  } catch (err) {
    console.error("[upload/assignment] 업로드 실패:", err);
    return NextResponse.json(
      { error: "파일 업로드에 실패했습니다. 다시 시도해주세요." },
      { status: 500 }
    );
  }
}

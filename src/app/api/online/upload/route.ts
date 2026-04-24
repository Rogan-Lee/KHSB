import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";

const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// MIME allowlist (확장자 fallback 도 함께 검증)
const ALLOWED_MIMES = new Set<string>([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
  "application/msword", // doc
  "application/x-hwp",
  "application/haansofthwp",
  "application/vnd.hancom.hwp",
  "application/octet-stream", // 일부 브라우저가 hwp 를 이걸로 보고함 → 확장자로 보강
  "application/zip",
  "application/x-zip-compressed",
]);

const ALLOWED_EXTENSIONS = new Set<string>([
  "pdf", "png", "jpg", "jpeg", "docx", "doc", "hwp", "hwpx", "zip",
]);

function getExt(filename: string): string {
  const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

function safeName(filename: string): string {
  // 한글 등 유지하되 path traversal 위험 문자 제거
  return filename
    .replace(/[\\/]/g, "_")
    .replace(/\.\./g, "_")
    .slice(0, 200);
}

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식" }, { status: 400 });
  }

  const file = formData.get("file");
  const taskId = formData.get("taskId");
  const studentToken = formData.get("studentToken");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일이 누락되었습니다" }, { status: 400 });
  }
  if (typeof taskId !== "string" || !taskId) {
    return NextResponse.json({ error: "taskId 가 필요합니다" }, { status: 400 });
  }
  if (typeof studentToken !== "string" || !studentToken) {
    return NextResponse.json({ error: "인증 토큰이 필요합니다" }, { status: 401 });
  }

  // 1) 토큰 → 학생 인증
  const session = await validateMagicLink(studentToken);
  if (!session) {
    return NextResponse.json({ error: "인증이 만료되었습니다" }, { status: 401 });
  }

  // 2) 해당 task 가 이 학생의 것인지 확인
  const task = await prisma.performanceTask.findUnique({
    where: { id: taskId },
    select: { id: true, studentId: true },
  });
  if (!task || task.studentId !== session.student.id) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  // 3) 파일 크기/타입 검증
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `파일 크기는 ${MAX_FILE_SIZE_MB}MB 이하여야 합니다` },
      { status: 413 }
    );
  }
  const ext = getExt(file.name);
  const mimeOk = ALLOWED_MIMES.has(file.type);
  const extOk = ALLOWED_EXTENSIONS.has(ext);
  if (!mimeOk && !extOk) {
    return NextResponse.json(
      { error: "허용되지 않는 파일 형식입니다 (PDF/PNG/JPG/DOCX/HWP/ZIP)" },
      { status: 415 }
    );
  }

  // 4) Vercel Blob 업로드 (path 에 taskId + 랜덤 토큰 → 추측 어렵게)
  const random = Math.random().toString(36).slice(2, 10);
  const blobPath = `online/tasks/${taskId}/${Date.now()}-${random}-${safeName(file.name)}`;

  try {
    const blob = await put(blobPath, file, {
      access: "public",
      addRandomSuffix: false,
    });
    return NextResponse.json({
      url: blob.url,
      name: file.name,
      sizeBytes: file.size,
      mimeType: file.type || `application/${ext}`,
    });
  } catch (err) {
    console.error("[online upload] blob put failed", err);
    return NextResponse.json({ error: "업로드 실패" }, { status: 500 });
  }
}

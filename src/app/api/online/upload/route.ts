import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { auth } from "@/lib/auth";
import { isOnlineStaff, isStaff } from "@/lib/roles";
import { validateMagicLink } from "@/lib/student-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs"; // sharp(HEIC 변환) 은 node 런타임 필요

const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// MIME allowlist (확장자 fallback 도 함께 검증)
const ALLOWED_MIMES = new Set<string>([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/heic", // 아이폰 기본 사진 포맷 (아래서 JPEG 변환)
  "image/heif",
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
  "pdf", "png", "jpg", "jpeg", "webp", "gif", "heic", "heif", "docx", "doc", "hwp", "hwpx", "zip",
]);

function getExt(filename: string): string {
  const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

function safeName(filename: string): string {
  return filename
    .replace(/[\\/]/g, "_")
    .replace(/\.\./g, "_")
    .slice(0, 200);
}

type UploadContext = "task" | "chat" | "feedback" | "question";

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식" }, { status: 400 });
  }

  const file = formData.get("file");
  const contextRaw = formData.get("context");
  const context: UploadContext =
    contextRaw === "chat" ? "chat" :
    contextRaw === "feedback" ? "feedback" :
    contextRaw === "question" ? "question" :
    "task"; // default = task (BC)

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일이 누락되었습니다" }, { status: 400 });
  }

  // Authorize per-context
  let blobPathPrefix: string;
  if (context === "task") {
    const taskId = formData.get("taskId");
    const studentToken = formData.get("studentToken");
    if (typeof taskId !== "string" || !taskId) {
      return NextResponse.json({ error: "taskId 가 필요합니다" }, { status: 400 });
    }
    if (typeof studentToken !== "string" || !studentToken) {
      return NextResponse.json({ error: "인증 토큰이 필요합니다" }, { status: 401 });
    }
    const session = await validateMagicLink(studentToken);
    if (!session) {
      return NextResponse.json({ error: "인증이 만료되었습니다" }, { status: 401 });
    }
    const task = await prisma.performanceTask.findUnique({
      where: { id: taskId },
      select: { id: true, studentId: true },
    });
    if (!task || task.studentId !== session.student.id) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }
    blobPathPrefix = `online/tasks/${taskId}`;
  } else if (context === "chat") {
    const chatId = formData.get("chatId");
    if (typeof chatId !== "string" || !chatId) {
      return NextResponse.json({ error: "chatId 가 필요합니다" }, { status: 400 });
    }
    const chat = await prisma.portalChat.findUnique({
      where: { id: chatId },
      select: { id: true, studentId: true, staffId: true },
    });
    if (!chat) {
      return NextResponse.json({ error: "채팅방을 찾을 수 없습니다" }, { status: 404 });
    }

    const studentToken = formData.get("studentToken");
    let authorized = false;

    // 1) student token path
    if (typeof studentToken === "string" && studentToken) {
      const session = await validateMagicLink(studentToken);
      if (session && session.student.id === chat.studentId) authorized = true;
    }

    // 2) staff session path
    if (!authorized) {
      const session = await auth();
      const role = session?.user?.role;
      if (
        session?.user?.id === chat.staffId &&
        role &&
        isOnlineStaff(role)
      ) {
        authorized = true;
      }
    }

    if (!authorized) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }
    blobPathPrefix = `online/chats/${chatId}`;
  } else if (context === "feedback") {
    // 온라인 staff 가 피드백 작성 시 첨부
    const submissionId = formData.get("submissionId");
    if (typeof submissionId !== "string" || !submissionId) {
      return NextResponse.json({ error: "submissionId 가 필요합니다" }, { status: 400 });
    }
    const session = await auth();
    if (!session?.user || !isOnlineStaff(session.user.role)) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }
    const submission = await prisma.taskSubmission.findUnique({
      where: { id: submissionId },
      select: { id: true },
    });
    if (!submission) {
      return NextResponse.json({ error: "제출물을 찾을 수 없습니다" }, { status: 404 });
    }
    blobPathPrefix = `online/feedback/${submissionId}`;
  } else {
    // context === "question" — 학생 질문(문제 사진) 또는 멘토 답변(풀이 사진) 첨부.
    // 작성 직전이라 questionId 가 없을 수 있어 incoming 버킷에 올린다. 학생 토큰 또는 staff 세션 필요.
    const studentToken = formData.get("studentToken");
    let authorized = false;
    if (typeof studentToken === "string" && studentToken) {
      const session = await validateMagicLink(studentToken);
      if (session) authorized = true;
    }
    if (!authorized) {
      const session = await auth();
      if (session?.user && isStaff(session.user.role)) authorized = true;
    }
    if (!authorized) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }
    blobPathPrefix = "student-questions/incoming";
  }

  // 파일 크기/타입 검증
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
      { error: "허용되지 않는 파일 형식입니다 (PDF/이미지/DOCX/HWP/ZIP)" },
      { status: 415 }
    );
  }

  // 업로드할 실제 바디/이름/타입. HEIC/HEIF 는 Chrome/Android 가 <img> 로 못 그리므로 JPEG 로 변환.
  let body: Blob | File = file;
  let outName = file.name;
  let outMime = file.type || `application/${ext}`;
  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    ext === "heic" ||
    ext === "heif";
  if (isHeic) {
    try {
      const jpeg = await sharp(Buffer.from(await file.arrayBuffer()))
        .rotate() // EXIF 회전 보정
        .jpeg({ quality: 88 })
        .toBuffer();
      body = new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" });
      outName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
      outMime = "image/jpeg";
    } catch (err) {
      console.warn("[online upload] HEIC → JPEG 변환 실패, 원본 유지:", err);
      // 변환 실패 시 원본 그대로 저장 (일부 브라우저에서 안 보일 수 있음)
    }
  }

  const random = Math.random().toString(36).slice(2, 10);
  const blobPath = `${blobPathPrefix}/${Date.now()}-${random}-${safeName(outName)}`;

  try {
    const blob = await put(blobPath, body, {
      access: "public",
      addRandomSuffix: false,
    });
    return NextResponse.json({
      url: blob.url,
      name: outName,
      sizeBytes: body.size,
      mimeType: outMime,
    });
  } catch (err) {
    console.error("[online upload] blob put failed", err);
    return NextResponse.json({ error: "업로드 실패" }, { status: 500 });
  }
}

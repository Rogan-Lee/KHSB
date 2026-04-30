import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { isOnlineStaff } from "@/lib/roles";
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
  "image/webp",
  "image/gif",
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
  "pdf", "png", "jpg", "jpeg", "webp", "gif", "docx", "doc", "hwp", "hwpx", "zip",
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

type UploadContext = "task" | "chat";

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
    contextRaw === "chat" ? "chat" : "task"; // default = task (BC)

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
  } else {
    // context === "chat"
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

  const random = Math.random().toString(36).slice(2, 10);
  const blobPath = `${blobPathPrefix}/${Date.now()}-${random}-${safeName(file.name)}`;

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

import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { requireStaff } from "@/lib/roles";
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

// 확장자 → 저장 Content-Type 매핑.
// 클라이언트가 보낸 file.type 을 그대로 쓰면 text/html 등으로 저장될 수 있으므로
// 확장자 allowlist 를 기준으로 서버가 Content-Type 을 결정한다.
// (hwp는 브라우저가 mime을 비워서 보낼 때가 잦음)
const EXTENSION_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  hwp: "application/x-hwp",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

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

  // blob 경로 세그먼트로 쓰이므로 id 형식만 허용 (경로 조작 방지)
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(assignmentId)) {
    return NextResponse.json({ error: "assignmentId가 올바르지 않습니다" }, { status: 400 });
  }

  // 확장자는 반드시 allowlist 에 있어야 한다. 저장 Content-Type 은 확장자로 서버가 정하므로
  // 클라이언트 mime(브라우저마다 hwp 를 빈 값·unknown 으로 보냄)은 판정에 쓰지 않는다.
  const ext = getExtension(file.name);
  const contentType = EXTENSION_MIME[ext];
  if (!contentType) {
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
      contentType,
    });

    return NextResponse.json({
      url: blob.url,
      fileName: safeName,
      mimeType: contentType,
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

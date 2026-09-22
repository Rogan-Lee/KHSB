import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import type { NextRequest } from "next/server";

import { getAuthIdentity } from "@/lib/auth";
import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  ALLOWED_DOCUMENT_MIME_TYPES,
  authorizeMediaUpload,
  buildBlobKey,
  extension,
  isMobileMediaContext,
} from "../shared";

export const runtime = "nodejs";

// 모바일 blob 직접 업로드용 클라이언트 토큰 발급 라우트.
// 파일 바디가 이 함수를 거치지 않고 클라 → Vercel Blob 으로 직접 올라가므로
// Vercel 함수 body 한도(4.5MB)에 걸리지 않는다. (../route.ts 의 대용량 대안)
//
// RN(expo) 에서는 @vercel/blob/client 의 handleUpload 프로토콜(upload() 헬퍼)을
// 그대로 못 쓰므로, generateClientTokenFromReadWriteToken 으로 서버가 pathname·
// mime·크기를 고정한 토큰을 발급하고 클라가 Blob API 에 raw PUT 한다.
//
// ponytail: mentoring 컨텍스트는 미지원 — 업로드 완료 후 Photo 레코드 생성이
// 레거시 라우트에 있고, 멘토링 사진은 클라에서 다운스케일되어 4.5MB 를 넘지 않는다.
// 대용량 멘토링 업로드가 필요해지면 완료 보고 엔드포인트를 추가할 것.

const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 이미지/문서 공통
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm"]);

type TokenRequestBody = {
  context?: unknown;
  filename?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
  taskId?: unknown;
  submissionId?: unknown;
  chatId?: unknown;
};

function asOptionalString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

export async function POST(request: NextRequest) {
  const current = await getAuthIdentity(request.headers);
  if (!current) {
    return Response.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  let body: TokenRequestBody;
  try {
    body = (await request.json()) as TokenRequestBody;
  } catch {
    return Response.json({ error: "잘못된 요청 형식" }, { status: 400 });
  }

  const context = body.context;
  // mentoring 은 업로드 후 Photo 레코드 생성이 필요해 직접 업로드 미지원 (상단 주석 참고)
  if (!isMobileMediaContext(context) || context === "mentoring") {
    return Response.json({ error: "업로드 용도를 확인하세요" }, { status: 400 });
  }

  const filename = asOptionalString(body.filename);
  if (!filename) {
    return Response.json({ error: "파일을 선택하세요" }, { status: 400 });
  }
  const mimeType = asOptionalString(body.mimeType) ?? "application/octet-stream";

  const allowedType =
    ALLOWED_DOCUMENT_MIME_TYPES.has(mimeType) ||
    ALLOWED_DOCUMENT_EXTENSIONS.has(extension(filename));
  if (!allowedType) {
    return Response.json(
      {
        error:
          "PDF, 이미지, DOCX, HWP, PPT, XLSX, ZIP 파일만 업로드할 수 있습니다",
      },
      { status: 415 },
    );
  }

  const isVideo =
    mimeType.startsWith("video/") ||
    VIDEO_EXTENSIONS.has(extension(filename));
  const maxSizeBytes = isVideo ? MAX_VIDEO_BYTES : MAX_FILE_BYTES;
  const sizeBytes = typeof body.sizeBytes === "number" ? body.sizeBytes : null;
  if (sizeBytes !== null && sizeBytes > maxSizeBytes) {
    return Response.json(
      {
        error: isVideo
          ? "영상은 200MB 이하여야 합니다"
          : "파일은 개당 20MB 이하여야 합니다",
      },
      { status: 413 },
    );
  }

  const authz = await authorizeMediaUpload(current.identity, context, {
    taskId: asOptionalString(body.taskId),
    submissionId: asOptionalString(body.submissionId),
    chatId: asOptionalString(body.chatId),
  });
  if (!authz.ok) {
    return Response.json({ error: authz.error }, { status: authz.status });
  }

  // pathname 은 서버가 결정 — 토큰이 정확히 이 경로에만 유효하다.
  const pathname = buildBlobKey(authz.prefix, filename);

  try {
    const clientToken = await generateClientTokenFromReadWriteToken({
      pathname,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      allowedContentTypes: [mimeType],
      maximumSizeInBytes: maxSizeBytes,
      addRandomSuffix: false,
    });
    return Response.json({
      clientToken,
      contentType: mimeType,
      maxSizeBytes,
      pathname,
    });
  } catch (error) {
    console.error("[mobile-media client-token]", error);
    return Response.json(
      { error: "업로드 토큰 발급에 실패했습니다" },
      { status: 500 },
    );
  }
}

import { put } from "@vercel/blob";
import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { getAuthIdentity } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  ALLOWED_DOCUMENT_MIME_TYPES,
  ALLOWED_IMAGE_MIME_TYPES,
  authorizeMediaUpload,
  buildBlobKey,
  extension,
  isMobileMediaContext,
} from "./shared";

export const runtime = "nodejs";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024;

// 이 라우트는 파일 바디가 Vercel 함수를 통과하므로 실질 한도는 ~4.5MB.
// 대용량(영상·큰 문서)은 ./client-token 라우트로 토큰을 받아 클라 → Blob
// 직접 업로드한다(apps/mobile/src/lib/media-upload.ts). 이 라우트는 소형 파일
// 및 mentoring 컨텍스트(Photo 레코드 생성 필요)의 하위호환용으로 유지.

function asOptionalString(value: FormDataEntryValue | null) {
  return typeof value === "string" && value ? value : undefined;
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
  if (!isMobileMediaContext(context)) {
    return Response.json({ error: "업로드 용도를 확인하세요" }, { status: 400 });
  }
  const isDocumentContext = context !== "mentoring";
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

  const authz = await authorizeMediaUpload(current.identity, context, {
    taskId: asOptionalString(formData.get("taskId")),
    submissionId: asOptionalString(formData.get("submissionId")),
    chatId: asOptionalString(formData.get("chatId")),
    mentoringId: asOptionalString(formData.get("mentoringId")),
    tag: asOptionalString(formData.get("tag")),
  });
  if (!authz.ok) {
    return Response.json({ error: authz.error }, { status: authz.status });
  }

  const blobKey = buildBlobKey(authz.prefix, file.name);
  const appUser = current.identity.appUser;

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

    if (context === "mentoring" && authz.mentoring && appUser) {
      const photo = await prisma.photo.create({
        data: {
          fileName: file.name,
          folderId: null,
          mentoringId: authz.mentoring.id,
          mentoringTag: authz.mentoringTag,
          mimeType: file.type,
          sizeBytes: file.size,
          studentId: authz.mentoring.studentId,
          uploadedById: appUser.id,
          uploadedByName: appUser.name || "알 수 없음",
          url: blob.url,
        },
        select: { id: true },
      });
      revalidatePath("/photos");
      revalidatePath(`/mentoring/${authz.mentoring.id}`);
      return Response.json({ ...attachment, id: photo.id });
    }

    return Response.json(attachment);
  } catch (error) {
    console.error("[mobile-media]", error);
    return Response.json({ error: "사진 업로드에 실패했습니다" }, { status: 500 });
  }
}

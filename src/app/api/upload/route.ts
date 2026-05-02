import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs"; // sharp 은 node 런타임 필요

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

// magic byte signatures for image validation
const MAGIC_BYTES: Record<string, number[]> = {
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/webp": [0x52, 0x49, 0x46, 0x46], // RIFF
};

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  // 파일 크기 제한
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "파일 크기는 10MB를 초과할 수 없습니다" },
      { status: 400 }
    );
  }

  // MIME 타입 검증
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "이미지 파일만 업로드할 수 있습니다 (JPEG, PNG, WebP, HEIC)" },
      { status: 400 }
    );
  }

  // magic byte 검증 (MIME 스푸핑 방지)
  const buffer = await file.arrayBuffer();
  const header = new Uint8Array(buffer, 0, 8);
  const expected = MAGIC_BYTES[file.type];
  if (expected && !expected.every((b, i) => header[i] === b)) {
    return NextResponse.json(
      { error: "파일 형식이 올바르지 않습니다" },
      { status: 400 }
    );
  }

  // HEIC/HEIF 는 Chrome/Firefox 가 인라인 렌더 못 함 → JPEG 로 서버 변환 후 저장
  let uploadBuffer: Buffer = Buffer.from(buffer);
  let uploadType = file.type;
  let uploadExt = file.type.split("/")[1];

  if (file.type === "image/heic" || file.type === "image/heif") {
    try {
      uploadBuffer = await sharp(Buffer.from(buffer))
        .rotate() // EXIF 회전 보정
        .jpeg({ quality: 88 })
        .toBuffer();
      uploadType = "image/jpeg";
      uploadExt = "jpg";
    } catch (err) {
      console.warn("[upload] HEIC → JPEG 변환 실패, 원본 유지:", err);
      // sharp 의 HEIC 디코딩 실패 시 원본 그대로 저장 (브라우저에서 깨질 수 있음을 감수)
    }
  }

  try {
    const blob = await put(
      `study-plans/${Date.now()}-${crypto.randomUUID()}.${uploadExt}`,
      new Blob([new Uint8Array(uploadBuffer)], { type: uploadType }),
      { access: "public", token: process.env.BLOB_READ_WRITE_TOKEN }
    );
    return NextResponse.json({ url: blob.url });
  } catch {
    return NextResponse.json(
      { error: "파일 업로드에 실패했습니다. 다시 시도해주세요." },
      { status: 500 }
    );
  }
}

import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isStaff } from "@/lib/roles";
import {
  parsePhotoFileName,
  makeUniqueFileName,
  ALLOWED_MIME_TYPES,
} from "@/lib/photo-filename";

export const runtime = "nodejs"; // sharp은 node 런타임 필요

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB per file (모바일 HEIC 대비)

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !isStaff(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "파일 없음" }, { status: 400 });

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `파일 크기는 ${MAX_FILE_SIZE / 1024 / 1024}MB를 초과할 수 없습니다` },
      { status: 400 }
    );
  }

  // MIME 체크 (느슨하게 — HEIC는 브라우저에서 application/octet-stream 으로 올수도 있음)
  const isImage = ALLOWED_MIME_TYPES.includes(file.type) ||
    /\.(jpe?g|png|heic|heif|webp)$/i.test(file.name);
  if (!isImage) {
    return NextResponse.json(
      { error: "이미지 파일만 업로드 가능합니다 (JPG/PNG/HEIC/WEBP)" },
      { status: 400 }
    );
  }

  // 파일명 파싱 — 룰 불일치면 거부
  const parsed = parsePhotoFileName(file.name);
  if (!parsed.valid) {
    return NextResponse.json(
      { error: `파일명 규칙 위반: ${parsed.reason}`, fileName: file.name },
      { status: 400 }
    );
  }
  const { date, seatNumber, name: parsedName } = parsed;

  // 기존 파일명 (같은 날짜) 조회 — 중복 시 (1), (2) suffix
  const sameDayNames = await prisma.photo.findMany({
    where: { parsedDate: date! },
    select: { fileName: true },
  });
  const existingSet = new Set(sameDayNames.map((p) => p.fileName));
  const finalFileName = makeUniqueFileName(file.name, existingSet);

  // 학생 매칭: 좌석 + 이름 둘 다 일치해야 자동 연결
  const candidate = await prisma.student.findFirst({
    where: {
      status: "ACTIVE",
      seat: String(seatNumber),
      name: parsedName,
    },
    select: { id: true },
  });

  // 자동 폴더 YYYY/MM 찾거나 생성
  const year = date!.getFullYear();
  const month = date!.getMonth() + 1;
  const autoKey = `${year}/${String(month).padStart(2, "0")}`;
  let folder = await prisma.photoFolder.findFirst({
    where: { autoKey },
  });
  if (!folder) {
    // 연도 폴더 → 월 폴더 계층
    const yearKey = String(year);
    let yearFolder = await prisma.photoFolder.findFirst({ where: { autoKey: yearKey } });
    if (!yearFolder) {
      yearFolder = await prisma.photoFolder.create({
        data: { name: yearKey, isAuto: true, autoKey: yearKey, createdById: session.user.id },
      });
    }
    folder = await prisma.photoFolder.create({
      data: {
        name: String(month).padStart(2, "0"),
        parentId: yearFolder.id,
        isAuto: true,
        autoKey,
        createdById: session.user.id,
      },
    });
  }

  // 원본 업로드 (랜덤 경로로 blob 충돌 방지)
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = parsed.ext!;
  const blobBase = `photos/${autoKey}/${Date.now()}-${crypto.randomUUID()}`;

  try {
    const originalBlob = await put(`${blobBase}.${ext}`, buffer, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType: file.type || undefined,
    });

    // 썸네일 생성 (sharp — HEIC는 입력 지원 환경마다 다름. 실패 시 원본을 썸네일로)
    let thumbnailUrl: string | null = null;
    try {
      const thumbBuf = await sharp(buffer)
        .rotate() // EXIF 회전 보정
        .resize(480, 480, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      const thumbBlob = await put(`${blobBase}.thumb.webp`, thumbBuf, {
        access: "public",
        token: process.env.BLOB_READ_WRITE_TOKEN,
        contentType: "image/webp",
      });
      thumbnailUrl = thumbBlob.url;
    } catch {
      thumbnailUrl = null; // 생성 실패 → 원본으로 대체 (클라이언트에서 fallback)
    }

    const photo = await prisma.photo.create({
      data: {
        folderId: folder.id,
        fileName: finalFileName,
        url: originalBlob.url,
        thumbnailUrl,
        mimeType: file.type || `image/${ext}`,
        sizeBytes: file.size,
        parsedDate: date!,
        parsedSeatNumber: seatNumber!,
        parsedName: parsedName!,
        studentId: candidate?.id ?? null,
        uploadedById: session.user.id,
        uploadedByName: session.user.name ?? "알 수 없음",
      },
    });

    return NextResponse.json({
      ok: true,
      photo: {
        id: photo.id,
        fileName: photo.fileName,
        studentMatched: !!candidate,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "업로드 실패", fileName: file.name },
      { status: 500 }
    );
  }
}

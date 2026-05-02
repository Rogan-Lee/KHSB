"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import { del, put } from "@vercel/blob";
import sharp from "sharp";
import {
  extractDriveId,
  listFolderImages,
  getFileMeta,
  downloadFile,
  type DriveImageFile,
} from "@/lib/google-drive";
import {
  parsePhotoFileName,
  makeUniqueFileName,
  ALLOWED_MIME_TYPES,
} from "@/lib/photo-filename";
import crypto from "node:crypto";

export async function createPhotoFolder(data: { name: string; parentId?: string | null }) {
  const session = await auth();
  requireStaff(session?.user?.role);

  const name = data.name.trim();
  if (!name) throw new Error("폴더명을 입력하세요");

  return prisma.photoFolder.create({
    data: {
      name,
      parentId: data.parentId ?? null,
      isAuto: false,
      createdById: session!.user!.id,
    },
  });
}

export async function renamePhotoFolder(id: string, name: string) {
  const session = await auth();
  requireStaff(session?.user?.role);

  const folder = await prisma.photoFolder.findUnique({ where: { id } });
  if (!folder) throw new Error("폴더를 찾을 수 없습니다");
  if (folder.isAuto) throw new Error("자동 생성 폴더는 이름을 바꿀 수 없습니다");

  await prisma.photoFolder.update({ where: { id }, data: { name: name.trim() } });
  revalidatePath("/photos");
}

export async function deletePhotoFolder(id: string) {
  const session = await auth();
  requireStaff(session?.user?.role);

  const folder = await prisma.photoFolder.findUnique({
    where: { id },
    include: { _count: { select: { children: true, photos: true } } },
  });
  if (!folder) throw new Error("폴더를 찾을 수 없습니다");
  if (folder._count.photos > 0 || folder._count.children > 0) {
    throw new Error(`이 폴더에는 사진 ${folder._count.photos}장, 하위 폴더 ${folder._count.children}개가 있습니다. 먼저 이동하거나 삭제하세요.`);
  }

  await prisma.photoFolder.delete({ where: { id } });
  revalidatePath("/photos");
}

/**
 * 사진의 폴더 이동 (다중).
 */
export async function movePhotos(photoIds: string[], targetFolderId: string | null) {
  const session = await auth();
  requireStaff(session?.user?.role);

  if (photoIds.length === 0) return;
  await prisma.photo.updateMany({
    where: { id: { in: photoIds } },
    data: { folderId: targetFolderId },
  });
  revalidatePath("/photos");
}

/**
 * 사진의 학생 수동 매칭.
 */
export async function linkPhotoStudent(photoId: string, studentId: string | null) {
  const session = await auth();
  requireStaff(session?.user?.role);
  await prisma.photo.update({ where: { id: photoId }, data: { studentId } });
  revalidatePath("/photos");
}

/**
 * 사진 삭제 (Blob + DB).
 */
export async function deletePhoto(id: string) {
  const session = await auth();
  requireStaff(session?.user?.role);

  const photo = await prisma.photo.findUnique({ where: { id } });
  if (!photo) throw new Error("사진을 찾을 수 없습니다");

  // Blob 삭제 시도 (실패해도 DB는 삭제)
  try {
    const urls = [photo.url, photo.thumbnailUrl].filter(Boolean) as string[];
    await del(urls, { token: process.env.BLOB_READ_WRITE_TOKEN });
  } catch {
    // Blob 삭제 실패 로깅만
  }

  await prisma.photo.delete({ where: { id } });
  revalidatePath("/photos");
}

/**
 * Drive URL(폴더 또는 파일) 에서 이미지 가져와 Photo 등록.
 * - 폴더 URL: 직속 이미지 파일 전부 import (재귀 X)
 * - 파일 URL: 단일 이미지 import
 *
 * 파일명이 표준 패턴(YYYYMMDD_좌석_이름.jpg) 에 맞으면 학생 자동 매칭 + 자동 폴더 분류.
 * 안 맞으면 today 의 자동 폴더로 들어가고 학생 매칭 없음.
 */
export async function importPhotosFromDrive(driveUrl: string) {
  const session = await auth();
  requireStaff(session?.user?.role);
  if (!session?.user) throw new Error("Unauthorized");

  const id = extractDriveId(driveUrl);
  if (!id) throw new Error("올바른 Drive URL 또는 ID 가 아닙니다");

  // 폴더인지 파일인지 모르므로 둘 다 시도
  let files: DriveImageFile[] = [];
  try {
    files = await listFolderImages(id);
  } catch {
    files = [];
  }
  if (files.length === 0) {
    const single = await getFileMeta(id).catch(() => null);
    if (single) files = [single];
  }
  if (files.length === 0) throw new Error("가져올 이미지가 없습니다 (폴더 비었거나 권한 없음)");

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const errors: { name: string; reason: string }[] = [];

  // 사전 중복 체크 — 이미 같은 driveFileId 로 import 된 사진들 한 번에 조회
  const existingDrive = await prisma.photo.findMany({
    where: { driveFileId: { in: files.map((f) => f.id) } },
    select: { driveFileId: true },
  });
  const alreadyImported = new Set(existingDrive.map((p) => p.driveFileId).filter(Boolean) as string[]);

  for (const f of files) {
    try {
      // 중복 스킵
      if (alreadyImported.has(f.id)) {
        skipped++;
        continue;
      }

      // MIME 검증
      const isImage = ALLOWED_MIME_TYPES.includes(f.mimeType) ||
        /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name);
      if (!isImage) {
        failed++;
        errors.push({ name: f.name, reason: "이미지 파일 아님" });
        continue;
      }

      // 다운로드
      const buffer = await downloadFile(f.id);

      // 파일명 파싱 — 표준 패턴이면 활용, 아니면 today + null
      const parsed = parsePhotoFileName(f.name);
      const refDate = parsed.valid && parsed.date ? parsed.date : new Date();
      const year = refDate.getFullYear();
      const month = refDate.getMonth() + 1;
      const autoKey = `${year}/${String(month).padStart(2, "0")}`;

      // 자동 폴더
      let folder = await prisma.photoFolder.findFirst({ where: { autoKey } });
      if (!folder) {
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

      // 학생 자동 매칭 (파일명에 좌석+이름 있을 때만)
      let studentId: string | null = null;
      if (parsed.valid && parsed.seatNumber && parsed.name) {
        const candidate = await prisma.student.findFirst({
          where: { status: "ACTIVE", seat: String(parsed.seatNumber), name: parsed.name },
          select: { id: true },
        });
        studentId = candidate?.id ?? null;
      }

      // 동일 폴더 내 파일명 중복 처리
      const existing = await prisma.photo.findMany({
        where: { folderId: folder.id },
        select: { fileName: true },
      });
      const existingSet = new Set(existing.map((p) => p.fileName));
      const finalFileName = makeUniqueFileName(f.name, existingSet);

      // Blob 업로드
      const ext = (f.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "jpg").toLowerCase();
      const blobBase = `photos/${autoKey}/${Date.now()}-${crypto.randomUUID()}`;
      const originalBlob = await put(`${blobBase}.${ext}`, buffer, {
        access: "public",
        token: process.env.BLOB_READ_WRITE_TOKEN,
        contentType: f.mimeType || undefined,
      });

      // 썸네일 (sharp; HEIC 미지원 환경에선 실패할 수 있음)
      let thumbnailUrl: string | null = null;
      try {
        const thumbBuf = await sharp(buffer)
          .rotate()
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
        thumbnailUrl = null;
      }

      await prisma.photo.create({
        data: {
          folderId: folder.id,
          fileName: finalFileName,
          url: originalBlob.url,
          thumbnailUrl,
          mimeType: f.mimeType || `image/${ext}`,
          sizeBytes: f.sizeBytes || buffer.byteLength,
          parsedDate: parsed.valid && parsed.date ? parsed.date : null,
          parsedSeatNumber: parsed.valid ? parsed.seatNumber ?? null : null,
          parsedName: parsed.valid ? parsed.name ?? null : null,
          studentId,
          uploadedById: session.user.id,
          uploadedByName: session.user.name ?? "알 수 없음",
          driveFileId: f.id,
        },
      });
      imported++;
    } catch (e) {
      // 동시성으로 인한 unique constraint 위반(같은 driveFileId 중복 insert) 도 skip 으로 처리
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Photo_driveFileId_key") || msg.toLowerCase().includes("unique constraint")) {
        skipped++;
      } else {
        failed++;
        errors.push({ name: f.name, reason: msg });
      }
    }
  }

  revalidatePath("/photos");
  return { imported, skipped, failed, total: files.length, errors };
}

"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";

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

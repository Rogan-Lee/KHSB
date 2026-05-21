import { prisma } from "@/lib/prisma";
import { PageIntro } from "@/components/ui/page-intro";
import { PhotosBoard } from "@/components/photos/photos-board";

export const dynamic = "force-dynamic";

export default async function PhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  const sp = await searchParams;
  const activeFolderId = sp.folder ?? null;

  const [folders, photos, students] = await Promise.all([
    prisma.photoFolder.findMany({
      orderBy: [{ isAuto: "desc" }, { name: "asc" }],
      include: { _count: { select: { photos: true, children: true } } },
    }),
    activeFolderId
      ? prisma.photo.findMany({
          where: { folderId: activeFolderId },
          include: { student: { select: { id: true, name: true, grade: true } } },
          orderBy: { parsedDate: "desc" },
          take: 500,
        })
      : prisma.photo.findMany({
          // 폴더 미선택 시 "전체" = 최근 100장
          include: { student: { select: { id: true, name: true, grade: true } } },
          orderBy: { uploadedAt: "desc" },
          take: 100,
        }),
    prisma.student.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, grade: true, seat: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-4">
      <PageIntro
        tag="PHOTOS · 01"
        title="사진 관리"
        description="파일명 규칙(YYYYMMDD_좌석_이름)으로 자동 폴더/학생 매칭. 드래그 앤 드롭으로 업로드"
        accent="text-info"
      />

      <PhotosBoard
        folders={folders.map((f) => ({
          id: f.id,
          name: f.name,
          parentId: f.parentId,
          isAuto: f.isAuto,
          photoCount: f._count.photos,
          childCount: f._count.children,
        }))}
        photos={photos.map((p) => ({
          id: p.id,
          fileName: p.fileName,
          url: p.url,
          thumbnailUrl: p.thumbnailUrl,
          parsedDate: p.parsedDate,
          parsedSeatNumber: p.parsedSeatNumber,
          parsedName: p.parsedName,
          studentId: p.studentId,
          student: p.student,
          folderId: p.folderId,
          uploadedAt: p.uploadedAt,
          uploadedByName: p.uploadedByName,
          sizeBytes: p.sizeBytes,
        }))}
        students={students}
        activeFolderId={activeFolderId}
      />
    </div>
  );
}

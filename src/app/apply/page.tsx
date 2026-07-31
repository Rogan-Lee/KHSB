import type { Metadata, Viewport } from "next";
import { prisma } from "@/lib/prisma";
import { ApplyForm } from "./_components/apply-form";

export const metadata: Metadata = {
  title: "대기 신청 · 스터디룸",
  description: "1분 안에 대기 신청해 드릴게요.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

// 항상 최신 지점 상태 반영 (마감/마감임박 등).
export const dynamic = "force-dynamic";

export default async function ApplyPage() {
  const branches = await prisma.branch.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      programs: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true },
      },
    },
  });

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg bg-white px-5 py-8">
      <h1 className="text-center text-lg font-bold leading-snug text-gray-900">
        1분 안에
        <br />
        신청해 드릴게요!
      </h1>
      {branches.length === 0 ? (
        <p className="mt-10 text-center text-sm text-gray-500">
          현재 신청 가능한 지점이 없습니다.
        </p>
      ) : (
        <ApplyForm
          branches={branches.map((b) => ({
            id: b.id,
            name: b.name,
            waitStatus: b.waitStatus,
            notice: b.notice,
            programs: b.programs,
          }))}
        />
      )}
    </main>
  );
}

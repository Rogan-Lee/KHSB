import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { getWaitlistPosition } from "@/actions/waitlist";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "대기 현황 · 스터디룸" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1 };
export const dynamic = "force-dynamic";

const STATUS_MSG: Record<string, string> = {
  INVITED: "등록 안내를 보내드렸어요. 문자를 확인해주세요!",
  ENROLLED: "등원이 확정되었습니다 🎉",
  CANCELLED: "대기가 취소되었습니다.",
};

export default async function WaitlistStatusPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const pos = await getWaitlistPosition(token);
  if (!pos) notFound();

  const gradeLabel = pos.gradeType === "REPEAT" ? "N수생" : "재학생";
  const genderLabel = pos.gender === "MALE" ? "남학생" : "여학생";
  const waiting = pos.status === "WAITING";

  return (
    <main className="min-h-screen bg-blue-600">
      <div className="mx-auto w-full max-w-lg px-5 pt-10">
        <h1 className="text-center text-xl font-bold text-white">대기 현황</h1>

        <div className="mt-6 rounded-2xl bg-white px-6 py-8 shadow-sm">
          {waiting ? (
            <>
              <p className="text-sm text-gray-500">현재 나의 순서</p>
              <div className="mt-1 flex items-end gap-2">
                <span className="text-6xl font-extrabold text-blue-600">{pos.byGrade}</span>
                <span className="mb-2 text-lg font-medium text-gray-600">번째</span>
                <span className="mb-2 ml-2 rounded-full bg-gray-700 px-3 py-1.5 text-xs text-white">
                  {gradeLabel} 기준 대기번호예요!
                </span>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-4 border-t border-gray-100 pt-5">
                <div>
                  <p className="text-xs text-gray-400">전체 기준 대기번호</p>
                  <p className="mt-1 text-lg font-bold text-gray-900">{pos.overall}번째</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">대기 등록 일시</p>
                  <p className="mt-1 text-lg font-bold text-gray-900">
                    {formatDateTime(pos.createdAt)}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <p className="py-6 text-center text-base font-semibold text-gray-800">
              {STATUS_MSG[pos.status] ?? "대기 상태가 변경되었습니다."}
            </p>
          )}
        </div>

        <div className="mt-6 space-y-4 rounded-2xl bg-white px-6 py-6">
          {[
            ["대기 등록 지점", pos.branchName],
            ["학생 성별", genderLabel],
            ["학생 학년", gradeLabel],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between border-b border-gray-100 pb-4 last:border-0 last:pb-0"
            >
              <span className="text-sm text-gray-500">{label}</span>
              <span className="text-sm font-semibold text-gray-900">{value}</span>
            </div>
          ))}
        </div>

        <p className="mt-6 pb-10 text-center text-xs text-blue-100">
          새로고침하면 최신 순번으로 갱신됩니다.
        </p>
      </div>
    </main>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, X } from "lucide-react";
import {
  issueStudentMagicLink,
  revokeStudentMagicLink,
} from "@/actions/online/students";

type LinkRow = {
  id: string;
  token: string;
  expiresAt: string;          // ISO
  issuedAt: string;
  lastAccessedAt: string | null;
  accessCount: number;
};

export function MagicLinkManager({
  studentId,
  studentName,
  initialLinks,
  portalOrigin,
}: {
  studentId: string;
  studentName: string;
  initialLinks: LinkRow[];
  portalOrigin: string;    // 예: window.location.origin — SSR에서 전달
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const onIssue = () => {
    const confirmMsg = initialLinks.length > 0
      ? `${studentName} 학생에 활성 링크가 이미 있습니다.\n새 링크를 발급하면 기존 링크는 모두 무효화됩니다. 계속하시겠어요?`
      : `${studentName} 학생에게 30일 유효한 새 매직링크를 발급합니다.`;
    if (!confirm(confirmMsg)) return;

    startTransition(async () => {
      try {
        const { token } = await issueStudentMagicLink({ studentId });
        toast.success("매직링크가 발급되었습니다");
        await navigator.clipboard.writeText(`${portalOrigin}/s/${token}`).catch(() => {});
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "발급 실패");
      }
    });
  };

  const onCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${portalOrigin}/s/${token}`);
      toast.success("링크가 복사되었습니다");
    } catch {
      toast.error("복사 실패 — 브라우저 권한을 확인하세요");
    }
  };

  const onRevoke = (linkId: string) => {
    if (!confirm("이 링크를 즉시 무효화합니다. 계속하시겠어요?")) return;
    startTransition(async () => {
      try {
        await revokeStudentMagicLink({ linkId, studentId });
        toast.success("링크가 무효화되었습니다");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "무효화 실패");
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-ink-4">
          활성 링크 {initialLinks.length}건
        </p>
        <button
          type="button"
          onClick={onIssue}
          disabled={isPending}
          className="rounded-[8px] bg-ink text-white px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
        >
          {isPending ? "처리 중..." : "새 링크 발급 (30일)"}
        </button>
      </div>

      {initialLinks.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-line bg-canvas-2/50 p-4 text-center text-[12px] text-ink-5">
          활성 링크가 없습니다. 위 버튼으로 발급하세요.
        </div>
      ) : (
        <div className="rounded-[10px] border border-line bg-panel overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-canvas-2 text-ink-4 text-[10.5px] uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-1.5 font-semibold">만료일</th>
                <th className="text-left px-3 py-1.5 font-semibold">최근 접근</th>
                <th className="text-left px-3 py-1.5 font-semibold">횟수</th>
                <th className="text-right px-3 py-1.5 font-semibold">작업</th>
              </tr>
            </thead>
            <tbody>
              {initialLinks.map((l) => (
                <tr key={l.id} className="border-t border-line">
                  <td className="px-3 py-2 tabular-nums text-ink-3">
                    {new Date(l.expiresAt).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-ink-3">
                    {l.lastAccessedAt
                      ? new Date(l.lastAccessedAt).toLocaleString("ko-KR", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : <span className="text-ink-5">없음</span>}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-ink-3">
                    {l.accessCount}회
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onCopy(l.token)}
                        title="URL 복사"
                        className="p-1.5 rounded-[6px] text-ink-4 hover:text-ink hover:bg-canvas-2"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRevoke(l.id)}
                        disabled={isPending}
                        title="무효화"
                        className="p-1.5 rounded-[6px] text-red-500 hover:text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-ink-5 leading-relaxed">
        매직링크는 외부 공유 시 타인이 학생 정보에 접근할 수 있습니다.
        카카오톡 개인 대화방으로만 전달하고, 의심스러운 경우 즉시 무효화하세요.
      </p>
    </div>
  );
}

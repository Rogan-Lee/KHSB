"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Loader2, RefreshCw, Plus, Search } from "lucide-react";
import {
  issuePortalLinksForAllActive,
  issueStudentPortalLink,
} from "@/actions/student-portal-links";

export type PortalLinkRow = {
  id: string;
  name: string;
  grade: string;
  school: string | null;
  seat: string | null;
  isOnlineManaged: boolean;
  token: string | null;
  expiresAt: string | null;
};

function portalUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/s/${token}`;
}

/**
 * 학생 포털(`/s/[token]`) 매직링크 일괄 관리 패널.
 * /students 의 「포털 링크」 탭과 /attendance 의 「포털 링크 관리」 Sheet 양쪽에서 재사용.
 */
export function PortalLinksPanel({
  students,
  canManage,
}: {
  students: PortalLinkRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return students;
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(t) ||
        s.grade.toLowerCase().includes(t) ||
        (s.school ?? "").toLowerCase().includes(t)
    );
  }, [students, q]);

  const missing = students.filter((s) => !s.token).length;

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(portalUrl(token));
      toast.success("링크를 복사했어요");
    } catch {
      toast.error("복사에 실패했어요");
    }
  };

  const issue = (studentId: string, reissue: boolean) => {
    setBusyId(studentId);
    startTransition(async () => {
      try {
        const { token } = await issueStudentPortalLink({ studentId, reissue });
        await navigator.clipboard.writeText(portalUrl(token)).catch(() => {});
        toast.success(reissue ? "재발급하고 링크를 복사했어요" : "발급하고 링크를 복사했어요");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "처리에 실패했어요");
      } finally {
        setBusyId(null);
      }
    });
  };

  const issueAll = () => {
    if (!confirm(`활성 링크가 없는 ${missing}명에게 일괄 발급할까요?`)) return;
    startTransition(async () => {
      try {
        const { issued } = await issuePortalLinksForAllActive();
        toast.success(`${issued}명에게 발급했어요`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "처리에 실패했어요");
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이름·학년·학교 검색"
            className="w-full rounded-lg border bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>
        {canManage && missing > 0 && (
          <button
            type="button"
            onClick={issueAll}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-60"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            미발급 {missing}명 일괄 발급
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">학생</th>
              <th className="px-3 py-2 text-left font-medium">링크</th>
              <th className="px-3 py-2 text-right font-medium">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((s) => {
              const busy = busyId === s.id && isPending;
              return (
                <tr key={s.id} className="hover:bg-accent/30">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {s.grade}
                        {s.seat ? ` · ${s.seat}` : ""}
                      </span>
                      {s.isOnlineManaged && (
                        <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                          온라인
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {s.token ? (
                      <button
                        type="button"
                        onClick={() => copy(s.token!)}
                        className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs font-mono text-muted-foreground hover:bg-accent"
                        title="클릭하면 복사"
                      >
                        <Copy className="h-3 w-3" />
                        /s/{s.token.slice(0, 10)}…
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">미발급</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {canManage ? (
                      s.token ? (
                        <button
                          type="button"
                          onClick={() => issue(s.id, true)}
                          disabled={isPending}
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-60"
                        >
                          {busy ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          재발급
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => issue(s.id, false)}
                          disabled={isPending}
                          className="inline-flex items-center gap-1 rounded-md bg-brand px-2 py-1 text-xs font-semibold text-white hover:bg-brand/90 disabled:opacity-60"
                        >
                          {busy ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Plus className="h-3 w-3" />
                          )}
                          발급
                        </button>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  검색 결과가 없어요
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

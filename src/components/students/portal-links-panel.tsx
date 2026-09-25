"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Link2, Loader2, RefreshCw, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, SearchField, StatusBadge, TableCard, Toolbar } from "@/components/backoffice/ui";
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
    <div>
      <Toolbar>
        <SearchField
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름·학년·학교 검색"
          aria-label="학생 검색"
          className="sm:w-auto sm:flex-1"
        />
        {canManage && missing > 0 && (
          <Button onClick={issueAll} disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            미발급 {missing}명 일괄 발급
          </Button>
        )}
      </Toolbar>

      <TableCard>
        {filtered.length === 0 ? (
          <EmptyState
            compact
            icon={students.length === 0 ? Link2 : Search}
            title={students.length === 0 ? "링크를 보낼 재원생이 없어요" : "검색 결과가 없어요"}
            description={students.length === 0 ? undefined : "이름·학년·학교로 다시 찾아보세요."}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>학생</TableHead>
                <TableHead>링크</TableHead>
                <TableHead className="text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => {
                const busy = busyId === s.id && isPending;
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="flex min-w-0 flex-wrap items-center gap-x1_5">
                        <span className="t4-medium text-fg-neutral">{s.name}</span>
                        <span className="t3-regular text-fg-neutral-subtle tabular-nums">
                          {s.grade}
                          {s.seat ? ` · ${s.seat}` : ""}
                        </span>
                        {s.isOnlineManaged && <StatusBadge tone="violet">온라인</StatusBadge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {s.token ? (
                        <button
                          type="button"
                          onClick={() => copy(s.token!)}
                          className="inline-flex items-center gap-x1_5 rounded-r2 bg-bg-neutral-weak px-x2 py-x1 t3-regular text-fg-neutral-muted transition-colors hover:bg-bg-neutral-weak-pressed hover:text-fg-neutral focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
                          title="클릭하면 복사"
                          aria-label={`${s.name} 포털 링크 복사`}
                        >
                          <Copy className="size-3.5" aria-hidden />
                          /s/{s.token.slice(0, 10)}…
                        </button>
                      ) : (
                        <StatusBadge>미발급</StatusBadge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage ? (
                        s.token ? (
                          <Button variant="outline" size="xs" onClick={() => issue(s.id, true)} disabled={isPending}>
                            {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                            재발급
                          </Button>
                        ) : (
                          <Button size="xs" onClick={() => issue(s.id, false)} disabled={isPending}>
                            {busy ? <Loader2 className="animate-spin" /> : <Plus />}
                            발급
                          </Button>
                        )
                      ) : (
                        <span className="t3-regular text-fg-placeholder">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </TableCard>
    </div>
  );
}

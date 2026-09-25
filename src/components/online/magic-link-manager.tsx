"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Link2, Link2Off, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/backoffice/ui";
import { ConfirmDialog } from "@/components/online/online-confirm-dialog";
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
  const [issueOpen, setIssueOpen] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const hasActive = initialLinks.length > 0;

  const onIssue = () => {
    setIssueOpen(false);
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
    setRevokeId(null);
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
    <div className="flex flex-col gap-x4">
      <div className="flex flex-wrap items-center justify-between gap-x2">
        <p className="t4-regular text-fg-neutral-muted">
          활성 링크 <span className="t4-bold tabular-nums text-fg-neutral">{initialLinks.length}</span>건
        </p>
        <Button type="button" variant="ink" size="sm" onClick={() => setIssueOpen(true)} disabled={isPending}>
          <Link2 />
          {isPending ? "처리 중…" : "새 링크 발급 (30일)"}
        </Button>
      </div>

      {initialLinks.length === 0 ? (
        <div className="rounded-r3 bg-bg-layer-fill">
          <EmptyState
            compact
            icon={Link2Off}
            title="활성 링크가 없어요"
            description="새 링크를 발급하면 주소가 바로 복사돼요"
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-r3 border border-stroke-neutral-muted">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>만료일</TableHead>
                <TableHead>최근 접근</TableHead>
                <TableHead className="text-right">접근 횟수</TableHead>
                <TableHead className="w-24 text-right">
                  <span className="sr-only">작업</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialLinks.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="tabular-nums">
                    {new Date(l.expiresAt).toLocaleDateString("ko-KR")}
                  </TableCell>
                  <TableCell className="tabular-nums text-fg-neutral-muted">
                    {l.lastAccessedAt ? (
                      new Date(l.lastAccessedAt).toLocaleString("ko-KR", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    ) : (
                      <span className="text-fg-placeholder">없음</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{l.accessCount}회</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-x1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9"
                        onClick={() => onCopy(l.token)}
                        aria-label="링크 주소 복사"
                        title="URL 복사"
                      >
                        <Copy />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 text-fg-critical"
                        onClick={() => setRevokeId(l.id)}
                        disabled={isPending}
                        aria-label="링크 무효화"
                        title="무효화"
                      >
                        <Link2Off />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="flex items-start gap-x1_5 t3-regular text-fg-neutral-subtle">
        <ShieldAlert className="mt-px size-4 shrink-0" aria-hidden />
        <span>
          매직링크를 외부에 공유하면 다른 사람이 학생 정보를 볼 수 있어요. 카카오톡 개인 대화방으로만 전달하고,
          의심스러우면 바로 무효화하세요.
        </span>
      </p>

      <ConfirmDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        title={hasActive ? "새 링크를 발급할까요?" : "매직링크를 발급할까요?"}
        description={
          hasActive
            ? `${studentName} 학생에게 이미 활성 링크가 있어요. 새 링크를 발급하면 기존 링크는 모두 무효화돼요.`
            : `${studentName} 학생에게 30일 동안 쓸 수 있는 새 매직링크를 발급해요.`
        }
        confirmLabel="발급"
        destructive={hasActive}
        pending={isPending}
        onConfirm={onIssue}
      />
      <ConfirmDialog
        open={revokeId !== null}
        onOpenChange={(o) => !o && setRevokeId(null)}
        title="이 링크를 무효화할까요?"
        description="무효화하면 학생이 이 링크로 더 이상 들어올 수 없어요."
        confirmLabel="무효화"
        destructive
        pending={isPending}
        onConfirm={() => revokeId && onRevoke(revokeId)}
      />
    </div>
  );
}

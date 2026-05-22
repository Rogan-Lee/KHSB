"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Loader2, Plus, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  issueLinkForStaff,
  revokeLink,
} from "@/actions/staff-magic-link";

export type StaffMagicLinkRow = {
  id: string;
  token: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastAccessedAt: string | null;
  lastAccessIp: string | null;
  accessCount: number;
};

function staffPortalUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/w/${token}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function isExpired(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}

/**
 * 근무자 매직링크 발급/무효화 admin 패널.
 * `/payroll` 또는 근무자 상세 페이지에서 사용. 원장/SUPER_ADMIN 전용.
 */
export function StaffMagicLinkPanel({
  userId,
  userName,
  links,
}: {
  userId: string;
  userName: string;
  links: StaffMagicLinkRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyLinkId, setBusyLinkId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<StaffMagicLinkRow | null>(
    null,
  );

  const activeLinks = links.filter(
    (l) => !l.revokedAt && !isExpired(l.expiresAt),
  );
  const inactiveLinks = links.filter(
    (l) => l.revokedAt || isExpired(l.expiresAt),
  );

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(staffPortalUrl(token));
      toast.success("링크를 복사했어요");
    } catch {
      toast.error("복사에 실패했어요");
    }
  };

  const handleIssue = () => {
    startTransition(async () => {
      try {
        const { token } = await issueLinkForStaff(userId);
        const url = staffPortalUrl(token);
        await navigator.clipboard.writeText(url).catch(() => {});
        toast.success(`발급 완료 — 링크를 복사했어요`, {
          description: url,
          duration: 8000,
        });
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "발급에 실패했어요");
      }
    });
  };

  const handleRevoke = (link: StaffMagicLinkRow) => {
    setBusyLinkId(link.id);
    startTransition(async () => {
      try {
        await revokeLink(link.id);
        toast.success("링크를 무효화했어요");
        setRevokeTarget(null);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "처리에 실패했어요");
      } finally {
        setBusyLinkId(null);
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">
            순찰 매직링크 — {userName}
          </h3>
          <p className="text-xs text-muted-foreground">
            카톡 등으로 전달 → 폰에서 QR 순찰. 본인 확인은 전화번호 뒷 4자리. 기본 90일 만료.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={handleIssue}
          disabled={isPending}
        >
          {isPending && busyLinkId === null ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-1.5 h-4 w-4" />
          )}
          새 링크 발급
        </Button>
      </div>

      <section className="space-y-2">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          활성 링크 ({activeLinks.length})
        </h4>
        {activeLinks.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
            활성 링크가 없습니다
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {activeLinks.map((link) => (
              <li
                key={link.id}
                className="flex flex-wrap items-center gap-2 px-3 py-2.5"
              >
                <button
                  type="button"
                  onClick={() => copy(link.token)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground hover:bg-accent"
                  title="클릭하면 복사"
                >
                  <Copy className="h-3 w-3" />
                  /w/{link.token.slice(0, 10)}…
                </button>
                <div className="flex-1 text-xs text-muted-foreground">
                  <span>발급 {formatDateTime(link.issuedAt)}</span>
                  <span className="mx-1.5">·</span>
                  <span>만료 {formatDateTime(link.expiresAt)}</span>
                  {link.lastAccessedAt && (
                    <>
                      <span className="mx-1.5">·</span>
                      <span>
                        마지막 접근 {formatDateTime(link.lastAccessedAt)} (
                        {link.accessCount}회)
                      </span>
                    </>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRevokeTarget(link)}
                  disabled={isPending}
                >
                  <ShieldOff className="mr-1 h-3.5 w-3.5" />
                  무효화
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {inactiveLinks.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            만료/무효 ({inactiveLinks.length})
          </h4>
          <ul className="divide-y rounded-lg border opacity-70">
            {inactiveLinks.map((link) => (
              <li
                key={link.id}
                className="flex flex-wrap items-center gap-2 px-3 py-2"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  /w/{link.token.slice(0, 10)}…
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {link.revokedAt ? "무효화" : "만료"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {link.revokedAt
                    ? `무효 ${formatDateTime(link.revokedAt)}`
                    : `만료 ${formatDateTime(link.expiresAt)}`}
                </span>
                {link.lastAccessedAt && (
                  <span className="text-xs text-muted-foreground">
                    · 마지막 접근 {formatDateTime(link.lastAccessedAt)} (
                    {link.accessCount}회)
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Dialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>매직링크 무효화</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{userName}</span>
              <span className="text-muted-foreground">
                {" "}
                님의 링크를 무효화합니다. 이후 해당 URL 로는 더 이상 포털에
                접근할 수 없으며, 새 링크를 발급해 다시 전달해야 합니다.
              </span>
            </DialogDescription>
          </DialogHeader>
          {revokeTarget && (
            <div className="rounded-md bg-muted px-3 py-2 font-mono text-xs">
              /w/{revokeTarget.token.slice(0, 16)}…
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevokeTarget(null)}
              disabled={isPending}
            >
              취소
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => revokeTarget && handleRevoke(revokeTarget)}
              disabled={isPending}
            >
              {isPending && busyLinkId !== null ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <ShieldOff className="mr-1.5 h-4 w-4" />
              )}
              무효화
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

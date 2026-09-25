"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Link2, Loader2, Plus, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Section, StatusBadge } from "@/components/backoffice/ui";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
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
 * 섹션 카드(제목 + 발급 버튼 + 목록)로 그려진다.
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

  const issuing = isPending && busyLinkId === null;

  return (
    <Section
      title="순찰 매직링크"
      description="카톡 등으로 전달하면 폰에서 QR 순찰을 할 수 있어요. 본인 확인은 전화번호 뒷 4자리, 기본 90일 뒤 만료돼요."
      flush
      actions={
        <Button type="button" size="sm" onClick={handleIssue} disabled={isPending}>
          {issuing ? <Loader2 className="animate-spin" /> : <Plus />}
          {issuing ? "발급 중…" : "새 링크 발급"}
        </Button>
      }
    >
      <div className="border-t border-stroke-neutral-muted">
        <p className="px-x5 pb-x1 pt-x4 t3-medium text-fg-neutral-subtle">
          사용 중 <span className="tabular-nums">{activeLinks.length}</span>
        </p>
        {activeLinks.length === 0 ? (
          <EmptyState
            compact
            icon={Link2}
            title="사용 중인 링크가 없어요"
            description="새 링크를 발급하면 자동으로 복사돼요."
          />
        ) : (
          <ul className="flex flex-col pb-x2">
            {activeLinks.map((link) => (
              <li
                key={link.id}
                className="flex flex-col gap-x2 px-x5 py-x3 sm:flex-row sm:items-center sm:gap-x3"
              >
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => copy(link.token)}
                    className="inline-flex max-w-full items-center gap-x1_5 rounded-r2 bg-bg-neutral-weak px-x2_5 py-x1 t3-medium text-fg-neutral-muted transition-colors hover:bg-bg-neutral-weak-pressed hover:text-fg-neutral"
                    title="눌러서 복사"
                    aria-label="링크 복사"
                  >
                    <Copy className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">/w/{link.token.slice(0, 10)}…</span>
                  </button>
                  <p className="mt-x1_5 t3-regular text-fg-neutral-subtle tabular-nums">
                    발급 {formatDateTime(link.issuedAt)} · 만료 {formatDateTime(link.expiresAt)}
                    {link.lastAccessedAt && (
                      <> · 마지막 접근 {formatDateTime(link.lastAccessedAt)} ({link.accessCount}회)</>
                    )}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRevokeTarget(link)}
                  disabled={isPending}
                  className="self-start sm:self-auto"
                >
                  <ShieldOff />
                  무효화
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {inactiveLinks.length > 0 && (
        <div className="border-t border-stroke-neutral-muted">
          <p className="px-x5 pb-x1 pt-x4 t3-medium text-fg-neutral-subtle">
            만료·무효 <span className="tabular-nums">{inactiveLinks.length}</span>
          </p>
          <ul className="flex flex-col pb-x2">
            {inactiveLinks.map((link) => (
              <li
                key={link.id}
                className="flex flex-wrap items-center gap-x2 px-x5 py-x2_5"
              >
                <span className="t3-regular text-fg-neutral-subtle">
                  /w/{link.token.slice(0, 10)}…
                </span>
                <StatusBadge tone="gray">
                  {link.revokedAt ? "무효화" : "만료"}
                </StatusBadge>
                <span className="t3-regular text-fg-neutral-subtle tabular-nums">
                  {link.revokedAt
                    ? `무효 ${formatDateTime(link.revokedAt)}`
                    : `만료 ${formatDateTime(link.expiresAt)}`}
                  {link.lastAccessedAt &&
                    ` · 마지막 접근 ${formatDateTime(link.lastAccessedAt)} (${link.accessCount}회)`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        title="매직링크를 무효화할까요?"
        description={
          <>
            <span className="t4-bold text-fg-neutral">{userName}</span>님은 이 링크로 더 이상 포털에 들어올 수 없어요.
            다시 쓰려면 새 링크를 발급해 전달해야 해요.
          </>
        }
        tone="critical"
        confirmLabel="무효화"
        pendingLabel="무효화 중…"
        pending={isPending}
        onConfirm={() => revokeTarget && handleRevoke(revokeTarget)}
      >
        {revokeTarget && (
          <p className="rounded-r2 bg-bg-layer-fill px-x3 py-x2_5 t3-regular text-fg-neutral-muted">
            /w/{revokeTarget.token.slice(0, 16)}…
          </p>
        )}
      </ConfirmDialog>
    </Section>
  );
}

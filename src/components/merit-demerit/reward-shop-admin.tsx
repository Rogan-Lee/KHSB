"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, FormField, Section, StatusBadge, type Tone } from "@/components/backoffice/ui";
import { Check, X, Package, Plus, Pencil, Trash2, Gift, Inbox } from "lucide-react";
import {
  decideRedemption,
  createRewardItem,
  updateRewardItem,
  deleteRewardItem,
} from "@/actions/rewards";
import { pointsToKrw } from "@/lib/points";
import { cn } from "@/lib/utils";
import type { RedemptionStatus } from "@/generated/prisma/enums";
import { useConfirmDialog } from "@/components/suggestions/use-confirm-dialog";

export type AdminRedemptionRow = {
  id: string;
  studentName: string;
  grade: string;
  itemName: string;
  points: number;
  status: RedemptionStatus;
  note: string | null;
  decidedByName: string | null;
  createdAt: string;
};

export type AdminItemRow = {
  id: string;
  name: string;
  points: number;
  active: boolean;
  sortOrder: number;
};

const STATUS_META: Record<RedemptionStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "대기", tone: "warn" },
  APPROVED: { label: "승인", tone: "info" },
  REJECTED: { label: "거절", tone: "gray" },
  FULFILLED: { label: "지급완료", tone: "ok" },
};

const STATUS_TABS: RedemptionStatus[] = ["PENDING", "APPROVED", "FULFILLED", "REJECTED"];

const EMPTY_TEXT: Record<RedemptionStatus, string> = {
  PENDING: "처리할 교환 신청이 없어요",
  APPROVED: "지급을 기다리는 신청이 없어요",
  FULFILLED: "지급 완료된 신청이 없어요",
  REJECTED: "거절한 신청이 없어요",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  });
}

export function RewardShopAdmin({
  redemptions,
  items,
  canManageItems,
}: {
  redemptions: AdminRedemptionRow[];
  items: AdminItemRow[];
  canManageItems: boolean;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const { confirm, prompt, dialog } = useConfirmDialog();

  function run(fn: () => Promise<unknown>, ok: string) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(ok);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "처리 실패");
      }
    });
  }

  async function reject(r: AdminRedemptionRow) {
    const reason = await prompt({
      title: "교환 신청을 거절할까요?",
      description: `${r.studentName} · ${r.itemName} (${r.points}점)`,
      label: "거절 사유 (선택)",
      placeholder: "학생에게 보일 사유를 적어 주세요",
      multiline: true,
      confirmLabel: "거절",
      destructive: true,
    });
    if (reason === null) return;
    run(() => decideRedemption(r.id, "reject", reason || undefined), "거절했습니다");
  }

  const countOf = (s: RedemptionStatus) => redemptions.filter((r) => r.status === s).length;

  function renderRow(r: AdminRedemptionRow) {
    const meta = STATUS_META[r.status];
    return (
      <li key={r.id} className="flex flex-col gap-x3 px-x5 py-x4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x1_5">
            <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
            <span className="t4-bold text-fg-neutral">{r.studentName}</span>
            <span className="t3-regular text-fg-neutral-subtle">{r.grade}</span>
          </div>
          <p className="mt-x1 t4-regular text-fg-neutral">
            {r.itemName}
            <span className="ml-x1_5 t4-medium tabular-nums text-fg-brand">{r.points}점</span>
          </p>
          <p className="mt-x0_5 t3-regular tabular-nums text-fg-neutral-subtle">
            {fmtDate(r.createdAt)} 신청
            {r.decidedByName ? ` · 처리: ${r.decidedByName}` : ""}
            {r.note ? ` · ${r.note}` : ""}
          </p>
        </div>
        {r.status === "PENDING" && (
          <div className="flex shrink-0 gap-x2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => run(() => decideRedemption(r.id, "approve"), "승인했습니다")}
              className="flex-1 sm:flex-none"
            >
              <Check /> 승인
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => reject(r)} className="flex-1 sm:flex-none">
              <X /> 거절
            </Button>
          </div>
        )}
        {r.status === "APPROVED" && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => run(() => decideRedemption(r.id, "fulfill"), "지급 처리했습니다")}
            className="w-full sm:w-auto"
          >
            <Package /> 지급 완료
          </Button>
        )}
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-x6">
      {/* 교환 신청 목록 */}
      <Section
        title="교환 신청"
        description="학생이 포인트로 신청한 기프티콘을 승인하고 지급해요 · 25점 = 10,000원"
        flush
      >
        <Tabs defaultValue="PENDING">
          <div className="px-x5 pb-x3">
            <TabsList variant="segment">
              {STATUS_TABS.map((s) => (
                <TabsTrigger key={s} value={s}>
                  {STATUS_META[s].label}
                  <span className="tabular-nums text-fg-neutral-subtle">{countOf(s)}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {STATUS_TABS.map((s) => {
            const rows = redemptions.filter((r) => r.status === s);
            return (
              <TabsContent key={s} value={s} className="mt-0 border-t border-stroke-neutral-muted">
                {rows.length === 0 ? (
                  <EmptyState compact icon={Inbox} title={EMPTY_TEXT[s]} />
                ) : (
                  <ul className="divide-y divide-stroke-neutral-muted">{rows.map(renderRow)}</ul>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </Section>

      {/* 상품 관리 */}
      {canManageItems && <ItemManager items={items} busy={busy} run={run} confirm={confirm} />}

      {dialog}
    </div>
  );
}

function ItemManager({
  items,
  busy,
  run,
  confirm,
}: {
  items: AdminItemRow[];
  busy: boolean;
  run: (fn: () => Promise<unknown>, ok: string) => void;
  confirm: ReturnType<typeof useConfirmDialog>["confirm"];
}) {
  const [name, setName] = useState("");
  const [points, setPoints] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPoints, setEditPoints] = useState("");

  function add() {
    const p = parseInt(points, 10);
    if (!name.trim()) return toast.error("상품명을 입력해 주세요");
    if (!Number.isInteger(p) || p <= 0) return toast.error("필요 포인트를 입력해 주세요");
    run(async () => {
      await createRewardItem({ name, points: p });
      setName("");
      setPoints("");
    }, "상품을 등록했습니다");
  }

  function saveEdit(id: string) {
    const p = parseInt(editPoints, 10);
    if (!editName.trim()) return toast.error("상품명을 입력해 주세요");
    if (!Number.isInteger(p) || p <= 0) return toast.error("필요 포인트를 입력해 주세요");
    run(async () => {
      await updateRewardItem(id, { name: editName, points: p });
      setEditingId(null);
    }, "상품을 수정했습니다");
  }

  async function remove(item: AdminItemRow) {
    const ok = await confirm({
      title: `"${item.name}" 상품을 삭제할까요?`,
      description: "교환 내역이 있는 상품은 삭제 대신 숨김 처리돼요.",
      confirmLabel: "삭제",
      destructive: true,
    });
    if (!ok) return;
    run(() => deleteRewardItem(item.id), "상품을 삭제했습니다");
  }

  return (
    <Section title="상품 관리" description="학생 포털 상점에 보이는 상품과 필요 포인트예요." count={items.length}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="mb-x5 grid grid-cols-1 items-end gap-x3 sm:grid-cols-[minmax(0,1fr)_140px_auto]"
      >
        <FormField label="상품명" htmlFor="reward-item-name">
          <Input
            id="reward-item-name"
            placeholder="예: 치킨 기프티콘"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>
        <FormField label="필요 포인트" htmlFor="reward-item-points">
          <Input
            id="reward-item-points"
            type="number"
            placeholder="25"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            className="tabular-nums"
          />
        </FormField>
        <Button type="submit" disabled={busy}>
          <Plus /> 등록
        </Button>
      </form>

      {items.length === 0 ? (
        <div className="rounded-r3 border border-stroke-neutral-muted">
          <EmptyState compact icon={Gift} title="등록된 상품이 없어요" description="위에서 첫 상품을 등록해 보세요." />
        </div>
      ) : (
        <ul className="divide-y divide-stroke-neutral-muted overflow-hidden rounded-r3 border border-stroke-neutral-muted">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-x2 px-x4 py-x3">
              {editingId === item.id ? (
                <>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    aria-label="상품명"
                    className="h-9 min-w-40 flex-1"
                  />
                  <Input
                    type="number"
                    value={editPoints}
                    onChange={(e) => setEditPoints(e.target.value)}
                    aria-label="필요 포인트"
                    className="h-9 w-24 tabular-nums"
                  />
                  <Button size="sm" disabled={busy} onClick={() => saveEdit(item.id)}>
                    저장
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditingId(null)}>
                    취소
                  </Button>
                </>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x1_5">
                      <span
                        className={cn(
                          "t4-medium",
                          item.active ? "text-fg-neutral" : "text-fg-neutral-subtle line-through",
                        )}
                      >
                        {item.name}
                      </span>
                      {!item.active && <StatusBadge tone="gray">숨김</StatusBadge>}
                    </div>
                    <p className="mt-x0_5 t3-regular tabular-nums text-fg-neutral-subtle">
                      {item.points}점 · 약 {pointsToKrw(item.points).toLocaleString("ko-KR")}원
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => updateRewardItem(item.id, { active: !item.active }),
                        item.active ? "상품을 숨겼습니다" : "상품을 다시 노출합니다"
                      )
                    }
                  >
                    {item.active ? "숨기기" : "다시 노출"}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={busy}
                    aria-label={`${item.name} 수정`}
                    onClick={() => {
                      setEditingId(item.id);
                      setEditName(item.name);
                      setEditPoints(String(item.points));
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={busy}
                    aria-label={`${item.name} 삭제`}
                    className="text-fg-critical"
                    onClick={() => remove(item)}
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

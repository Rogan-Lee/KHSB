"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, Package, Plus, Pencil, Trash2 } from "lucide-react";
import {
  decideRedemption,
  createRewardItem,
  updateRewardItem,
  deleteRewardItem,
} from "@/actions/rewards";
import { pointsToKrw } from "@/lib/points";
import type { RedemptionStatus } from "@/generated/prisma/enums";

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

const STATUS_META: Record<RedemptionStatus, { label: string; tone: string }> = {
  PENDING: { label: "대기", tone: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "승인", tone: "bg-blue-100 text-blue-700" },
  REJECTED: { label: "거절", tone: "bg-gray-100 text-gray-600" },
  FULFILLED: { label: "지급완료", tone: "bg-emerald-100 text-emerald-700" },
};

const STATUS_TABS: RedemptionStatus[] = ["PENDING", "APPROVED", "FULFILLED", "REJECTED"];

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

  function reject(id: string) {
    const reason = window.prompt("거절 사유 (선택)") ?? undefined;
    run(() => decideRedemption(id, "reject", reason || undefined), "거절했습니다");
  }

  const countOf = (s: RedemptionStatus) => redemptions.filter((r) => r.status === s).length;

  function renderRow(r: AdminRedemptionRow) {
    const meta = STATUS_META[r.status];
    return (
      <li key={r.id} className="flex items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium">{r.studentName}</span>
          <span className="ml-1.5 text-xs text-muted-foreground">{r.grade}</span>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {r.itemName} · {r.points}점 · {fmtDate(r.createdAt)}
            {r.note ? ` · ${r.note}` : ""}
            {r.decidedByName ? ` · 처리: ${r.decidedByName}` : ""}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.tone}`}>
          {meta.label}
        </span>
        {r.status === "PENDING" && (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => run(() => decideRedemption(r.id, "approve"), "승인했습니다")}
            >
              <Check className="h-3.5 w-3.5 mr-1" /> 승인
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => reject(r.id)}>
              <X className="h-3.5 w-3.5 mr-1" /> 거절
            </Button>
          </>
        )}
        {r.status === "APPROVED" && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => run(() => decideRedemption(r.id, "fulfill"), "지급 처리했습니다")}
          >
            <Package className="h-3.5 w-3.5 mr-1" /> 지급
          </Button>
        )}
      </li>
    );
  }

  return (
    <div className="space-y-6">
      {/* 교환 신청 목록 */}
      <div>
        <Tabs defaultValue="PENDING">
          <TabsList>
            {STATUS_TABS.map((s) => (
              <TabsTrigger key={s} value={s}>
                {STATUS_META[s].label} ({countOf(s)})
              </TabsTrigger>
            ))}
          </TabsList>
          {STATUS_TABS.map((s) => {
            const rows = redemptions.filter((r) => r.status === s);
            return (
              <TabsContent key={s} value={s} className="mt-3">
                {rows.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                    {STATUS_META[s].label} 상태의 신청이 없습니다
                  </p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border">{rows.map(renderRow)}</ul>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </div>

      {/* 상품 관리 */}
      {canManageItems && <ItemManager items={items} busy={busy} run={run} />}
    </div>
  );
}

function ItemManager({
  items,
  busy,
  run,
}: {
  items: AdminItemRow[];
  busy: boolean;
  run: (fn: () => Promise<unknown>, ok: string) => void;
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

  return (
    <div>
      <p className="mb-2 text-sm font-medium">상품 관리</p>
      <div className="mb-3 flex gap-2">
        <Input
          placeholder="상품명 (예: 치킨 기프티콘)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1"
        />
        <Input
          type="number"
          placeholder="포인트"
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          className="w-24"
        />
        <Button size="sm" disabled={busy} onClick={add}>
          <Plus className="h-4 w-4 mr-1" /> 등록
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          등록된 상품이 없습니다
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 px-3 py-2.5">
              {editingId === item.id ? (
                <>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-8 flex-1"
                  />
                  <Input
                    type="number"
                    value={editPoints}
                    onChange={(e) => setEditPoints(e.target.value)}
                    className="h-8 w-20"
                  />
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => saveEdit(item.id)}>
                    저장
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditingId(null)}>
                    취소
                  </Button>
                </>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <span className={`text-sm font-medium ${item.active ? "" : "text-muted-foreground line-through"}`}>
                      {item.name}
                    </span>
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {item.points}점 · 약 {pointsToKrw(item.points).toLocaleString("ko-KR")}원
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => updateRewardItem(item.id, { active: !item.active }),
                        item.active ? "상품을 숨겼습니다" : "상품을 다시 노출합니다"
                      )
                    }
                  >
                    {item.active ? "노출중" : "숨김"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setEditingId(item.id);
                      setEditName(item.name);
                      setEditPoints(String(item.points));
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(`"${item.name}" 상품을 삭제할까요? 교환 내역이 있으면 숨김 처리됩니다.`)) return;
                      run(() => deleteRewardItem(item.id), "상품을 삭제했습니다");
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

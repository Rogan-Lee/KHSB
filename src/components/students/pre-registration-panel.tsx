"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, UserCheck, Loader2 } from "lucide-react";
import {
  createPreRegistration,
  deletePreRegistration,
  formalizePreRegistration,
  checkSeatAvailability,
} from "@/actions/pre-registrations";

type PreReg = {
  id: string;
  name: string;
  parentPhone: string | null;
  phone: string | null;
  grade: string | null;
  school: string | null;
  tentativeSeat: string | null;
  startDate: Date | null;
  memo: string | null;
};

export function PreRegistrationPanel({ initial, canFormalize }: { initial: PreReg[]; canFormalize: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await createPreRegistration(fd);
        toast.success("예비등록을 추가했어요");
        setShowForm(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "추가 실패");
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm("이 예비등록을 삭제할까요?")) return;
    startTransition(async () => {
      try {
        await deletePreRegistration(id);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "삭제 실패");
      }
    });
  }

  function handleFormalize(p: PreReg) {
    startTransition(async () => {
      try {
        let checkoutOccupantId: string | undefined;
        if (p.tentativeSeat) {
          const { occupiedBy } = await checkSeatAvailability(p.tentativeSeat);
          if (occupiedBy) {
            const ok = confirm(
              `좌석 ${p.tentativeSeat}번은 현재 ${occupiedBy.name} 학생이 사용 중입니다.\n` +
                `${occupiedBy.name} 학생을 퇴원 처리하고 ${p.name} 학생에게 좌석을 인계할까요?\n\n` +
                `취소하면 좌석을 비운 채로 등록만 진행합니다.`,
            );
            if (ok) checkoutOccupantId = occupiedBy.id;
          }
        }
        if (!confirm(`${p.name} 학생을 정식 등록(ACTIVE)할까요?`)) return;
        const { studentId } = await formalizePreRegistration(p.id, { checkoutOccupantId });
        toast.success("정식 등록되었습니다");
        router.push(`/students/${studentId}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "정식 등록 실패");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          예비 학생을 입력하고 좌석을 <b>가배정</b>한 뒤, 정식 등록 시 ACTIVE 학생으로 전환됩니다.
        </p>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4 mr-1" />예비등록 추가
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="rounded-lg border bg-card p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5"><Label htmlFor="pr-name">이름 *</Label><Input id="pr-name" name="name" required /></div>
          <div className="space-y-1.5"><Label htmlFor="pr-grade">학년</Label><Input id="pr-grade" name="grade" placeholder="예: 고2" /></div>
          <div className="space-y-1.5"><Label htmlFor="pr-seat">가배정 좌석</Label><Input id="pr-seat" name="tentativeSeat" placeholder="예: 12" /></div>
          <div className="space-y-1.5"><Label htmlFor="pr-parent">학부모 연락처</Label><Input id="pr-parent" name="parentPhone" placeholder="010-..." /></div>
          <div className="space-y-1.5"><Label htmlFor="pr-phone">학생 연락처</Label><Input id="pr-phone" name="phone" /></div>
          <div className="space-y-1.5"><Label htmlFor="pr-school">학교</Label><Input id="pr-school" name="school" /></div>
          <div className="space-y-1.5"><Label htmlFor="pr-start">등원 예정일</Label><Input id="pr-start" name="startDate" type="date" /></div>
          <div className="space-y-1.5 col-span-2"><Label htmlFor="pr-memo">메모</Label><Input id="pr-memo" name="memo" placeholder="선택과목·특이사항 등" /></div>
          <div className="col-span-full flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>취소</Button>
            <Button type="submit" size="sm" disabled={pending}>{pending ? "추가 중…" : "추가"}</Button>
          </div>
        </form>
      )}

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">이름</th>
              <th className="px-3 py-2 text-left">학년</th>
              <th className="px-3 py-2 text-center">가배정</th>
              <th className="px-3 py-2 text-left">학부모</th>
              <th className="px-3 py-2 text-left">학교</th>
              <th className="px-3 py-2 text-left">메모</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {initial.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">예비등록이 없습니다</td></tr>
            ) : (
              initial.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 font-medium">{p.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.grade ?? "—"}</td>
                  <td className="px-3 py-2 text-center font-mono">{p.tentativeSeat ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.parentPhone ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.school ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground truncate max-w-[160px]">{p.memo ?? "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {canFormalize && (
                        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={pending} onClick={() => handleFormalize(p)}>
                          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                          정식 등록
                        </Button>
                      )}
                      <button type="button" onClick={() => handleDelete(p.id)} disabled={pending} className="p-1 rounded text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

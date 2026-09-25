"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, FormActions, FormField, Section } from "@/components/backoffice/ui";
import { Plus, Trash2, UserCheck, Loader2, UserPlus } from "lucide-react";
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

  // 삭제 확인 — 브라우저 confirm 대신 다이얼로그로 묻는다
  const [deleteTarget, setDeleteTarget] = useState<PreReg | null>(null);

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deletePreRegistration(id);
        setDeleteTarget(null);
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

  const addButton = (
    <Button size="sm" variant={showForm ? "secondary" : "default"} onClick={() => setShowForm((v) => !v)}>
      <Plus />예비등록 추가
    </Button>
  );

  return (
    <>
      <Section
        title="예비등록"
        count={initial.length || undefined}
        description="예비 학생을 입력하고 좌석을 가배정해 두세요. 정식 등록하면 재원생(ACTIVE)으로 전환돼요."
        actions={addButton}
        flush
        className="overflow-hidden"
      >
        {showForm && (
          <form onSubmit={handleCreate} className="border-y border-stroke-neutral-muted bg-bg-layer-fill px-x5 py-x5">
            <div className="grid grid-cols-1 gap-x4 sm:grid-cols-2 lg:grid-cols-3">
              <FormField label="이름" htmlFor="pr-name" required><Input id="pr-name" name="name" required /></FormField>
              <FormField label="학년" htmlFor="pr-grade"><Input id="pr-grade" name="grade" placeholder="예: 고2" /></FormField>
              <FormField label="가배정 좌석" htmlFor="pr-seat"><Input id="pr-seat" name="tentativeSeat" placeholder="예: 12" /></FormField>
              <FormField label="학부모 연락처" htmlFor="pr-parent"><Input id="pr-parent" name="parentPhone" placeholder="010-..." /></FormField>
              <FormField label="학생 연락처" htmlFor="pr-phone"><Input id="pr-phone" name="phone" /></FormField>
              <FormField label="학교" htmlFor="pr-school"><Input id="pr-school" name="school" /></FormField>
              <FormField label="등원 예정일" htmlFor="pr-start"><Input id="pr-start" name="startDate" type="date" /></FormField>
              <FormField label="메모" htmlFor="pr-memo" className="sm:col-span-2"><Input id="pr-memo" name="memo" placeholder="선택과목·특이사항 등" /></FormField>
            </div>
            <FormActions className="mt-x4">
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>취소</Button>
              <Button type="submit" disabled={pending}>{pending ? "추가 중…" : "추가"}</Button>
            </FormActions>
          </form>
        )}

        {initial.length === 0 ? (
          !showForm && (
            <EmptyState
              compact
              icon={UserPlus}
              title="아직 예비등록한 학생이 없어요"
              description="등록 예정인 학생을 먼저 적어 두면 좌석을 미리 잡아 둘 수 있어요."
              className="pb-x10"
            />
          )
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>학년</TableHead>
                <TableHead>가배정 좌석</TableHead>
                <TableHead>학부모</TableHead>
                <TableHead>학교</TableHead>
                <TableHead>메모</TableHead>
                <TableHead><span className="sr-only">관리</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initial.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="t4-medium whitespace-nowrap">{p.name}</TableCell>
                  <TableCell className="whitespace-nowrap text-fg-neutral-muted">{p.grade ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{p.tentativeSeat ? `${p.tentativeSeat}번` : "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-fg-neutral-muted tabular-nums">{p.parentPhone ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-fg-neutral-muted">{p.school ?? "—"}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-fg-neutral-muted" title={p.memo ?? undefined}>{p.memo ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-x1">
                      {canFormalize && (
                        <Button size="xs" variant="outline" disabled={pending} onClick={() => handleFormalize(p)}>
                          {pending ? <Loader2 className="animate-spin" /> : <UserCheck />}
                          정식 등록
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-fg-neutral-subtle hover:text-fg-critical"
                        onClick={() => setDeleteTarget(p)}
                        disabled={pending}
                        aria-label={`${p.name} 예비등록 삭제`}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && !pending && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>예비등록을 삭제할까요?</DialogTitle>
            <DialogDescription>
              {deleteTarget?.name} 학생의 예비등록과 가배정 좌석 정보가 사라져요.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={pending}>취소</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget.id)}
              disabled={pending}
            >
              {pending ? "삭제 중…" : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

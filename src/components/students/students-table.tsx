"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, ArrowLeftRight, LogOut, LogIn, ChevronRight, AlertTriangle, CircleAlert } from "lucide-react";
import { checkoutStudent, readmitStudent, moveStudentSeat, swapStudentSeats, updateStudentSeat } from "@/actions/students";
import { toast } from "sonner";
import type { Student, User, AttendanceSchedule } from "@/generated/prisma";
import { useSortableTable } from "@/hooks/use-sortable-table";
import { FormField, Notice, StatusBadge, TableCard } from "@/components/backoffice/ui";
import { SortHead } from "./sort-head";
import { StudentAvatar } from "./student-avatar";
import { STUDENT_STATUS } from "./student-status";

type StudentWithRelations = Student & {
  mentor: Pick<User, "name"> | null;
  schedules: AttendanceSchedule[];
};

// ── 좌석 변경 다이얼로그 ──────────────────────────────
function SeatChangeDialog({
  student,
  allStudents,
  open,
  onClose,
}: {
  student: StudentWithRelations;
  allStudents: StudentWithRelations[];
  open: boolean;
  onClose: (refresh?: boolean) => void;
}) {
  const [newSeat, setNewSeat] = useState(student.seat ?? "");
  const [isPending, startTransition] = useTransition();

  const occupant = newSeat.trim()
    ? allStudents.find(
        (s) => s.seat === newSeat.trim() && s.id !== student.id
      ) ?? null
    : null;

  function handleSubmit() {
    const trimmed = newSeat.trim();
    if (!trimmed) return;

    startTransition(async () => {
      try {
        if (occupant) {
          await swapStudentSeats(student.id, occupant.id);
          toast.success(`${student.name} ↔ ${occupant.name} 좌석 교환 완료`);
        } else {
          await moveStudentSeat(student.id, trimmed);
          toast.success(`${student.name} → ${trimmed} 좌석 이동 완료`);
        }
        onClose(true);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "좌석 변경 실패");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>좌석 변경</DialogTitle>
          <DialogDescription>
            {student.name} · 현재 좌석 <span className="t4-medium text-fg-neutral tabular-nums">{student.seat || "미배정"}</span>
          </DialogDescription>
        </DialogHeader>
        <FormField label="새 좌석 번호" htmlFor="seat-change-input">
          <Input
            id="seat-change-input"
            value={newSeat}
            onChange={(e) => setNewSeat(e.target.value)}
            placeholder="예: A-01"
            autoFocus
          />
        </FormField>
        {occupant && (
          <Notice tone="warn" icon={AlertTriangle} title={`${newSeat.trim()} 자리에 ${occupant.name}이(가) 있습니다.`}>
            확인하면 두 학생의 좌석을 맞교환합니다.
          </Notice>
        )}
        {newSeat.trim() && !occupant && newSeat.trim() !== student.seat && (
          <p className="t3-medium text-fg-positive">빈 자리입니다. 이동합니다.</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose()} disabled={isPending}>취소</Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !newSeat.trim() || newSeat.trim() === student.seat}
          >
            {isPending ? "처리 중…" : occupant ? "교환" : "이동"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 퇴실 확인 다이얼로그 ──────────────────────────────
function CheckoutDialog({
  student,
  open,
  onClose,
}: {
  student: StudentWithRelations;
  open: boolean;
  onClose: (refresh?: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleCheckout() {
    startTransition(async () => {
      try {
        await checkoutStudent(student.id);
        toast.success(`${student.name} 퇴실 처리 완료`);
        onClose(true);
      } catch {
        toast.error("퇴실 처리 실패");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>퇴실 처리</DialogTitle>
          <DialogDescription>
            <span className="t4-medium text-fg-neutral">{student.name}</span>
            {student.seat && <span className="tabular-nums"> ({student.seat})</span>}
            의 퇴실을 처리합니다.
          </DialogDescription>
        </DialogHeader>
        <Notice tone="warn" icon={AlertTriangle}>
          좌석이 반납되고 비활성 상태로 전환됩니다. 멘토링, 출결 등 기록은 보존됩니다.
        </Notice>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose()} disabled={isPending}>취소</Button>
          <Button variant="destructive" onClick={handleCheckout} disabled={isPending}>
            {isPending ? "처리 중…" : "퇴실 처리"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 재입실 다이얼로그 ──────────────────────────────
function ReadmitDialog({
  student,
  allStudents,
  open,
  onClose,
}: {
  student: StudentWithRelations;
  allStudents: StudentWithRelations[];
  open: boolean;
  onClose: (refresh?: boolean) => void;
}) {
  // 퇴원 전 좌석 기록 (현재 seat 필드에 남아있을 수 있음 — 없으면 빈칸)
  const lastSeat = student.seat?.trim() || "";
  const [newSeat, setNewSeat] = useState(lastSeat);
  const [isPending, startTransition] = useTransition();

  // 해당 좌석에 현재 다른 학생이 있는지 확인
  const occupant = newSeat
    ? allStudents.find((s) => s.seat === newSeat && s.id !== student.id && s.status === "ACTIVE") ?? null
    : null;

  function handleReadmit() {
    if (occupant) {
      toast.error(`${newSeat}번 좌석에 ${occupant.name}이(가) 있습니다. 다른 좌석을 선택하세요.`);
      return;
    }
    startTransition(async () => {
      try {
        await readmitStudent(student.id);
        if (newSeat) await updateStudentSeat(student.id, newSeat);
        toast.success(`${student.name} 재입실 완료${newSeat ? ` (${newSeat}번 좌석)` : ""}`);
        onClose(true);
      } catch {
        toast.error("재입실 처리 실패");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>재입실 처리</DialogTitle>
          <DialogDescription>
            {student.name}
            {lastSeat && (
              <>
                {" "}· 퇴원 전 좌석 <span className="t4-medium text-fg-neutral tabular-nums">{lastSeat}번</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <FormField label="좌석 번호" htmlFor="readmit-seat-input" hint="비워 두면 미배정으로 재입실해요">
          <Input
            id="readmit-seat-input"
            value={newSeat}
            onChange={(e) => setNewSeat(e.target.value)}
            placeholder="좌석 번호 입력 (비워두면 미배정)"
            autoFocus
          />
        </FormField>
        {occupant && (
          <Notice tone="bad" icon={CircleAlert} title={`${newSeat}번 좌석에 ${occupant.name}이(가) 있습니다.`}>
            다른 좌석을 선택하세요.
          </Notice>
        )}
        {newSeat && !occupant && <p className="t3-medium text-fg-positive">빈 좌석입니다.</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose()} disabled={isPending}>취소</Button>
          <Button onClick={handleReadmit} disabled={isPending || !!occupant}>
            {isPending ? "처리 중…" : "재입실"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const TOTAL_SEATS = 89;

// ── 메인 테이블 ──────────────────────────────────────
// 검색·필터는 상위 StudentsListView 의 툴바가 맡고, 여기서는 정렬·빈 좌석 배치·행 동작만 담당한다.
export function StudentsTable({
  students,
  allStudents,
  seatLayout = false,
}: {
  /** 툴바 필터가 적용된 표시 대상 */
  students: StudentWithRelations[];
  /** 좌석 점유 확인용 전체 원생 (없으면 students) */
  allStudents?: StudentWithRelations[];
  /** 필터·검색이 없는 기본 보기 — 정렬도 없으면 1~89번 빈 좌석을 함께 보여 준다 */
  seatLayout?: boolean;
}) {
  const router = useRouter();
  const [seatDialog, setSeatDialog] = useState<StudentWithRelations | null>(null);
  const [checkoutDialog, setCheckoutDialog] = useState<StudentWithRelations | null>(null);
  const [readmitDialog, setReadmitDialog] = useState<StudentWithRelations | null>(null);
  const everyone = allStudents ?? students;

  // 정렬 (헤더 클릭으로 3-state 토글)
  const { rows: sortedStudents, sort, toggle } = useSortableTable(students, {
    seat: (s) => {
      const n = s.seat ? parseInt(s.seat, 10) : NaN;
      return isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
    },
    name: (s) => s.name,
    school: (s) => `${s.school ?? ""} ${s.grade ?? ""}`,
    mentor: (s) => s.mentor?.name ?? "",
    startDate: (s) => new Date(s.startDate).getTime(),
    status: (s) => s.status,
  });

  function handleDialogClose(refresh = false) {
    setSeatDialog(null);
    setCheckoutDialog(null);
    setReadmitDialog(null);
    if (refresh) router.refresh();
  }

  // 기본 뷰(정렬/검색/필터/퇴원생 모드 전부 미활성)일 때만 빈 좌석 표시.
  type Row = { type: "student"; student: StudentWithRelations } | { type: "empty"; seatNum: string };
  const showEmptySeats = seatLayout && !sort;

  const rows: Row[] = [];
  let emptyCount = 0;
  if (showEmptySeats) {
    // 좌석 1~TOTAL_SEATS 순회하며 빈 좌석 같이 표시
    const seatMap = new Map<string, StudentWithRelations>();
    const noSeatStudents: StudentWithRelations[] = [];
    for (const s of students) {
      if (s.seat?.trim()) seatMap.set(s.seat.trim(), s);
      else noSeatStudents.push(s);
    }
    for (let i = 1; i <= TOTAL_SEATS; i++) {
      const key = String(i);
      const student = seatMap.get(key);
      if (student) {
        rows.push({ type: "student", student });
        seatMap.delete(key);
      } else {
        rows.push({ type: "empty", seatNum: key });
        emptyCount++;
      }
    }
    // 비숫자 좌석(A-57 등) 학생 추가
    for (const [, student] of seatMap) rows.push({ type: "student", student });
    for (const s of noSeatStudents) rows.push({ type: "student", student: s });
  } else {
    for (const s of sortedStudents) rows.push({ type: "student", student: s });
  }

  const head = { activeKey: sort?.key, dir: sort?.dir, onToggle: toggle };

  return (
    <>
      <TableCard
        footer={
          showEmptySeats ? (
            <>
              <span className="t3-regular text-fg-neutral-muted tabular-nums">
                좌석 {TOTAL_SEATS}석 중 <span className="t3-bold text-fg-neutral">{emptyCount}석</span>이 비어 있어요
              </span>
              <span className="hidden t3-regular text-fg-neutral-subtle sm:inline">
                정렬·검색·필터를 쓰면 빈 자리는 숨겨요
              </span>
            </>
          ) : undefined
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead sortKey="seat" {...head} className="w-16">좌석</SortHead>
              <SortHead sortKey="name" {...head}>이름</SortHead>
              <SortHead sortKey="school" {...head}>학교/학년</SortHead>
              <TableHead>연락처</TableHead>
              <TableHead>학부모 연락처</TableHead>
              <SortHead sortKey="mentor" {...head}>담당 멘토</SortHead>
              <TableHead>특이사항</TableHead>
              <SortHead sortKey="startDate" {...head}>등원일</SortHead>
              <SortHead sortKey="status" {...head}>상태</SortHead>
              <TableHead className="w-12"><span className="sr-only">메뉴</span></TableHead>
              <TableHead className="w-10"><span className="sr-only">상세</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              if (row.type === "empty") {
                return (
                  <TableRow key={`empty-${row.seatNum}`} className="hover:bg-transparent">
                    <TableCell className="h-10 py-x2 t4-regular text-fg-placeholder tabular-nums">{row.seatNum}</TableCell>
                    <TableCell colSpan={10} className="h-10 py-x2 t3-regular text-fg-placeholder">
                      빈 자리
                    </TableCell>
                  </TableRow>
                );
              }

              const student = row.student;
              const status = STUDENT_STATUS[student.status];
              return (
                <TableRow
                  key={student.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/students/${student.id}`)}
                >
                  <TableCell className="whitespace-nowrap t4-medium tabular-nums">
                    {student.seat || <span className="text-fg-placeholder">—</span>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex items-center gap-x2_5">
                      <StudentAvatar name={student.name} imageUrl={student.imageUrl} size={32} />
                      <Link
                        href={`/students/${student.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="t4-medium text-fg-neutral hover:underline focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
                      >
                        {student.name}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span>{[student.school, student.grade].filter(Boolean).join(" ") || "—"}</span>
                    {student.classGroup && (
                      <span className="ml-x1_5 t3-regular text-fg-neutral-subtle">{student.classGroup}</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-fg-neutral-muted tabular-nums">{student.phone || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-fg-neutral-muted tabular-nums">{student.parentPhone}</TableCell>
                  <TableCell className="whitespace-nowrap">{student.mentor?.name || <span className="text-fg-placeholder">—</span>}</TableCell>
                  <TableCell className="max-w-[200px]" title={student.studentInfo || undefined}>
                    {student.studentInfo ? (
                      <span className="line-clamp-1 t3-regular text-fg-neutral-muted">{student.studentInfo}</span>
                    ) : (
                      <span className="text-fg-placeholder">—</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-fg-neutral-muted tabular-nums">{formatDate(student.startDate)}</TableCell>
                  <TableCell>
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8" aria-label={`${student.name} 메뉴`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {student.status === "WITHDRAWN" ? (
                          <DropdownMenuItem onClick={() => setReadmitDialog(student)}>
                            <LogIn />
                            재입실 처리
                          </DropdownMenuItem>
                        ) : (
                          <>
                            <DropdownMenuItem onClick={() => setSeatDialog(student)}>
                              <ArrowLeftRight />
                              좌석 변경
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-fg-critical focus:text-fg-critical"
                              onClick={() => setCheckoutDialog(student)}
                            >
                              <LogOut />
                              퇴실 처리
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="size-4 text-fg-placeholder" aria-hidden />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>

      {seatDialog && (
        <SeatChangeDialog
          student={seatDialog}
          allStudents={everyone}
          open={!!seatDialog}
          onClose={(refresh) => handleDialogClose(refresh)}
        />
      )}
      {checkoutDialog && (
        <CheckoutDialog
          student={checkoutDialog}
          open={!!checkoutDialog}
          onClose={(refresh) => handleDialogClose(refresh)}
        />
      )}
      {readmitDialog && (
        <ReadmitDialog
          student={readmitDialog}
          allStudents={everyone}
          open={!!readmitDialog}
          onClose={(refresh) => handleDialogClose(refresh)}
        />
      )}
    </>
  );
}

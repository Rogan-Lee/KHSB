"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { MoreHorizontal, ArrowLeftRight, LogOut, LogIn, ChevronRight, Search, X, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { checkoutStudent, readmitStudent, moveStudentSeat, swapStudentSeats } from "@/actions/students";
import { toast } from "sonner";
import type { Student, User, AttendanceSchedule } from "@/generated/prisma";

type StudentWithRelations = Student & {
  mentor: Pick<User, "name"> | null;
  schedules: AttendanceSchedule[];
};

const STATUS_MAP = {
  ACTIVE: { label: "재원", variant: "default" as const },
  INACTIVE: { label: "휴원", variant: "secondary" as const },
  GRADUATED: { label: "졸업", variant: "outline" as const },
  WITHDRAWN: { label: "퇴원", variant: "destructive" as const },
};

type SortKey = "seat" | "name" | "school" | "startDate" | "status";
type SortDir = "asc" | "desc";

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown className="inline h-3 w-3 ml-1 opacity-30" />;
  return sortDir === "asc"
    ? <ArrowUp className="inline h-3 w-3 ml-1 text-foreground" />
    : <ArrowDown className="inline h-3 w-3 ml-1 text-foreground" />;
}

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
          <DialogTitle>좌석 변경 — {student.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="text-sm text-muted-foreground">
            현재 좌석: <span className="font-mono font-medium text-foreground">{student.seat || "미배정"}</span>
          </div>
          <div className="space-y-1.5">
            <Label>새 좌석 번호</Label>
            <Input
              value={newSeat}
              onChange={(e) => setNewSeat(e.target.value)}
              placeholder="예: A-01"
              autoFocus
            />
          </div>
          {occupant && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm">
              <span className="font-medium text-orange-800">{newSeat.trim()}</span>
              <span className="text-orange-700"> 자리에 </span>
              <span className="font-medium text-orange-800">{occupant.name}</span>
              <span className="text-orange-700">이(가) 있습니다.</span>
              <br />
              <span className="text-orange-600 text-xs">확인하면 두 학생의 좌석을 맞교환합니다.</span>
            </div>
          )}
          {newSeat.trim() && !occupant && newSeat.trim() !== student.seat && (
            <p className="text-xs text-green-600">빈 자리입니다. 이동합니다.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose()} disabled={isPending}>취소</Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !newSeat.trim() || newSeat.trim() === student.seat}
          >
            {isPending ? "처리 중..." : occupant ? "교환" : "이동"}
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
        </DialogHeader>
        <div className="space-y-3 py-2 text-sm">
          <p>
            <span className="font-medium">{student.name}</span>
            {student.seat && (
              <span className="text-muted-foreground"> ({student.seat})</span>
            )}
            의 퇴실을 처리합니다.
          </p>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700 text-xs">
            좌석이 반납되고 비활성 상태로 전환됩니다. 멘토링, 출결 등 기록은 보존됩니다.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose()} disabled={isPending}>취소</Button>
          <Button variant="destructive" onClick={handleCheckout} disabled={isPending}>
            {isPending ? "처리 중..." : "퇴실 처리"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const TOTAL_SEATS = 89;

// ── 메인 테이블 ──────────────────────────────────────
const STUDENTS_FILTER_KEY = "students-table-filters";
function loadStudentFilters() {
  try { return JSON.parse(sessionStorage.getItem(STUDENTS_FILTER_KEY) ?? "{}"); } catch { return {}; }
}

export function StudentsTable({ students }: { students: StudentWithRelations[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [seatDialog, setSeatDialog] = useState<StudentWithRelations | null>(null);
  const [checkoutDialog, setCheckoutDialog] = useState<StudentWithRelations | null>(null);
  const saved = typeof window !== "undefined" ? loadStudentFilters() : {};
  const [query, setQuery] = useState<string>(saved.q ?? "");
  const [showWithdrawn, setShowWithdrawn] = useState<boolean>(saved.withdrawn ?? false);
  const [sortKey, setSortKey] = useState<SortKey>(saved.sort ?? "seat");
  const [sortDir, setSortDir] = useState<SortDir>(saved.dir ?? "asc");

  useEffect(() => {
    try { sessionStorage.setItem(STUDENTS_FILTER_KEY, JSON.stringify({ q: query, withdrawn: showWithdrawn, sort: sortKey, dir: sortDir })); } catch {}
  }, [query, showWithdrawn, sortKey, sortDir]);

  // 퇴원생 보기 모드: WITHDRAWN만 표시 / 기본: WITHDRAWN 제외
  const visibleStudents = showWithdrawn
    ? students.filter((s) => s.status === "WITHDRAWN")
    : students.filter((s) => s.status !== "WITHDRAWN");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function handleReadmit(student: StudentWithRelations) {
    startTransition(async () => {
      try {
        await readmitStudent(student.id);
        toast.success(`${student.name} 재입실 처리 완료`);
        router.refresh();
      } catch {
        toast.error("재입실 처리 실패");
      }
    });
  }

  function handleDialogClose(refresh = false) {
    setSeatDialog(null);
    setCheckoutDialog(null);
    if (refresh) router.refresh();
  }

  const q = query.trim().toLowerCase();

  // 좌석번호(숫자 문자열) → student 맵
  const seatMap = new Map<string, StudentWithRelations>();
  const noSeatStudents: StudentWithRelations[] = [];
  for (const s of visibleStudents) {
    if (s.seat?.trim()) {
      seatMap.set(s.seat.trim(), s);
    } else {
      noSeatStudents.push(s);
    }
  }

  // 1~89 순서대로 행 생성, 그 뒤에 좌석 미배정 원생 추가
  type Row = { type: "student"; student: StudentWithRelations } | { type: "empty"; seatNum: string };
  const allRows: Row[] = [];
  for (let i = 1; i <= TOTAL_SEATS; i++) {
    const key = String(i);
    const student = seatMap.get(key);
    if (student) allRows.push({ type: "student", student });
    else allRows.push({ type: "empty", seatNum: key });
  }
  for (const s of noSeatStudents) allRows.push({ type: "student", student: s });

  const isDefaultSort = sortKey === "seat" && sortDir === "asc";

  const filtered = q
    ? allRows.filter(
        (r) =>
          r.type === "student" &&
          [r.student.name, r.student.school, r.student.grade, r.student.mentor?.name, r.student.seat, r.student.phone, r.student.parentPhone]
            .some((v) => v?.toLowerCase().includes(q))
      )
    : allRows;

  const rows = isDefaultSort && !q
    ? filtered
    : (() => {
        const studentRows = filtered.filter((r): r is { type: "student"; student: StudentWithRelations } => r.type === "student");
        if (isDefaultSort) return studentRows;
        return [...studentRows].sort((a, b) => {
          let cmp = 0;
          const sa = a.student;
          const sb = b.student;
          switch (sortKey) {
            case "seat": {
              const na = sa.seat ? parseInt(sa.seat, 10) : Infinity;
              const nb = sb.seat ? parseInt(sb.seat, 10) : Infinity;
              cmp = (isNaN(na) ? Infinity : na) - (isNaN(nb) ? Infinity : nb);
              break;
            }
            case "name":
              cmp = sa.name.localeCompare(sb.name, "ko");
              break;
            case "school": {
              const schoolA = sa.school || "";
              const schoolB = sb.school || "";
              cmp = schoolA.localeCompare(schoolB, "ko");
              if (cmp === 0) {
                const gradeA = sa.grade || "";
                const gradeB = sb.grade || "";
                cmp = gradeA.localeCompare(gradeB, "ko");
              }
              break;
            }
            case "startDate":
              cmp = new Date(sa.startDate).getTime() - new Date(sb.startDate).getTime();
              break;
            case "status":
              cmp = sa.status.localeCompare(sb.status);
              break;
          }
          return sortDir === "asc" ? cmp : -cmp;
        });
      })();

  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="이름, 학교, 멘토, 연락처 검색..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-8 w-64 text-sm"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {q && (
          <span className="text-xs text-muted-foreground">
            {rows.length}명 검색됨
          </span>
        )}
        <button
          onClick={() => setShowWithdrawn((v) => !v)}
          className={`ml-auto px-3 py-1 text-xs rounded-lg border transition-colors ${
            showWithdrawn
              ? "bg-red-50 text-red-700 border-red-200"
              : "text-muted-foreground border-transparent hover:border-border"
          }`}
        >
          {showWithdrawn ? "← 재원생 보기" : "퇴원생 보기"}
        </button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14 whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("seat")}>
                좌석<SortIcon col="seat" sortKey={sortKey} sortDir={sortDir} />
              </TableHead>
              <TableHead className="whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("name")}>
                이름<SortIcon col="name" sortKey={sortKey} sortDir={sortDir} />
              </TableHead>
              <TableHead className="whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("school")}>
                학교/학년<SortIcon col="school" sortKey={sortKey} sortDir={sortDir} />
              </TableHead>
              <TableHead className="whitespace-nowrap">연락처</TableHead>
              <TableHead className="whitespace-nowrap">학부모 연락처</TableHead>
              <TableHead className="whitespace-nowrap">담당 멘토</TableHead>
              <TableHead className="whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("startDate")}>
                등원일<SortIcon col="startDate" sortKey={sortKey} sortDir={sortDir} />
              </TableHead>
              <TableHead className="whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("status")}>
                상태<SortIcon col="status" sortKey={sortKey} sortDir={sortDir} />
              </TableHead>
              <TableHead className="w-8"></TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => {
              if (row.type === "empty") {
                return (
                  <TableRow key={`empty-${row.seatNum}`} className="bg-muted/20">
                    <TableCell className="font-mono text-xs text-muted-foreground">{row.seatNum}</TableCell>
                    <TableCell colSpan={8} className="text-xs text-muted-foreground/60 italic">
                      빈 자리
                    </TableCell>
                    <TableCell />
                  </TableRow>
                );
              }

              const student = row.student;
              return (
                <TableRow
                  key={student.id}
                  className="cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => router.push(`/students/${student.id}`)}
                >
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {student.seat || <span className="text-muted-foreground/50">-</span>}
                  </TableCell>
                  <TableCell className="font-medium whitespace-nowrap">{student.name}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    <span>{[student.school, student.grade].filter(Boolean).join(" ") || "-"}</span>
                    {student.classGroup && (
                      <span className="ml-1.5 text-xs text-muted-foreground">({student.classGroup})</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{student.phone || "-"}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{student.parentPhone}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{student.mentor?.name || "-"}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{formatDate(student.startDate)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_MAP[student.status].variant}>
                      {STATUS_MAP[student.status].label}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {student.status === "WITHDRAWN" ? (
                          <DropdownMenuItem onClick={() => handleReadmit(student)}>
                            <LogIn className="h-3.5 w-3.5 mr-2" />
                            재입실 처리
                          </DropdownMenuItem>
                        ) : (
                          <>
                            <DropdownMenuItem onClick={() => setSeatDialog(student)}>
                              <ArrowLeftRight className="h-3.5 w-3.5 mr-2" />
                              좌석 변경
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600 focus:text-red-600"
                              onClick={() => setCheckoutDialog(student)}
                            >
                              <LogOut className="h-3.5 w-3.5 mr-2" />
                              퇴실 처리
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {seatDialog && (
        <SeatChangeDialog
          student={seatDialog}
          allStudents={students}
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
    </>
  );
}

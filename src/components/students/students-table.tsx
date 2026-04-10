"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, cn } from "@/lib/utils";
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
import { checkoutStudent, readmitStudent, moveStudentSeat, swapStudentSeats, updateStudentSeat } from "@/actions/students";
import { toast } from "sonner";
import type { Student, User, AttendanceSchedule } from "@/generated/prisma";

type StudentWithRelations = Student & {
  mentor: Pick<User, "name"> | null;
  schedules: AttendanceSchedule[];
};

// 이번 주 화요일 기준 단어시험 응시 여부 판단
function isVocabDone(vocabTestDate: Date | null | undefined): boolean {
  if (!vocabTestDate) return false;
  const now = new Date();
  const day = now.getDay();
  const daysBack = day >= 2 ? day - 2 : day + 5;
  const lastTue = new Date(now);
  lastTue.setDate(now.getDate() - daysBack);
  lastTue.setHours(0, 0, 0, 0);
  return new Date(vocabTestDate) >= lastTue;
}

const STATUS_MAP = {
  ACTIVE: { label: "재원", variant: "default" as const },
  INACTIVE: { label: "휴원", variant: "secondary" as const },
  GRADUATED: { label: "졸업", variant: "outline" as const },
  WITHDRAWN: { label: "퇴원", variant: "destructive" as const },
};

type SortKey = "seat" | "name" | "school" | "mentor" | "startDate" | "status";
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
          <DialogTitle>재입실 처리 — {student.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {lastSeat && (
            <div className="text-sm text-muted-foreground">
              퇴원 전 좌석: <span className="font-mono font-medium text-foreground">{lastSeat}번</span>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>좌석 번호</Label>
            <Input
              value={newSeat}
              onChange={(e) => setNewSeat(e.target.value)}
              placeholder="좌석 번호 입력 (비워두면 미배정)"
              autoFocus
            />
          </div>
          {occupant && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <span className="font-medium">{newSeat}번</span> 좌석에 <span className="font-medium">{occupant.name}</span>이(가) 있습니다.
              다른 좌석을 선택하세요.
            </div>
          )}
          {newSeat && !occupant && (
            <p className="text-xs text-green-600">빈 좌석입니다.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose()} disabled={isPending}>취소</Button>
          <Button onClick={handleReadmit} disabled={isPending || !!occupant}>
            {isPending ? "처리 중..." : "재입실"}
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
  const [mentorFilter, setMentorFilter] = useState<string>("ALL");

  // 멘토 목록 추출 (이름 가나다순)
  const mentorNames = [...new Set(students.map((s) => s.mentor?.name).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "ko"));

  useEffect(() => {
    try { sessionStorage.setItem(STUDENTS_FILTER_KEY, JSON.stringify({ q: query, withdrawn: showWithdrawn, sort: sortKey, dir: sortDir })); } catch {}
  }, [query, showWithdrawn, sortKey, sortDir]);

  // 퇴원생 보기 모드: WITHDRAWN만 표시 / 기본: WITHDRAWN 제외
  const statusFiltered = showWithdrawn
    ? students.filter((s) => s.status === "WITHDRAWN")
    : students.filter((s) => s.status !== "WITHDRAWN");

  // 멘토 필터 적용
  const visibleStudents = mentorFilter === "ALL"
    ? statusFiltered
    : statusFiltered.filter((s) => s.mentor?.name === mentorFilter);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const [readmitDialog, setReadmitDialog] = useState<StudentWithRelations | null>(null);

  function handleDialogClose(refresh = false) {
    setSeatDialog(null);
    setCheckoutDialog(null);
    setReadmitDialog(null);
    if (refresh) router.refresh();
  }

  const q = query.trim().toLowerCase();

  // 좌석번호(숫자 문자열) → student 맵
  type Row = { type: "student"; student: StudentWithRelations } | { type: "empty"; seatNum: string };
  const allRows: Row[] = [];

  if (showWithdrawn) {
    // 퇴원생 모드: 학생만 이름순으로 (빈 좌석 행 불필요)
    [...visibleStudents]
      .sort((a, b) => a.name.localeCompare(b.name, "ko"))
      .forEach((s) => allRows.push({ type: "student", student: s }));
  } else {
    // 재원 모드: 좌석 순서 + 빈 좌석 표시
    const seatMap = new Map<string, StudentWithRelations>();
    const noSeatStudents: StudentWithRelations[] = [];
    for (const s of visibleStudents) {
      if (s.seat?.trim()) seatMap.set(s.seat.trim(), s);
      else noSeatStudents.push(s);
    }
    for (let i = 1; i <= TOTAL_SEATS; i++) {
      const key = String(i);
      const student = seatMap.get(key);
      if (student) {
        allRows.push({ type: "student", student });
        seatMap.delete(key);
      } else {
        allRows.push({ type: "empty", seatNum: key });
      }
    }
    // 비숫자 좌석(A-57 등) 학생 추가
    for (const [, student] of seatMap) allRows.push({ type: "student", student });
    for (const s of noSeatStudents) allRows.push({ type: "student", student: s });
  }

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
            case "mentor":
              cmp = (sa.mentor?.name || "").localeCompare(sb.mentor?.name || "", "ko");
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

      {/* 멘토 필터 */}
      {mentorNames.length > 0 && (
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          <span className="text-xs text-muted-foreground shrink-0">담당 멘토</span>
          {[{ name: "전체", value: "ALL" }, ...mentorNames.map((n) => ({ name: n, value: n }))].map((m) => (
            <button
              key={m.value}
              onClick={() => setMentorFilter(m.value)}
              className={cn(
                "px-2.5 py-1 text-xs rounded-md font-medium border transition-colors",
                mentorFilter === m.value
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {m.name}
              {m.value !== "ALL" && (
                <span className="ml-1 text-[10px] opacity-60">
                  {statusFiltered.filter((s) => s.mentor?.name === m.value).length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
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
              <TableHead className="whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("mentor")}>
                담당 멘토<SortIcon col="mentor" sortKey={sortKey} sortDir={sortDir} />
              </TableHead>
              <TableHead className="whitespace-nowrap">특이사항</TableHead>
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
                    <TableCell colSpan={9} className="text-xs text-muted-foreground/60 italic">
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
                  <TableCell className="max-w-[200px]" title={student.studentInfo || undefined}>
                    {student.studentInfo ? (
                      <span className="text-xs text-muted-foreground line-clamp-1">{student.studentInfo}</span>
                    ) : (
                      <span className="text-muted-foreground/40 text-xs">-</span>
                    )}
                  </TableCell>
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
                          <DropdownMenuItem onClick={() => setReadmitDialog(student)}>
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
      {readmitDialog && (
        <ReadmitDialog
          student={readmitDialog}
          allStudents={students}
          open={!!readmitDialog}
          onClose={(refresh) => handleDialogClose(refresh)}
        />
      )}
    </>
  );
}

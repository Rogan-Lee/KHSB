"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  enrollVocabTest, unenrollVocabTest, createVocabScore, deleteVocabScore,
  getVocabAutoRecommendations, bulkEnrollVocabTest,
} from "@/actions/vocab-test";
import { toast } from "sonner";
import { cn, formatDate } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { Search, X, UserPlus, UserMinus, BookOpen, TrendingUp, Sparkles, Trash2 } from "lucide-react";
import type { VocabTestEnrollment, VocabTestScore, VocabEnrollReason } from "@/generated/prisma";

type StudentBasic = { id: string; name: string; grade: string; school: string | null; vocabEnrollment: VocabTestEnrollment | null };
type ScoreWithStudent = VocabTestScore & { student: { id: string; name: string; grade: string } };

const REASON_LABEL: Record<string, { label: string; style: string }> = {
  AUTO_GRADE3: { label: "자동(3등급↓)", style: "bg-red-50 text-red-700 border-red-200" },
  PARENT_REQUEST: { label: "학부모 신청", style: "bg-blue-50 text-blue-700 border-blue-200" },
  MENTOR_ASSIGNED: { label: "멘토 지정", style: "bg-violet-50 text-violet-700 border-violet-200" },
  CUSTOM: { label: "기타", style: "bg-gray-50 text-gray-700 border-gray-200" },
};

// ── 대상자 관리 탭 — 전체 학생 리스트에서 체크박스로 선택/등록 ──
function EnrollmentTab({ students, enrollments }: { students: StudentBasic[]; enrollments: (VocabTestEnrollment & { student: { id: string; name: string; grade: string; school: string | null } })[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState<VocabEnrollReason>("CUSTOM");
  const [gradeFilter, setGradeFilter] = useState<string>("ALL");

  const enrolledMap = new Map(enrollments.map((e) => [e.studentId, e]));

  const q = query.trim().toLowerCase();
  const filtered = students.filter((s) => {
    if (q && !s.name.toLowerCase().includes(q) && !(s.grade ?? "").toLowerCase().includes(q)) return false;
    if (gradeFilter !== "ALL" && !s.grade.includes(gradeFilter)) return false;
    return true;
  });

  const enrolledCount = filtered.filter((s) => enrolledMap.get(s.id)?.isActive).length;

  function handleToggle(studentId: string) {
    const current = enrolledMap.get(studentId);
    startTransition(async () => {
      try {
        if (current?.isActive) {
          await unenrollVocabTest(studentId);
        } else {
          await enrollVocabTest(studentId, reason);
        }
        router.refresh();
      } catch { toast.error("처리 실패"); }
    });
  }

  // 필터된 미등록 학생 일괄 등록
  function handleBulkEnroll() {
    const toEnroll = filtered.filter((s) => !enrolledMap.get(s.id)?.isActive).map((s) => s.id);
    if (!toEnroll.length) { toast.error("등록할 학생이 없습니다"); return; }
    if (!confirm(`${toEnroll.length}명을 일괄 등록하시겠습니까?`)) return;
    startTransition(async () => {
      try {
        await bulkEnrollVocabTest(toEnroll, reason);
        toast.success(`${toEnroll.length}명 등록 완료`);
        router.refresh();
      } catch { toast.error("일괄 등록 실패"); }
    });
  }

  // 필터된 등록 학생 일괄 해제
  function handleBulkUnenroll() {
    const toUnenroll = filtered.filter((s) => enrolledMap.get(s.id)?.isActive).map((s) => s.id);
    if (!toUnenroll.length) return;
    if (!confirm(`${toUnenroll.length}명을 일괄 해제하시겠습니까?`)) return;
    startTransition(async () => {
      try {
        for (const id of toUnenroll) await unenrollVocabTest(id);
        toast.success(`${toUnenroll.length}명 해제 완료`);
        router.refresh();
      } catch { toast.error("일괄 해제 실패"); }
    });
  }

  const grades = [...new Set(students.map((s) => s.grade))].sort();

  return (
    <div className="space-y-4">
      {/* 필터 + 액션 바 */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="이름/학년 검색..." value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8 h-8 w-48 text-sm" />
          {query && <button onClick={() => setQuery("")} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>}
        </div>

        <Select value={gradeFilter} onValueChange={setGradeFilter}>
          <SelectTrigger className="w-28 h-8"><SelectValue placeholder="학년" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체 학년</SelectItem>
            {grades.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={reason} onValueChange={(v) => setReason(v as VocabEnrollReason)}>
          <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="AUTO_GRADE3">자동(3등급↓)</SelectItem>
            <SelectItem value="PARENT_REQUEST">학부모 신청</SelectItem>
            <SelectItem value="MENTOR_ASSIGNED">멘토 지정</SelectItem>
            <SelectItem value="CUSTOM">기타</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-xs text-muted-foreground">
          {filtered.length}명 중 <span className="font-medium text-orange-600">{enrolledCount}명</span> 등록
        </span>

        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleBulkEnroll} disabled={isPending}>
            <UserPlus className="h-3.5 w-3.5" />필터 학생 일괄 등록
          </Button>
          {enrolledCount > 0 && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-red-600 hover:text-red-700" onClick={handleBulkUnenroll} disabled={isPending}>
              <UserMinus className="h-3.5 w-3.5" />필터 학생 일괄 해제
            </Button>
          )}
        </div>
      </div>

      {/* 전체 학생 리스트 */}
      <Card>
        <CardContent className="pt-4">
          <div className="max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14 text-center">대상</TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead>학년</TableHead>
                  <TableHead>학교</TableHead>
                  <TableHead>등록 사유</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => {
                  const enrollment = enrolledMap.get(s.id);
                  const isEnrolled = enrollment?.isActive ?? false;
                  return (
                    <TableRow key={s.id} className={cn(isEnrolled && "bg-orange-50/60")}>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={isEnrolled}
                          onCheckedChange={() => handleToggle(s.id)}
                          disabled={isPending}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-sm">{s.grade}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{s.school || "—"}</TableCell>
                      <TableCell>
                        {isEnrolled && enrollment && (
                          <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", REASON_LABEL[enrollment.reason]?.style ?? "")}>
                            {REASON_LABEL[enrollment.reason]?.label ?? enrollment.reason}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── 성적 입력/이력 탭 ──
function ScoresTab({ enrollments, scores }: {
  enrollments: { studentId: string; student: { id: string; name: string; grade: string } }[];
  scores: ScoreWithStudent[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await createVocabScore(fd);
        toast.success("성적 입력 완료");
        (e.target as HTMLFormElement).reset();
        router.refresh();
      } catch { toast.error("입력 실패"); }
    });
  }

  function handleDelete(id: string) {
    if (!confirm("삭제하시겠습니까?")) return;
    startTransition(async () => {
      try { await deleteVocabScore(id); toast.success("삭제됨"); router.refresh(); } catch { toast.error("삭제 실패"); }
    });
  }

  return (
    <div className="space-y-4">
      {/* 입력 폼 */}
      <Card>
        <CardHeader><CardTitle className="text-base">성적 입력</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">학생</Label>
                <select name="studentId" required className="w-full border rounded px-2 py-1.5 text-sm bg-background">
                  <option value="">선택</option>
                  {enrollments.map((e) => (
                    <option key={e.studentId} value={e.studentId}>{e.student.name} ({e.student.grade})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">시험 날짜</Label>
                <Input name="testDate" type="date" required defaultValue={new Date().toISOString().split("T")[0]} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">총 단어 수</Label>
                <Input name="totalWords" type="number" min={1} required placeholder="50" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">정답 수</Label>
                <Input name="correctWords" type="number" min={0} required placeholder="45" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">메모</Label>
                <Input name="notes" placeholder="선택사항" />
              </div>
            </div>
            <Button type="submit" size="sm" disabled={isPending}>{isPending ? "저장 중..." : "성적 입력"}</Button>
          </form>
        </CardContent>
      </Card>

      {/* 이력 */}
      <Card>
        <CardHeader><CardTitle className="text-base">성적 이력</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>날짜</TableHead>
                <TableHead>이름</TableHead>
                <TableHead>총 단어</TableHead>
                <TableHead>정답</TableHead>
                <TableHead>점수</TableHead>
                <TableHead>메모</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scores.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">성적 이력이 없습니다</TableCell></TableRow>
              ) : scores.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-sm">{formatDate(s.testDate)}</TableCell>
                  <TableCell className="font-medium">{s.student.name}</TableCell>
                  <TableCell className="text-sm">{s.totalWords}</TableCell>
                  <TableCell className="text-sm">{s.correctWords}</TableCell>
                  <TableCell>
                    <Badge variant={s.score >= 80 ? "default" : s.score >= 60 ? "secondary" : "destructive"}>
                      {s.score}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.notes || "—"}</TableCell>
                  <TableCell>
                    <button onClick={() => handleDelete(s.id)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-600 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ── 메인 보드 ──
export function VocabTestBoard({ students, enrollments, scores }: {
  students: StudentBasic[];
  enrollments: (VocabTestEnrollment & { student: { id: string; name: string; grade: string; school: string | null } })[];
  scores: ScoreWithStudent[];
}) {
  return (
    <Tabs defaultValue="enrollment">
      <TabsList>
        <TabsTrigger value="enrollment" className="gap-1.5">
          <BookOpen className="h-3.5 w-3.5" />대상자 관리
          <span className="ml-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{enrollments.length}</span>
        </TabsTrigger>
        <TabsTrigger value="scores" className="gap-1.5">
          <TrendingUp className="h-3.5 w-3.5" />성적 관리
        </TabsTrigger>
      </TabsList>
      <TabsContent value="enrollment" className="mt-4">
        <EnrollmentTab students={students} enrollments={enrollments} />
      </TabsContent>
      <TabsContent value="scores" className="mt-4">
        <ScoresTab enrollments={enrollments} scores={scores} />
      </TabsContent>
    </Tabs>
  );
}

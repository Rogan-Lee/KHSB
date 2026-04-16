"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMonthlyAward, deleteMonthlyAward } from "@/actions/reports";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, Loader2, Award } from "lucide-react";
import { toast } from "sonner";

interface Props {
  year: number;
  month: number;
  awards: {
    id: string;
    category: string;
    description: string | null;
    student: { id: string; name: string; grade: string };
  }[];
  students: { id: string; name: string; grade: string }[];
}

const CATEGORY_LABELS: Record<string, string> = {
  ATTITUDE: "학습 태도 우수자",
  MENTOR_PICK: "멘토 선정 우수자",
  IMPROVEMENT: "진보상",
};

export function MonthlyAwardsManager({ year, month, awards, students }: Props) {
  const router = useRouter();
  const [studentId, setStudentId] = useState("");
  const [category, setCategory] = useState<"ATTITUDE" | "MENTOR_PICK" | "IMPROVEMENT">("ATTITUDE");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function handleAdd() {
    if (!studentId) {
      toast.error("학생을 선택하세요");
      return;
    }
    setSaving("add");
    try {
      await createMonthlyAward(year, month, category, studentId, description || undefined);
      setStudentId("");
      setDescription("");
      toast.success("시상 추가됨");
      startTransition(() => router.refresh());
    } catch {
      toast.error("추가 실패");
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("이 시상을 삭제하시겠습니까?")) return;
    setSaving(id);
    try {
      await deleteMonthlyAward(id);
      toast.success("삭제되었습니다");
      startTransition(() => router.refresh());
    } catch {
      toast.error("삭제 실패");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* 기존 시상 목록 */}
      {awards.length > 0 && (
        <div className="space-y-1.5">
          {awards.map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded-md border p-2">
              <Award className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span className="text-xs text-muted-foreground shrink-0">{CATEGORY_LABELS[a.category]}</span>
              <span className="text-sm font-medium flex-1">
                {a.student.name} <span className="text-xs text-muted-foreground">({a.student.grade})</span>
              </span>
              {a.description && <span className="text-xs text-muted-foreground truncate max-w-[120px]">{a.description}</span>}
              <button
                onClick={() => handleDelete(a.id)}
                disabled={saving === a.id}
                className="text-muted-foreground hover:text-destructive"
              >
                {saving === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 추가 폼 */}
      <div className="space-y-2 rounded-md border border-dashed p-3">
        <p className="text-xs text-muted-foreground">새 시상 추가</p>
        <div className="grid grid-cols-2 gap-2">
          <Select value={category} onValueChange={(v) => setCategory(v as "ATTITUDE" | "MENTOR_PICK" | "IMPROVEMENT")}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ATTITUDE">학습 태도 우수자</SelectItem>
              <SelectItem value="MENTOR_PICK">멘토 선정 우수자</SelectItem>
              <SelectItem value="IMPROVEMENT">진보상</SelectItem>
            </SelectContent>
          </Select>
          <Select value={studentId} onValueChange={setStudentId}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="학생 선택" />
            </SelectTrigger>
            <SelectContent>
              {students.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} ({s.grade})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="사유 (선택)"
          className="h-8 text-xs"
        />
        <Button size="sm" className="w-full h-8 text-xs" onClick={handleAdd} disabled={saving === "add"}>
          {saving === "add" ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
          추가
        </Button>
      </div>
    </div>
  );
}

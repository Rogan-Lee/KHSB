"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertMonthlyAdmissionInfo } from "@/actions/reports";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import { Button } from "@/components/ui/button";
import { Pencil, X, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  year: number;
  month: number;
  initial: { id: string; grade: string | null; content: string }[];
}

const GRADES = ["전체", "예비고1", "고1", "고2", "고3", "재수"];

export function MonthlyAdmissionInfoEditor({ year, month, initial }: Props) {
  const router = useRouter();
  const [selectedGrade, setSelectedGrade] = useState<string>("전체");
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  const gradeKey = selectedGrade === "전체" ? null : selectedGrade;
  const current = initial.find((i) => i.grade === gradeKey);

  function handleEdit() {
    setContent(current?.content ?? "");
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await upsertMonthlyAdmissionInfo(year, month, gradeKey, content);
      toast.success("입시 정보가 저장되었습니다");
      setEditing(false);
      startTransition(() => router.refresh());
    } catch {
      toast.error("저장 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-1 border w-fit">
        {GRADES.map((g) => (
          <button
            key={g}
            onClick={() => {
              setSelectedGrade(g);
              setEditing(false);
            }}
            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
              selectedGrade === g ? "bg-white shadow-sm" : "text-muted-foreground"
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {editing ? (
        <div className="space-y-2">
          <MarkdownEditor value={content} onChange={setContent} placeholder="이달의 주요 입시 정보를 작성하세요..." />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              <X className="h-3.5 w-3.5 mr-1" />
              취소
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !content.trim()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
              저장
            </Button>
          </div>
        </div>
      ) : current ? (
        <div>
          <div className="rounded-md border bg-muted/30 p-3">
            <MarkdownViewer source={current.content} />
          </div>
          <Button variant="ghost" size="sm" onClick={handleEdit} className="mt-2">
            <Pencil className="h-3.5 w-3.5 mr-1" />
            수정
          </Button>
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-4 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            {selectedGrade === "전체" ? "전체 학생용" : `${selectedGrade} 대상`} 입시 정보가 없습니다
          </p>
          <Button variant="outline" size="sm" onClick={handleEdit}>
            <Pencil className="h-3.5 w-3.5 mr-1" />
            작성하기
          </Button>
        </div>
      )}
    </div>
  );
}

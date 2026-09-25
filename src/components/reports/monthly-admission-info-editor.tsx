"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertMonthlyAdmissionInfo } from "@/actions/reports";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import { Button } from "@/components/ui/button";
import { Pencil, Check, Loader2, FileText } from "lucide-react";
import { EmptyState, FilterChip } from "@/components/backoffice/ui";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
    <div className="flex flex-col gap-x3">
      <div className="flex flex-wrap gap-x1_5" role="group" aria-label="대상 학년">
        {GRADES.map((g) => {
          const has = initial.some((i) => i.grade === (g === "전체" ? null : g));
          return (
            <FilterChip
              key={g}
              selected={selectedGrade === g}
              onClick={() => {
                setSelectedGrade(g);
                setEditing(false);
              }}
            >
              {g}
              {has && (
                <span
                  aria-label="작성됨"
                  className={cn(
                    "size-1.5 rounded-full",
                    selectedGrade === g ? "bg-fg-neutral-inverted" : "bg-bg-brand-solid"
                  )}
                />
              )}
            </FilterChip>
          );
        })}
      </div>

      {editing ? (
        <div className="flex flex-col gap-x2">
          <MarkdownEditor value={content} onChange={setContent} placeholder="이달의 주요 입시 정보를 작성하세요..." />
          <div className="flex justify-end gap-x2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              취소
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !content.trim()}>
              {saving ? <Loader2 className="animate-spin" /> : <Check />}
              {saving ? "저장 중…" : "저장"}
            </Button>
          </div>
        </div>
      ) : current ? (
        <div className="flex flex-col gap-x2">
          <div className="rounded-r3 bg-bg-layer-fill p-x4">
            <MarkdownViewer source={current.content} />
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={handleEdit}>
              <Pencil />
              수정
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-r3 border border-dashed border-stroke-neutral-weak">
          <EmptyState
            compact
            icon={FileText}
            title={`${selectedGrade === "전체" ? "전체 학생용" : `${selectedGrade} 대상`} 입시 정보가 없어요`}
            action={
              <Button variant="secondary" size="sm" onClick={handleEdit}>
                <Pencil />
                작성하기
              </Button>
            }
          />
        </div>
      )}
    </div>
  );
}

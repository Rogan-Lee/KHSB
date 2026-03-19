"use client";

import { useState, useTransition } from "react";
import { createCommunication, checkCommunication, deleteCommunication } from "@/actions/communications";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import type { Communication } from "@/generated/prisma";

interface Props {
  studentId: string;
  initialItems: Communication[];
  compact?: boolean; // 입퇴실/멘토링 패널에서 간소화 모드
}

const TYPE_LABELS = {
  PARENT_REQUEST: { label: "학부모 요청", color: "bg-orange-100 text-orange-800 border-orange-200" },
  STAFF_NOTE: { label: "운영진 전달", color: "bg-blue-100 text-blue-800 border-blue-200" },
};

function formatRelative(date: Date) {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}일 전`;
  if (hours > 0) return `${hours}시간 전`;
  if (minutes > 0) return `${minutes}분 전`;
  return "방금";
}

export function CommunicationPanel({ studentId, initialItems, compact = false }: Props) {
  const [items, setItems] = useState<Communication[]>(initialItems);
  const [activeType, setActiveType] = useState<"PARENT_REQUEST" | "STAFF_NOTE">("STAFF_NOTE");
  const [content, setContent] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showChecked, setShowChecked] = useState(false);
  const [isPending, startTransition] = useTransition();

  const unchecked = items.filter((i) => !i.isChecked);
  const checked = items.filter((i) => i.isChecked);

  function handleAdd() {
    if (!content.trim()) return;
    startTransition(async () => {
      try {
        const created = await createCommunication(studentId, activeType, content.trim());
        setItems((prev) => [created, ...prev]);
        setContent("");
        setShowForm(false);
        toast.success("등록되었습니다");
      } catch {
        toast.error("등록 실패");
      }
    });
  }

  function handleCheck(item: Communication) {
    startTransition(async () => {
      try {
        await checkCommunication(item.id, studentId);
        setItems((prev) =>
          prev.map((i) => i.id === item.id ? { ...i, isChecked: true, checkedAt: new Date() } : i)
        );
      } catch {
        toast.error("처리 실패");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteCommunication(id, studentId);
        setItems((prev) => prev.filter((i) => i.id !== id));
      } catch {
        toast.error("삭제 실패");
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-medium", compact ? "text-xs" : "")}>
            요청/전달사항
          </span>
          {unchecked.length > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
              {unchecked.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-xs text-primary hover:underline"
        >
          {showForm ? "취소" : "+ 추가"}
        </button>
      </div>

      {/* 등록 폼 */}
      {showForm && (
        <div className="space-y-2 p-3 bg-muted/40 rounded-lg border">
          <div className="flex gap-1">
            {(["PARENT_REQUEST", "STAFF_NOTE"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveType(t)}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-md font-medium border transition-colors",
                  activeType === t
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-accent"
                )}
              >
                {TYPE_LABELS[t].label}
              </button>
            ))}
          </div>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={activeType === "PARENT_REQUEST" ? "학부모 요청사항을 입력하세요..." : "운영진 전달사항을 입력하세요..."}
            className="text-sm min-h-[70px] resize-none"
          />
          <div className="flex justify-end">
            <Button size="sm" className="h-7 text-xs" onClick={handleAdd} disabled={isPending || !content.trim()}>
              등록
            </Button>
          </div>
        </div>
      )}

      {/* 미확인 목록 */}
      {unchecked.length === 0 && !showForm && (
        <p className="text-xs text-muted-foreground py-2 text-center">미확인 사항이 없습니다</p>
      )}
      <div className="space-y-1.5">
        {unchecked.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-2 p-2.5 rounded-lg border bg-card hover:bg-accent/30 transition-colors"
          >
            <button
              onClick={() => handleCheck(item)}
              disabled={isPending}
              className="mt-0.5 shrink-0 text-muted-foreground hover:text-green-600 transition-colors"
            >
              <Circle className="h-4 w-4" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", TYPE_LABELS[item.type].color)}>
                  {TYPE_LABELS[item.type].label}
                </span>
                <span className="text-[10px] text-muted-foreground">{formatRelative(item.createdAt)}</span>
                <span className="text-[10px] text-muted-foreground">· {item.createdByName}</span>
              </div>
              <p className="text-sm leading-snug">{item.content}</p>
            </div>
            <button
              onClick={() => handleDelete(item.id)}
              disabled={isPending}
              className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* 확인 완료 목록 (접기/펼치기) */}
      {checked.length > 0 && (
        <div className="border-t pt-3">
          <button
            onClick={() => setShowChecked((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showChecked ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            처리 완료 히스토리 {checked.length}건
          </button>
          {showChecked && (
            <div className="space-y-2 mt-2">
              {checked.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border bg-green-50/60 border-green-100"
                >
                  {/* 헤더 */}
                  <div className="flex items-center justify-between px-2.5 pt-2 pb-1">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", TYPE_LABELS[item.type].color)}>
                        {TYPE_LABELS[item.type].label}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{item.createdByName}</span>
                      <span className="text-[10px] text-muted-foreground">· {formatRelative(item.createdAt)}</span>
                    </div>
                    <button
                      onClick={() => handleDelete(item.id)}
                      disabled={isPending}
                      className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  {/* 내용 */}
                  <p className="text-sm leading-snug px-2.5 pb-2">{item.content}</p>
                  {/* 처리 완료 날짜 */}
                  {item.checkedAt && (
                    <div className="px-2.5 pb-2 border-t border-green-100 pt-1.5">
                      <p className="text-[10px] text-green-700">
                        ✓ {new Date(item.checkedAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })} 처리 완료
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

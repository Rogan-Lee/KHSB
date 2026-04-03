"use client";

import { useState, useTransition } from "react";
import {
  createAssignment,
  updateAssignment,
  completeAssignment,
  uncompleteAssignment,
  deleteAssignment,
} from "@/actions/assignments";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Circle,
  CheckCircle2,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronUp,
  Printer,
  X,
} from "lucide-react";
import type { Assignment } from "@/generated/prisma";

interface Props {
  studentId: string;
  studentName?: string;
  initialItems: Assignment[];
  mentoringId?: string;
  compact?: boolean;
}

const SUBJECT_OPTIONS = ["수학", "영어", "국어", "과학", "사회", "탐구", "기타"];

function formatDue(date: Date | null) {
  if (!date) return null;
  const d = new Date(date);
  const now = new Date();
  const diff = d.getTime() - now.setHours(0, 0, 0, 0);
  const days = Math.ceil(diff / 86400000);
  const label = d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
  if (days < 0) return { label, color: "text-red-500", suffix: `(${Math.abs(days)}일 초과)` };
  if (days === 0) return { label, color: "text-orange-500", suffix: "(오늘)" };
  if (days <= 3) return { label, color: "text-yellow-600", suffix: `(${days}일 후)` };
  return { label, color: "text-muted-foreground", suffix: `(${days}일 후)` };
}

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return new Date(date).toISOString().split("T")[0];
}

const EMPTY_FORM = { title: "", subject: "", description: "", dueDate: "" };

export function AssignmentPanel({
  studentId,
  studentName,
  initialItems,
  mentoringId,
  compact = false,
}: Props) {
  const [items, setItems] = useState<Assignment[]>(initialItems);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [form, setForm] = useState(EMPTY_FORM);

  const pending = items.filter((i) => !i.isCompleted);
  const completed = items.filter((i) => i.isCompleted);

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(item: Assignment) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      subject: item.subject ?? "",
      description: item.description ?? "",
      dueDate: toDateInputValue(item.dueDate),
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function handleSave() {
    if (!form.title.trim()) return;
    if (editingId) {
      startTransition(async () => {
        try {
          await updateAssignment(editingId, studentId, {
            title: form.title.trim(),
            subject: form.subject || undefined,
            description: form.description.trim() || undefined,
            dueDate: form.dueDate || undefined,
          });
          setItems((prev) =>
            prev.map((i) =>
              i.id === editingId
                ? {
                    ...i,
                    title: form.title.trim(),
                    subject: form.subject || null,
                    description: form.description.trim() || null,
                    dueDate: form.dueDate ? new Date(form.dueDate) : null,
                  }
                : i
            )
          );
          closeForm();
          toast.success("수정되었습니다");
        } catch {
          toast.error("수정 실패");
        }
      });
    } else {
      startTransition(async () => {
        try {
          const created = await createAssignment(studentId, {
            title: form.title.trim(),
            subject: form.subject || undefined,
            description: form.description.trim() || undefined,
            dueDate: form.dueDate || undefined,
            mentoringId,
          });
          setItems((prev) => [created, ...prev]);
          closeForm();
          toast.success("과제가 등록되었습니다");
        } catch {
          toast.error("등록 실패");
        }
      });
    }
  }

  function handleComplete(item: Assignment) {
    startTransition(async () => {
      try {
        await completeAssignment(item.id, studentId);
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, isCompleted: true, completedAt: new Date() } : i
          )
        );
      } catch {
        toast.error("처리 실패");
      }
    });
  }

  function handleUncomplete(item: Assignment) {
    startTransition(async () => {
      try {
        await uncompleteAssignment(item.id, studentId);
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, isCompleted: false, completedAt: null } : i
          )
        );
      } catch {
        toast.error("처리 실패");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteAssignment(id, studentId);
        setItems((prev) => prev.filter((i) => i.id !== id));
        if (editingId === id) closeForm();
      } catch {
        toast.error("삭제 실패");
      }
    });
  }

  function handlePrint() {
    const win = window.open("", "_blank");
    if (!win) return;
    const pendingItems = items.filter((i) => !i.isCompleted);
    const today = new Date().toLocaleDateString("ko-KR", {
      year: "numeric", month: "long", day: "numeric",
    });
    win.document.write(`
      <!DOCTYPE html>
      <html lang="ko">
      <head>
        <meta charset="UTF-8" />
        <title>${studentName ?? "원생"} 과제표</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Malgun Gothic', sans-serif; padding: 24px; font-size: 13px; }
          h1 { font-size: 16px; font-weight: bold; margin-bottom: 4px; }
          .meta { color: #666; font-size: 11px; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #f3f4f6; text-align: left; padding: 6px 8px; font-size: 11px; border: 1px solid #e5e7eb; }
          td { padding: 7px 8px; border: 1px solid #e5e7eb; vertical-align: top; }
          .subject { display: inline-block; background: #eff6ff; color: #1d4ed8; font-size: 10px; padding: 1px 6px; border-radius: 4px; border: 1px solid #bfdbfe; }
          .check { width: 20px; height: 20px; border: 1.5px solid #d1d5db; border-radius: 4px; display: inline-block; }
          .due-over { color: #ef4444; font-weight: 600; }
          .due-today { color: #f97316; font-weight: 600; }
          .due-soon { color: #ca8a04; }
          @media print { body { padding: 12px; } }
        </style>
      </head>
      <body>
        <h1>${studentName ?? "원생"} 과제표</h1>
        <p class="meta">${today} 기준 · 미완료 ${pendingItems.length}개</p>
        ${pendingItems.length === 0
          ? '<p style="color:#666;text-align:center;padding:20px;">미완료 과제가 없습니다</p>'
          : `<table>
          <thead>
            <tr>
              <th style="width:24px">✓</th>
              <th>과제</th>
              <th style="width:50px">과목</th>
              <th style="width:70px">마감일</th>
            </tr>
          </thead>
          <tbody>
            ${pendingItems.map((item) => {
              const due = item.dueDate ? (() => {
                const d = new Date(item.dueDate);
                const now = new Date(); now.setHours(0,0,0,0);
                const days = Math.ceil((d.getTime() - now.getTime()) / 86400000);
                const label = d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
                const cls = days < 0 ? "due-over" : days === 0 ? "due-today" : days <= 3 ? "due-soon" : "";
                const suffix = days < 0 ? `(${Math.abs(days)}일 초과)` : days === 0 ? "(오늘)" : ``;
                return `<span class="${cls}">${label} ${suffix}</span>`;
              })() : "-";
              return `
                <tr>
                  <td><span class="check"></span></td>
                  <td>
                    <div style="font-weight:500">${item.title}</div>
                    ${item.description ? `<div style="color:#6b7280;font-size:11px;margin-top:2px">${item.description}</div>` : ""}
                  </td>
                  <td>${item.subject ? `<span class="subject">${item.subject}</span>` : "-"}</td>
                  <td>${due}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>`}
      </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <div className="space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-medium", compact && "text-xs")}>과제</span>
          {pending.length > 0 && (
            <span className="bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
              {pending.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              onClick={handlePrint}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="과제표 출력"
            >
              <Printer className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={showForm ? closeForm : openAdd}
            className="text-xs text-primary hover:underline"
          >
            {showForm ? "취소" : "+ 추가"}
          </button>
        </div>
      </div>

      {/* 등록/수정 폼 */}
      {showForm && (
        <div className="space-y-2 p-3 bg-muted/40 rounded-lg border">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium text-muted-foreground">
              {editingId ? "과제 수정" : "새 과제"}
            </p>
            <button onClick={closeForm} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <input
            type="text"
            placeholder="과제 제목 *"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full border rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background"
            >
              <option value="">과목 선택</option>
              {SUBJECT_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <DatePicker value={form.dueDate || null} onChange={(d) => setForm((f) => ({ ...f, dueDate: d ?? "" }))} placeholder="날짜 선택" />
          </div>
          <textarea
            placeholder="상세 내용 (선택)"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full border rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background resize-none min-h-[50px]"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleSave}
              disabled={isPending || !form.title.trim()}
            >
              {editingId ? "저장" : "등록"}
            </Button>
          </div>
        </div>
      )}

      {/* 미완료 과제 */}
      {pending.length === 0 && !showForm && (
        <p className="text-xs text-muted-foreground py-2 text-center">미완료 과제가 없습니다</p>
      )}
      <div className="space-y-1.5">
        {pending.map((item) => {
          const due = item.dueDate ? formatDue(item.dueDate) : null;
          const isEditing = editingId === item.id;
          return (
            <div
              key={item.id}
              className={cn(
                "flex items-start gap-2 p-2.5 rounded-lg border transition-colors",
                isEditing ? "bg-primary/5 border-primary/30" : "bg-card hover:bg-accent/30"
              )}
            >
              <button
                onClick={() => handleComplete(item)}
                disabled={isPending}
                className="mt-0.5 shrink-0 text-muted-foreground hover:text-green-600 transition-colors"
              >
                <Circle className="h-4 w-4" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                  {item.subject && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-blue-50 text-blue-700 border-blue-200">
                      {item.subject}
                    </span>
                  )}
                  {due && (
                    <span className={cn("text-[10px]", due.color)}>
                      ~{due.label} {due.suffix}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">· {item.createdByName}</span>
                </div>
                <p className="text-sm font-medium leading-snug">{item.title}</p>
                {item.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{item.description}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => isEditing ? closeForm() : openEdit(item)}
                  disabled={isPending}
                  className={cn(
                    "transition-colors",
                    isEditing ? "text-primary" : "text-muted-foreground hover:text-primary"
                  )}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  disabled={isPending}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 완료된 과제 */}
      {completed.length > 0 && (
        <div className="border-t pt-3">
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showCompleted ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            완료된 과제 {completed.length}개
          </button>
          {showCompleted && (
            <div className="space-y-1.5 mt-2">
              {completed.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-2 p-2.5 rounded-lg border bg-green-50/60 border-green-100"
                >
                  <button
                    onClick={() => handleUncomplete(item)}
                    disabled={isPending}
                    className="mt-0.5 shrink-0 text-green-600 hover:text-muted-foreground transition-colors"
                    title="완료 취소"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      {item.subject && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium bg-blue-50 text-blue-700 border-blue-200">
                          {item.subject}
                        </span>
                      )}
                      {item.completedAt && (
                        <span className="text-[10px] text-green-700">
                          {new Date(item.completedAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })} 완료
                        </span>
                      )}
                    </div>
                    <p className="text-sm leading-snug line-through text-muted-foreground">{item.title}</p>
                    {item.completedNote && (
                      <p className="text-xs text-green-700 mt-0.5">{item.completedNote}</p>
                    )}
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
          )}
        </div>
      )}
    </div>
  );
}

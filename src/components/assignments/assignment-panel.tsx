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
import { Input, inputBaseClass } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import { CountBadge, TONE_TEXT, type Tone } from "@/components/backoffice/ui";
import { useConfirmDialog } from "@/components/exams/use-confirm-dialog";
import {
  Circle,
  CheckCircle2,
  Trash2,
  Pencil,
  ChevronDown,
  Printer,
  Plus,
  X,
} from "lucide-react";
import type { Assignment } from "@/generated/prisma";
import { AssignmentFiles, PendingFilePicker, uploadAssignmentFile } from "./assignment-files";

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
  const tone = (t: Tone) => TONE_TEXT[t];
  if (days < 0) return { label, color: tone("bad"), suffix: `(${Math.abs(days)}일 초과)` };
  if (days === 0) return { label, color: tone("brand"), suffix: "(오늘)" };
  if (days <= 3) return { label, color: tone("warn"), suffix: `(${days}일 후)` };
  return { label, color: "text-fg-neutral-subtle", suffix: `(${days}일 후)` };
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
  // 신규 과제 작성 시 등록 전 미리 선택해 둔 파일들 (등록 직후 업로드)
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [confirm, confirmDialog] = useConfirmDialog();

  const pending = items.filter((i) => !i.isCompleted);
  const completed = items.filter((i) => i.isCompleted);

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setStagedFiles([]);
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
    setStagedFiles([]);
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
          // 등록 전 선택해 둔 파일들을 새 과제에 업로드
          const toUpload = stagedFiles;
          let uploadFailed = 0;
          for (const file of toUpload) {
            try {
              await uploadAssignmentFile(created.id, file);
            } catch {
              uploadFailed += 1;
            }
          }
          setStagedFiles([]);
          // 신규 과제 생성 직후엔 폼을 편집 모드로 전환해 파일 추가/확인 가능하게
          setEditingId(created.id);
          setForm({
            title: created.title,
            subject: created.subject ?? "",
            description: created.description ?? "",
            dueDate: toDateInputValue(created.dueDate),
          });
          if (uploadFailed > 0) {
            toast.warning(`과제는 등록됐지만 파일 ${uploadFailed}개 업로드에 실패했어요`);
          } else if (toUpload.length > 0) {
            toast.success(`과제가 등록되고 파일 ${toUpload.length}개가 첨부되었습니다`);
          } else {
            toast.success("과제가 등록되었습니다. 파일을 첨부할 수 있어요");
          }
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

  async function handleDelete(id: string) {
    const target = items.find((i) => i.id === id);
    const ok = await confirm({
      title: target ? `"${target.title}" 과제를 삭제할까요?` : "과제를 삭제할까요?",
      description: "삭제하면 되돌릴 수 없어요.",
      confirmLabel: "삭제",
      destructive: true,
    });
    if (!ok) return;
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

  const iconButton = "size-x8 text-fg-neutral-subtle";

  return (
    <div className="flex flex-col gap-x3">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-x2">
        <div className="flex items-center gap-x1_5">
          <span className={cn("text-fg-neutral", compact ? "t4-bold" : "t5-bold")}>과제</span>
          <CountBadge count={pending.length} />
        </div>
        <div className="flex items-center gap-x1">
          {items.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePrint}
              className={iconButton}
              title="과제표 출력"
              aria-label="과제표 출력"
            >
              <Printer />
            </Button>
          )}
          <Button
            variant={showForm ? "ghost" : "secondary"}
            size="sm"
            onClick={showForm ? closeForm : openAdd}
          >
            {showForm ? (
              "취소"
            ) : (
              <>
                <Plus />
                추가
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 등록/수정 폼 */}
      {showForm && (
        <div className="flex flex-col gap-x2_5 rounded-r3 bg-bg-layer-fill p-x4">
          <div className="flex items-center justify-between">
            <p className="t4-bold text-fg-neutral">{editingId ? "과제 수정" : "새 과제"}</p>
            <Button
              variant="ghost"
              size="icon"
              onClick={closeForm}
              className={iconButton}
              aria-label="닫기"
            >
              <X />
            </Button>
          </div>
          <Input
            type="text"
            placeholder="과제 제목 *"
            aria-label="과제 제목"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-x2">
            <select
              value={form.subject}
              aria-label="과목"
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              className={cn("h-10", inputBaseClass, !form.subject && "text-fg-placeholder")}
            >
              <option value="">과목 선택</option>
              {SUBJECT_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <DatePicker value={form.dueDate || null} onChange={(d) => setForm((f) => ({ ...f, dueDate: d ?? "" }))} placeholder="마감일 선택" />
          </div>
          <Textarea
            placeholder="상세 내용 (선택)"
            aria-label="상세 내용"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="min-h-[64px] resize-none"
          />

          {/* 파일 첨부 — 신규 작성 시엔 임시 보관, 저장 직후 업로드 */}
          <div className="border-t border-stroke-neutral-muted pt-x3">
            {editingId ? (
              <AssignmentFiles assignmentId={editingId} />
            ) : (
              <PendingFilePicker
                files={stagedFiles}
                onChange={setStagedFiles}
                disabled={isPending}
              />
            )}
          </div>

          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isPending || !form.title.trim()}
            >
              {isPending ? "저장 중…" : editingId ? "저장" : "등록"}
            </Button>
          </div>
        </div>
      )}

      {/* 미완료 과제 */}
      {pending.length === 0 && !showForm && (
        <div className="rounded-r3 bg-bg-layer-fill px-x4 py-x6 text-center">
          <p className="t4-medium text-fg-neutral-muted">미완료 과제가 없어요</p>
          <p className="mt-x0_5 t3-regular text-fg-neutral-subtle">
            {items.length === 0 ? "\"추가\"를 눌러 첫 과제를 등록해 보세요." : "모든 과제를 끝냈어요."}
          </p>
        </div>
      )}
      {pending.length > 0 && (
        <ul className="flex flex-col gap-x1_5">
          {pending.map((item) => {
            const due = item.dueDate ? formatDue(item.dueDate) : null;
            const isEditing = editingId === item.id;
            return (
              <li
                key={item.id}
                className={cn(
                  "flex items-start gap-x2_5 rounded-r3 border px-x3 py-x2_5 transition-colors",
                  isEditing
                    ? "border-stroke-brand-weak bg-bg-brand-weak"
                    : "border-stroke-neutral-muted bg-bg-layer-default hover:bg-bg-layer-default-pressed"
                )}
              >
                <button
                  type="button"
                  onClick={() => handleComplete(item)}
                  disabled={isPending}
                  className="mt-x0_5 shrink-0 rounded-full text-fg-placeholder transition-colors hover:text-fg-positive disabled:opacity-50"
                  aria-label={`${item.title} 완료 처리`}
                  title="완료 처리"
                >
                  <Circle className="size-5" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="t4-medium text-fg-neutral">{item.title}</p>
                  {item.description && (
                    <p className="mt-x0_5 whitespace-pre-wrap t3-regular text-fg-neutral-muted">{item.description}</p>
                  )}
                  <div className="mt-x1 flex flex-wrap items-center gap-x1_5 t2-regular text-fg-neutral-subtle">
                    {item.subject && <Badge tone="neutral">{item.subject}</Badge>}
                    {due && (
                      <span className={cn("t2-medium tabular-nums", due.color)}>
                        ~{due.label} {due.suffix}
                      </span>
                    )}
                    <span>{item.createdByName}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => (isEditing ? closeForm() : openEdit(item))}
                    disabled={isPending}
                    className={cn(iconButton, isEditing && "text-fg-brand")}
                    aria-label={isEditing ? "수정 닫기" : `${item.title} 수정`}
                    title="수정"
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(item.id)}
                    disabled={isPending}
                    className={cn(iconButton, "hover:text-fg-critical")}
                    aria-label={`${item.title} 삭제`}
                    title="삭제"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 완료된 과제 */}
      {completed.length > 0 && (
        <div className="border-t border-stroke-neutral-muted pt-x3">
          <button
            type="button"
            onClick={() => setShowCompleted((v) => !v)}
            aria-expanded={showCompleted}
            className="-ml-1 inline-flex items-center gap-x1 rounded-r2 px-1 py-x0_5 t3-medium text-fg-neutral-subtle transition-colors hover:text-fg-neutral"
          >
            <ChevronDown className={cn("size-4 transition-transform", showCompleted && "rotate-180")} />
            완료한 과제 <span className="tabular-nums">{completed.length}</span>개
          </button>
          {showCompleted && (
            <ul className="mt-x2 flex flex-col gap-x1_5">
              {completed.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start gap-x2_5 rounded-r3 bg-bg-layer-fill px-x3 py-x2_5"
                >
                  <button
                    type="button"
                    onClick={() => handleUncomplete(item)}
                    disabled={isPending}
                    className="mt-x0_5 shrink-0 rounded-full text-fg-positive transition-colors hover:text-fg-neutral-subtle disabled:opacity-50"
                    title="완료 취소"
                    aria-label={`${item.title} 완료 취소`}
                  >
                    <CheckCircle2 className="size-5" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="t4-regular text-fg-neutral-subtle line-through">{item.title}</p>
                    <div className="mt-x1 flex flex-wrap items-center gap-x1_5">
                      {item.subject && <Badge tone="neutral">{item.subject}</Badge>}
                      {item.completedAt && (
                        <span className="t2-medium tabular-nums text-fg-positive">
                          {new Date(item.completedAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })} 완료
                        </span>
                      )}
                    </div>
                    {item.completedNote && (
                      <p className="mt-x1 t3-regular text-fg-neutral-muted">{item.completedNote}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(item.id)}
                    disabled={isPending}
                    className={cn(iconButton, "hover:text-fg-critical")}
                    aria-label={`${item.title} 삭제`}
                    title="삭제"
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {confirmDialog}
    </div>
  );
}

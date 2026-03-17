"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "sonner";
import { MessageCircle, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import {
  createMessageTemplate,
  updateMessageTemplate,
  deleteMessageTemplate,
} from "@/actions/message-templates";

interface Template {
  id: string;
  name: string;
  content: string;
}

interface Student {
  id: string;
  name: string;
  grade: string;
}

interface Props {
  initialTemplates: Template[];
  students: Student[];
}

export function KakaoMessagePanel({ initialTemplates, students }: Props) {
  const [templates, setTemplates] = useState<Template[]>(initialTemplates);
  const [isPending, startTransition] = useTransition();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [message, setMessage] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");

  function applyTemplate(templateId: string, studentId?: string) {
    const tmpl = templates.find((t) => t.id === templateId);
    if (!tmpl) return;
    const student = students.find((s) => s.id === (studentId ?? selectedStudentId));
    setMessage(student ? tmpl.content.replace(/\{name\}/g, student.name) : tmpl.content);
  }

  function handleTemplateSelect(id: string) {
    setSelectedTemplateId(id);
    applyTemplate(id, selectedStudentId);
  }

  function handleStudentSelect(id: string) {
    setSelectedStudentId(id);
    if (selectedTemplateId) applyTemplate(selectedTemplateId, id);
  }

  async function handleShare() {
    if (!message.trim()) { toast.error("메시지 내용을 입력하세요"); return; }
    if (navigator.share) {
      try { await navigator.share({ text: message }); } catch { /* 취소 */ }
    } else {
      await navigator.clipboard.writeText(message);
      toast.success("복사되었습니다. 카카오톡에 붙여넣기 하세요.");
    }
  }

  function startEdit(tmpl: Template) {
    setEditingId(tmpl.id);
    setEditName(tmpl.name);
    setEditContent(tmpl.content);
    setShowNewForm(false);
  }

  function cancelEdit() { setEditingId(null); setEditName(""); setEditContent(""); }

  function saveEdit() {
    if (!editName.trim() || !editContent.trim()) return;
    startTransition(async () => {
      try {
        await updateMessageTemplate(editingId!, { name: editName.trim(), content: editContent.trim() });
        setTemplates((prev) =>
          prev.map((t) => t.id === editingId ? { ...t, name: editName.trim(), content: editContent.trim() } : t)
        );
        if (selectedTemplateId === editingId) applyTemplate(editingId!, selectedStudentId);
        cancelEdit();
      } catch { toast.error("수정에 실패했습니다"); }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteMessageTemplate(id);
        setTemplates((prev) => prev.filter((t) => t.id !== id));
        if (selectedTemplateId === id) { setSelectedTemplateId(""); setMessage(""); }
      } catch { toast.error("삭제에 실패했습니다"); }
    });
  }

  function saveNew() {
    if (!newName.trim() || !newContent.trim()) return;
    startTransition(async () => {
      try {
        const created = await createMessageTemplate({ name: newName.trim(), content: newContent.trim() });
        setTemplates((prev) => [...prev, created]);
        setNewName(""); setNewContent(""); setShowNewForm(false);
      } catch { toast.error("저장에 실패했습니다"); }
    });
  }

  return (
    <div className="flex divide-x divide-border h-full">
      {/* ── 왼쪽: 메시지 발송 (2/5) ── */}
      <div className="w-2/5 flex flex-col p-6 gap-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-yellow-500" />
          <h3 className="font-semibold text-sm">메시지 발송</h3>
        </div>

        <div className="flex-1 flex flex-col space-y-3 min-h-0">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">템플릿</p>
            <SearchableSelect
              options={templates.map((t) => ({ value: t.id, label: t.name }))}
              value={selectedTemplateId}
              onValueChange={handleTemplateSelect}
              placeholder="템플릿 선택"
              searchPlaceholder="템플릿 검색..."
              emptyText="등록된 템플릿 없음"
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              학생 <span className="text-[10px] text-muted-foreground/60">({"{"}name{"}"} 자동치환)</span>
            </p>
            <SearchableSelect
              options={students.map((s) => ({ value: s.id, label: `${s.name} (${s.grade})` }))}
              value={selectedStudentId}
              onValueChange={handleStudentSelect}
              placeholder="학생 선택"
              searchPlaceholder="이름 검색..."
              emptyText="검색 결과 없음"
            />
          </div>

          <div className="flex-1 flex flex-col space-y-1.5 min-h-0">
            <p className="text-xs font-medium text-muted-foreground">메시지 내용 (직접 수정 가능)</p>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="메시지 내용을 입력하거나 위에서 템플릿을 선택하세요"
              className="resize-none flex-1"
            />
          </div>
        </div>

        <Button
          onClick={handleShare}
          disabled={!message.trim()}
          className="mt-auto w-full gap-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-semibold"
        >
          <MessageCircle className="h-4 w-4" />
          카카오톡으로 보내기
        </Button>
      </div>

      {/* ── 오른쪽: 템플릿 관리 (3/5) ── */}
      <div className="w-3/5 flex flex-col p-6 gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">템플릿 관리</h3>
            <Badge variant="secondary" className="text-xs px-1.5 py-0">{templates.length}</Badge>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-7 text-xs"
            onClick={() => { setShowNewForm(true); cancelEdit(); }}
            disabled={showNewForm}
          >
            <Plus className="h-3 w-3" />
            새 템플릿
          </Button>
        </div>

        <p className="text-xs text-muted-foreground -mt-2">
          {"{"}name{"}"} 은 발송 시 학생 이름으로 자동 치환됩니다
        </p>

        {/* 새 템플릿 폼 */}
        {showNewForm && (
          <div className="rounded-lg border p-4 space-y-3 bg-muted/30 shrink-0">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">템플릿 이름</label>
                <Input
                  placeholder="예) 출석 알림"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex items-end gap-2">
                <Button size="sm" onClick={saveNew} disabled={isPending || !newName.trim() || !newContent.trim()} className="gap-1.5 h-8">
                  <Check className="h-3.5 w-3.5" />
                  저장
                </Button>
                <Button size="sm" variant="outline" className="h-8" onClick={() => { setShowNewForm(false); setNewName(""); setNewContent(""); }}>
                  취소
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">내용</label>
              <Textarea
                placeholder={"예) [독서실] {name} 학생이 오늘 정상 출석하였습니다."}
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={4}
                className="resize-y text-sm"
              />
            </div>
          </div>
        )}

        {/* 템플릿 목록 */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
          {templates.length === 0 && !showNewForm && (
            <div className="h-full flex items-center justify-center rounded-lg border border-dashed">
              <p className="text-sm text-muted-foreground">등록된 템플릿이 없습니다</p>
            </div>
          )}
          {templates.map((tmpl) => (
            <div key={tmpl.id} className="rounded-lg border bg-card">
              {editingId === tmpl.id ? (
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">템플릿 이름</label>
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div className="flex items-end gap-2">
                      <Button size="sm" onClick={saveEdit} disabled={isPending} className="gap-1.5 h-8">
                        <Check className="h-3.5 w-3.5" />
                        저장
                      </Button>
                      <Button size="sm" variant="outline" className="h-8" onClick={cancelEdit}>
                        취소
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={4}
                    className="resize-y text-sm"
                  />
                </div>
              ) : (
                <div className="flex items-start gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm mb-1">{tmpl.name}</p>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed line-clamp-3">
                      {tmpl.content}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-primary"
                      onClick={() => startEdit(tmpl)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(tmpl.id)}
                      disabled={isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

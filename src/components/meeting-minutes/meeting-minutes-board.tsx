"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { useDraft } from "@/hooks/use-draft";
import { type MeetingTeam, createMeetingMinutes, updateMeetingMinutes, deleteMeetingMinutes, markMeetingMinutesRead } from "@/actions/meeting-minutes";
import { Plus, Pencil, Trash2, CheckCheck, ChevronDown, ChevronUp, Users, X, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";

// ─── Types ────────────────────────────────────────────────────────────────────

type Read = { userId: string; userName: string; readAt: Date };
type Minutes = {
  id: string;
  title: string;
  date: Date;
  content: string;
  attendees: string[];
  team: string;
  authorId: string;
  authorName: string;
  reads: Read[];
  createdAt: Date;
};

type Props = {
  initialMinutes: Minutes[];
  currentUserId: string;
  currentUserName: string;
  currentUserRole: string;
  staffList: { id: string; name: string }[];
};

const TEAMS: MeetingTeam[] = ["운영팀", "멘토링팀"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  const kst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function monthKey(date: Date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return `${y}년 ${parseInt(m)}월`;
}

function groupByMonth(list: Minutes[]) {
  const map = new Map<string, Minutes[]>();
  for (const m of list) {
    const key = monthKey(m.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return map;
}

// ─── Form component ───────────────────────────────────────────────────────────

type FormState = { title: string; date: string; content: string; attendees: string[]; team: MeetingTeam };

function MeetingForm({
  initialForm,
  isEdit,
  draftKey,
  staffList,
  onSubmit,
  onCancel,
  isPending,
}: {
  initialForm: FormState;
  isEdit: boolean;
  draftKey: string;
  staffList: { id: string; name: string }[];
  onSubmit: (form: FormState) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [draft, , clearDraft] = useDraft<FormState>(draftKey, initialForm);
  const [form, setForm] = useState<FormState>(draft);
  const [attendeeInput, setAttendeeInput] = useState("");

  function updateForm(partial: Partial<FormState>) {
    const next = { ...form, ...partial };
    setForm(next);
    try { sessionStorage.setItem(`draft:${draftKey}`, JSON.stringify(next)); } catch {}
  }

  function addAttendee() {
    const name = attendeeInput.trim();
    if (!name || form.attendees.includes(name)) return;
    updateForm({ attendees: [...form.attendees, name] });
    setAttendeeInput("");
  }

  function handleSubmitWithClear(f: FormState) {
    clearDraft();
    onSubmit(f);
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <p className="text-sm font-semibold">{isEdit ? "회의록 수정" : "새 회의록 작성"}</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">제목 *</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => updateForm({ title: e.target.value })}
            placeholder="회의 제목"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">날짜 *</label>
          <DatePicker value={form.date || null} onChange={(d) => updateForm({ date: d ?? "" })} placeholder="날짜 선택" />
        </div>
      </div>

      {/* 팀 선택 */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">팀</label>
        <div className="flex gap-2">
          {TEAMS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => updateForm({ team: t })}
              className={cn(
                "px-4 py-1.5 text-sm rounded-lg border transition-colors",
                form.team === t
                  ? "bg-[#E9541C] text-white border-[#E9541C]"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* 참석자 */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">참석자</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={attendeeInput}
            onChange={(e) => setAttendeeInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAttendee(); } }}
            placeholder="이름 입력 후 Enter"
            className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button type="button" onClick={addAttendee} className="px-3 py-1.5 text-xs border rounded-lg hover:bg-muted transition-colors">
            추가
          </button>
        </div>
        {/* 직원 빠른 추가 */}
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {staffList.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                if (!form.attendees.includes(s.name))
                  updateForm({ attendees: [...form.attendees, s.name] });
              }}
              className={cn(
                "text-[11px] px-2 py-0.5 rounded-full border transition-colors",
                form.attendees.includes(s.name)
                  ? "bg-[#FBE9DE] border-[#F6DBC7] text-[#C5461A]"
                  : "bg-muted/40 border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
        {form.attendees.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {form.attendees.map((name) => (
              <span key={name} className="flex items-center gap-1 text-xs bg-[#FBE9DE] text-[#C5461A] px-2 py-0.5 rounded-full">
                {name}
                <button onClick={() => updateForm({ attendees: form.attendees.filter((a) => a !== name) })} className="hover:text-red-500">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 내용 */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">회의 내용</label>
        <MarkdownEditor
          value={form.content}
          onChange={(v) => updateForm({ content: v })}
          placeholder="회의 내용, 결정 사항, 액션 아이템 등을 입력하세요"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">
          취소
        </button>
        <button
          onClick={() => handleSubmitWithClear(form)}
          disabled={isPending}
          className="px-4 py-2 text-sm bg-[#E9541C] text-white rounded-lg hover:bg-[#C5461A] transition-colors disabled:opacity-50"
        >
          {isEdit ? "수정 완료" : "등록"}
        </button>
      </div>
    </div>
  );
}

// ─── Minutes card ─────────────────────────────────────────────────────────────

function MinutesCard({
  m,
  currentUserId,
  isAdmin,
  onEdit,
  onDelete,
  onRead,
  isPending,
}: {
  m: Minutes;
  currentUserId: string;
  isAdmin: boolean;
  onEdit: (m: Minutes) => void;
  onDelete: (id: string) => void;
  onRead: (id: string) => void;
  isPending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const hasRead = m.reads.some((r) => r.userId === currentUserId);
  const canEdit = m.authorId === currentUserId || isAdmin;

  return (
    <div className={cn("rounded-xl border bg-card overflow-hidden transition-shadow", expanded && "shadow-sm")}>
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {!hasRead && <span className="w-1.5 h-1.5 rounded-full bg-[#E9541C] shrink-0" />}
            <p className="text-sm font-semibold truncate">{m.title}</p>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-muted-foreground">{formatDate(m.date)}</span>
            <span className="text-xs text-muted-foreground">작성: {m.authorName}</span>
            {m.attendees.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                {m.attendees.slice(0, 3).join(", ")}
                {m.attendees.length > 3 && ` 외 ${m.attendees.length - 3}명`}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {m.reads.length > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <CheckCheck className="h-3.5 w-3.5 text-green-500" />
              {m.reads.length}명 확인
            </span>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t px-4 py-4 space-y-4">
          {m.attendees.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {m.attendees.map((name) => (
                <span key={name} className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{name}</span>
              ))}
            </div>
          )}
          <MarkdownViewer source={m.content} />
          {m.reads.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-[11px] text-muted-foreground mb-1.5">확인한 사람</p>
              <div className="flex flex-wrap gap-1.5">
                {m.reads.map((r) => (
                  <span key={r.userId} className="text-[11px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                    {r.userName}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between pt-1">
            <div>
              {!hasRead && (
                <button
                  onClick={() => onRead(m.id)}
                  disabled={isPending}
                  className="flex items-center gap-1.5 text-xs text-[#E9541C] border border-[#F6DBC7] bg-[#FBE9DE] px-3 py-1.5 rounded-lg hover:bg-[#FEF5EF] transition-colors"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  확인했습니다
                </button>
              )}
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <button
                  onClick={() => onEdit(m)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border px-2.5 py-1.5 rounded-lg hover:bg-muted transition-colors"
                >
                  <Pencil className="h-3 w-3" />수정
                </button>
                {deleteConfirm ? (
                  <div className="flex gap-1">
                    <button onClick={() => onDelete(m.id)} disabled={isPending} className="text-xs px-2.5 py-1.5 bg-destructive text-white rounded-lg">삭제</button>
                    <button onClick={() => setDeleteConfirm(false)} className="text-xs px-2.5 py-1.5 border rounded-lg hover:bg-muted">취소</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(true)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive border px-2.5 py-1.5 rounded-lg hover:bg-muted transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />삭제
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Team panel ───────────────────────────────────────────────────────────────

function TeamPanel({
  list,
  currentUserId,
  isAdmin,
  onEdit,
  onDelete,
  onRead,
  isPending,
}: {
  list: Minutes[];
  currentUserId: string;
  isAdmin: boolean;
  onEdit: (m: Minutes) => void;
  onDelete: (id: string) => void;
  onRead: (id: string) => void;
  isPending: boolean;
}) {
  const grouped = groupByMonth(list);
  const monthKeys = Array.from(grouped.keys()).sort((a, b) => b.localeCompare(a));
  // 가장 최근 달만 기본 열림
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set(monthKeys.slice(0, 1)));

  function toggleMonth(key: string) {
    setOpenMonths((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  if (list.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground text-sm">
        등록된 회의록이 없습니다
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {monthKeys.map((key) => {
        const items = grouped.get(key)!;
        const isOpen = openMonths.has(key);
        const unread = items.filter((m) => !m.reads.some((r) => r.userId === currentUserId)).length;

        return (
          <div key={key} className="rounded-xl border overflow-hidden">
            {/* 월 헤더 */}
            <button
              className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors"
              onClick={() => toggleMonth(key)}
            >
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">{monthLabel(key)}</span>
                <span className="text-xs text-muted-foreground">{items.length}건</span>
                {unread > 0 && (
                  <span className="text-[11px] bg-[#E9541C] text-white px-1.5 py-0.5 rounded-full">
                    미확인 {unread}
                  </span>
                )}
              </div>
              {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>

            {/* 월 내 회의록 목록 */}
            {isOpen && (
              <div className="p-2 space-y-2 bg-card">
                {items.map((m) => (
                  <MinutesCard
                    key={m.id}
                    m={m}
                    currentUserId={currentUserId}
                    isAdmin={isAdmin}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onRead={onRead}
                    isPending={isPending}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main board ───────────────────────────────────────────────────────────────

export function MeetingMinutesBoard({
  initialMinutes,
  currentUserId,
  currentUserRole,
  staffList,
}: Props) {
  const [minutesList, setMinutesList] = useState<Minutes[]>(initialMinutes);
  const [activeTeam, setActiveTeam] = useState<MeetingTeam>("운영팀");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isAdmin = currentUserRole === "DIRECTOR" || currentUserRole === "SUPER_ADMIN";

  const emptyForm: FormState = { title: "", date: todayStr(), content: "", attendees: [], team: activeTeam };

  const teamList = minutesList.filter((m) => m.team === activeTeam);
  const teamUnread = minutesList.filter(
    (m) => m.team === activeTeam && !m.reads.some((r) => r.userId === currentUserId)
  ).length;

  function openNew() {
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(m: Minutes) {
    setEditingId(m.id);
    setShowForm(true);
  }

  function handleSubmit(form: FormState) {
    if (!form.title.trim() || !form.date) { toast.error("제목과 날짜를 입력해주세요"); return; }
    startTransition(async () => {
      try {
        if (editingId) {
          const updated = await updateMeetingMinutes(editingId, form);
          setMinutesList((prev) => prev.map((m) => (m.id === editingId ? updated as Minutes : m)));
          toast.success("수정되었습니다");
        } else {
          const created = await createMeetingMinutes(form);
          setMinutesList((prev) => [created as Minutes, ...prev]);
          setActiveTeam(form.team);
          toast.success("회의록이 등록되었습니다");
        }
        setShowForm(false);
        setEditingId(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "저장 실패");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteMeetingMinutes(id);
        setMinutesList((prev) => prev.filter((m) => m.id !== id));
        toast.success("삭제되었습니다");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "삭제 실패");
      }
    });
  }

  function handleRead(id: string) {
    startTransition(async () => {
      try {
        await markMeetingMinutesRead(id);
        setMinutesList((prev) =>
          prev.map((m) =>
            m.id === id && !m.reads.some((r) => r.userId === currentUserId)
              ? { ...m, reads: [...m.reads, { userId: currentUserId, userName: "나", readAt: new Date() }] }
              : m
          )
        );
      } catch {
        toast.error("확인 처리 실패");
      }
    });
  }

  // editingId에 해당하는 회의록 찾기
  const editingMinutes = editingId ? minutesList.find((m) => m.id === editingId) : null;
  const editForm: FormState = editingMinutes
    ? { title: editingMinutes.title, date: editingMinutes.date.toISOString().slice(0, 10), content: editingMinutes.content, attendees: [...editingMinutes.attendees], team: editingMinutes.team as MeetingTeam }
    : emptyForm;

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">회의록</h1>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 text-sm bg-[#E9541C] text-white px-3 py-1.5 rounded-lg hover:bg-[#C5461A] transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          새 회의록
        </button>
      </div>

      {/* 작성/수정 폼 */}
      {showForm && (
        <MeetingForm
          initialForm={editForm}
          isEdit={!!editingId}
          draftKey={editingId ? `meeting-minutes-edit-${editingId}` : "meeting-minutes-new"}
          staffList={staffList}
          onSubmit={handleSubmit}
          onCancel={() => { setShowForm(false); setEditingId(null); }}
          isPending={isPending}
        />
      )}

      {/* 팀 탭 */}
      <div className="flex gap-1 border-b">
        {TEAMS.map((team) => {
          const count = minutesList.filter((m) => m.team === team).length;
          const unread = minutesList.filter(
            (m) => m.team === team && !m.reads.some((r) => r.userId === currentUserId)
          ).length;
          return (
            <button
              key={team}
              onClick={() => setActiveTeam(team)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTeam === team
                  ? "border-[#E9541C] text-[#E9541C]"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {team}
              <span className={cn(
                "text-[11px] px-1.5 py-0.5 rounded-full",
                activeTeam === team ? "bg-[#FBE9DE] text-[#C5461A]" : "bg-muted text-muted-foreground"
              )}>
                {count}
              </span>
              {unread > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#E9541C]" />
              )}
            </button>
          );
        })}
      </div>

      {/* 미확인 안내 */}
      {teamUnread > 0 && (
        <p className="text-xs text-[#E9541C]">미확인 회의록 {teamUnread}건이 있습니다</p>
      )}

      {/* 월별 목록 */}
      <TeamPanel
        list={teamList}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        onEdit={openEdit}
        onDelete={handleDelete}
        onRead={handleRead}
        isPending={isPending}
      />
    </div>
  );
}

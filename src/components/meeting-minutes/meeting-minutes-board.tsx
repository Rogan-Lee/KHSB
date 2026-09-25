"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { useDraft } from "@/hooks/use-draft";
import { type MeetingTeam, createMeetingMinutes, updateMeetingMinutes, deleteMeetingMinutes, markMeetingMinutesRead } from "@/actions/meeting-minutes";
import { Plus, Pencil, Trash2, CheckCheck, ChevronDown, X, Lock, NotebookPen } from "lucide-react";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EmptyState,
  FilterChip,
  FormActions,
  FormField,
  PageHeader,
  Section,
  Segmented,
  StatusBadge,
} from "@/components/backoffice/ui";

// ─── Types ────────────────────────────────────────────────────────────────────

type Read = { userId: string; userName: string; readAt: Date };
type Minutes = {
  id: string;
  title: string;
  date: Date;
  content: string;
  attendees: string[];
  team: string;
  visibleTo?: string[];
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

const TEAMS: MeetingTeam[] = ["운영팀", "멘토링팀", "면담"];

/** 선택된 토글 칩 — 브랜드 약한 채움 (FilterChip 기본 선택색을 덮는다) */
const PICKED_CHIP = "bg-bg-brand-weak text-fg-brand hover:bg-bg-brand-weak-pressed";

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

type FormState = {
  title: string;
  date: string;
  content: string;
  attendees: string[];
  team: MeetingTeam;
  visibleTo: string[]; // 빈 배열 = 공개. user.id 배열.
};

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
  const uid = useId();

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
    <Section title={isEdit ? "회의록 수정" : "새 회의록 작성"}>
      <div className="flex flex-col gap-x5">
        <div className="grid grid-cols-1 gap-x4 sm:grid-cols-2">
          <FormField label="제목" required htmlFor={`${uid}-title`}>
            <Input
              id={`${uid}-title`}
              type="text"
              value={form.title}
              onChange={(e) => updateForm({ title: e.target.value })}
              placeholder="회의 제목"
            />
          </FormField>
          <FormField label="날짜" required>
            <DatePicker value={form.date || null} onChange={(d) => updateForm({ date: d ?? "" })} placeholder="날짜 선택" />
          </FormField>
        </div>

        {/* 팀 선택 */}
        <FormField label="팀">
          <Segmented
            aria-label="팀"
            options={TEAMS.map((t) => ({ value: t, label: t }))}
            value={form.team}
            onChange={(t) => updateForm({ team: t })}
            className="sm:w-80"
          />
        </FormField>

        {/* 참석자 */}
        <FormField label="참석자" htmlFor={`${uid}-attendee`} hint="직원 이름을 누르면 바로 추가돼요">
          <div className="flex gap-x2">
            <Input
              id={`${uid}-attendee`}
              type="text"
              value={attendeeInput}
              onChange={(e) => setAttendeeInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAttendee(); } }}
              placeholder="이름 입력 후 Enter"
              className="min-w-0 flex-1"
            />
            <Button type="button" variant="outline" onClick={addAttendee}>
              추가
            </Button>
          </div>
          {form.attendees.length > 0 && (
            <ul className="flex flex-wrap gap-x1_5" aria-label="추가된 참석자">
              {form.attendees.map((name) => (
                <li
                  key={name}
                  className="inline-flex h-8 items-center gap-x0_5 rounded-full bg-bg-neutral-weak pl-x3 pr-x1 t3-medium text-fg-neutral"
                >
                  {name}
                  <button
                    type="button"
                    aria-label={`${name} 제거`}
                    onClick={() => updateForm({ attendees: form.attendees.filter((a) => a !== name) })}
                    className="grid size-6 place-items-center rounded-full text-fg-neutral-subtle transition-colors hover:bg-bg-transparent-pressed hover:text-fg-neutral"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* 직원 빠른 추가 */}
          {staffList.length > 0 && (
            <div className="flex flex-wrap gap-x1_5">
              {staffList.map((s) => {
                const added = form.attendees.includes(s.name);
                return (
                  <FilterChip
                    key={s.id}
                    selected={added}
                    onClick={() => {
                      if (!form.attendees.includes(s.name))
                        updateForm({ attendees: [...form.attendees, s.name] });
                    }}
                    className={cn(added && PICKED_CHIP)}
                  >
                    {s.name}
                  </FilterChip>
                );
              })}
            </div>
          )}
        </FormField>

        {/* 열람 제한 */}
        <FormField
          label="열람 가능 범위"
          hint={
            form.visibleTo.length > 0 ? (
              <span className="inline-flex items-center gap-x1 t3-medium text-fg-brand tabular-nums">
                <Lock className="size-3.5" aria-hidden />
                {form.visibleTo.length}명 + 작성자 + 원장만 열람 가능
              </span>
            ) : (
              "선택하지 않으면 전체 공개예요. 선택하면 지정한 사람과 작성자, 원장만 볼 수 있어요."
            )
          }
        >
          <div className="flex flex-wrap gap-x1_5" role="group" aria-label="열람 가능한 사람">
            {staffList.map((s) => {
              const selected = form.visibleTo.includes(s.id);
              return (
                <FilterChip
                  key={s.id}
                  selected={selected}
                  onClick={() =>
                    updateForm({
                      visibleTo: selected
                        ? form.visibleTo.filter((id) => id !== s.id)
                        : [...form.visibleTo, s.id],
                    })
                  }
                  className={cn(selected && PICKED_CHIP)}
                >
                  {s.name}
                </FilterChip>
              );
            })}
          </div>
        </FormField>

        {/* 내용 */}
        <FormField label="회의 내용">
          <MarkdownEditor
            value={form.content}
            onChange={(v) => updateForm({ content: v })}
            placeholder="회의 내용, 결정 사항, 액션 아이템 등을 입력하세요"
          />
        </FormField>

        <FormActions className="border-t border-stroke-neutral-muted pt-x4">
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1 sm:flex-none">
            취소
          </Button>
          <Button
            type="button"
            onClick={() => handleSubmitWithClear(form)}
            disabled={isPending}
            className="flex-1 sm:flex-none"
          >
            {isPending ? "저장 중…" : isEdit ? "수정 완료" : "등록"}
          </Button>
        </FormActions>
      </div>
    </Section>
  );
}

// ─── Minutes row ──────────────────────────────────────────────────────────────

function MinutesRow({
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const bodyId = useId();
  const hasRead = m.reads.some((r) => r.userId === currentUserId);
  const canEdit = m.authorId === currentUserId || isAdmin;
  const restricted = !!m.visibleTo && m.visibleTo.length > 0;

  return (
    <li className="relative">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-x3 px-x5 py-x4 text-left transition-colors hover:bg-bg-layer-default-pressed"
      >
        {!hasRead && (
          <span className="absolute left-2 top-6 size-1.5 rounded-full bg-bg-brand-solid" aria-hidden />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-x1_5">
            <span className={cn("truncate text-fg-neutral", hasRead ? "t5-medium" : "t5-bold")}>{m.title}</span>
            {!hasRead && <span className="sr-only">(미확인)</span>}
            {restricted && (
              <StatusBadge tone="gray" className="shrink-0">
                <Lock aria-hidden />
                열람 제한
              </StatusBadge>
            )}
          </span>
          <span className="mt-x1 flex flex-wrap items-center gap-x-x1_5 t3-regular text-fg-neutral-subtle tabular-nums">
            <span>{formatDate(m.date)}</span>
            <span aria-hidden>·</span>
            <span>작성 {m.authorName}</span>
            {m.attendees.length > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>
                  참석 {m.attendees.slice(0, 3).join(", ")}
                  {m.attendees.length > 3 && ` 외 ${m.attendees.length - 3}명`}
                </span>
              </>
            )}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-x2">
          {m.reads.length > 0 && (
            <span className="inline-flex items-center gap-x1 t3-medium text-fg-neutral-subtle tabular-nums">
              <CheckCheck className="size-4 text-fg-positive" aria-hidden />
              {m.reads.length}명 확인
            </span>
          )}
          <ChevronDown
            className={cn("size-5 text-fg-neutral-subtle transition-transform", expanded && "rotate-180")}
            aria-hidden
          />
        </span>
      </button>

      {expanded && (
        <div id={bodyId} className="flex flex-col gap-x5 px-x5 pb-x5 pt-x1">
          {m.attendees.length > 0 && (
            <div className="flex flex-col gap-x2">
              <p className="t3-medium text-fg-neutral-subtle">참석자</p>
              <div className="flex flex-wrap gap-x1_5">
                {m.attendees.map((name) => (
                  <span key={name} className="rounded-full bg-bg-neutral-weak px-x2_5 py-x1 t3-medium text-fg-neutral-muted">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <MarkdownViewer source={m.content} />

          {m.reads.length > 0 && (
            <div className="flex flex-col gap-x2">
              <p className="t3-medium text-fg-neutral-subtle tabular-nums">확인한 사람 {m.reads.length}명</p>
              <div className="flex flex-wrap gap-x1_5">
                {m.reads.map((r) => (
                  <span key={r.userId} className="rounded-full bg-bg-positive-weak px-x2_5 py-x1 t3-medium text-fg-positive">
                    {r.userName}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(!hasRead || canEdit) && (
            <div className="flex flex-wrap items-center justify-between gap-x2 border-t border-stroke-neutral-muted pt-x4">
              <div>
                {!hasRead && (
                  <Button variant="soft" size="sm" onClick={() => onRead(m.id)} disabled={isPending}>
                    <CheckCheck aria-hidden />
                    확인했어요
                  </Button>
                )}
              </div>
              {canEdit && (
                <div className="flex gap-x2">
                  <Button variant="outline" size="sm" onClick={() => onEdit(m)}>
                    <Pencil aria-hidden />
                    수정
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
                    <Trash2 aria-hidden />
                    삭제
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {canEdit && (
        <Dialog open={deleteOpen} onOpenChange={(open) => { if (!isPending) setDeleteOpen(open); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>회의록 삭제</DialogTitle>
              <DialogDescription>‘{m.title}’ 회의록을 삭제할까요? 되돌릴 수 없어요.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={isPending}>
                취소
              </Button>
              <Button variant="destructive" onClick={() => onDelete(m.id)} disabled={isPending}>
                {isPending ? "삭제 중…" : "삭제"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </li>
  );
}

// ─── Team panel ───────────────────────────────────────────────────────────────

function TeamPanel({
  team,
  list,
  currentUserId,
  isAdmin,
  onNew,
  onEdit,
  onDelete,
  onRead,
  isPending,
}: {
  team: MeetingTeam;
  list: Minutes[];
  currentUserId: string;
  isAdmin: boolean;
  onNew: () => void;
  onEdit: (m: Minutes) => void;
  onDelete: (id: string) => void;
  onRead: (id: string) => void;
  isPending: boolean;
}) {
  const uid = useId();
  const grouped = groupByMonth(list);
  const monthKeys = Array.from(grouped.keys()).sort((a, b) => b.localeCompare(a));
  // 가장 최근 달만 기본 열림 — 사용자가 접거나 편 달만 기억한다
  const [toggled, setToggled] = useState<Map<string, boolean>>(() => new Map());
  const isMonthOpen = (key: string) => toggled.get(key) ?? key === monthKeys[0];

  function toggleMonth(key: string) {
    setToggled((prev) => {
      const next = new Map(prev);
      next.set(key, !(prev.get(key) ?? key === monthKeys[0]));
      return next;
    });
  }

  if (list.length === 0) {
    return (
      <Section>
        <EmptyState
          icon={NotebookPen}
          title={`아직 ${team} 회의록이 없어요`}
          description="회의 내용과 결정 사항을 기록해 팀원과 공유해 보세요"
          action={
            <Button onClick={onNew}>
              <Plus aria-hidden />
              새 회의록
            </Button>
          }
        />
      </Section>
    );
  }

  const unreadTotal = list.filter((m) => !m.reads.some((r) => r.userId === currentUserId)).length;

  return (
    <div className="flex flex-col gap-x3">
      {/* 미확인 안내 */}
      {unreadTotal > 0 && (
        <p className="flex items-center gap-x2 t4-medium text-fg-neutral-muted">
          <span className="size-1.5 shrink-0 rounded-full bg-bg-brand-solid" aria-hidden />
          <span>
            확인하지 않은 회의록이 <span className="t4-bold text-fg-brand tabular-nums">{unreadTotal}건</span> 있어요
          </span>
        </p>
      )}

      {monthKeys.map((key) => {
        const items = grouped.get(key)!;
        const isOpen = isMonthOpen(key);
        const unread = items.filter((m) => !m.reads.some((r) => r.userId === currentUserId)).length;
        const listId = `${uid}-${key}`;

        return (
          <Section key={key} flush className="overflow-hidden">
            {/* 월 헤더 */}
            <h2>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={listId}
                onClick={() => toggleMonth(key)}
                className="flex w-full items-center gap-x2 px-x5 py-x4 text-left transition-colors hover:bg-bg-layer-default-pressed"
              >
                <span className="t5-bold text-fg-neutral tabular-nums">{monthLabel(key)}</span>
                <span className="t4-regular text-fg-neutral-subtle tabular-nums">{items.length}건</span>
                {unread > 0 && <StatusBadge tone="brand">미확인 {unread}</StatusBadge>}
                <ChevronDown
                  className={cn("ml-auto size-5 shrink-0 text-fg-neutral-subtle transition-transform", isOpen && "rotate-180")}
                  aria-hidden
                />
              </button>
            </h2>

            {/* 월 내 회의록 목록 */}
            {isOpen && (
              <ul id={listId} className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
                {items.map((m) => (
                  <MinutesRow
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
              </ul>
            )}
          </Section>
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
  const formRef = useRef<HTMLDivElement>(null);

  const isAdmin = currentUserRole === "DIRECTOR" || currentUserRole === "SUPER_ADMIN";

  const emptyForm: FormState = { title: "", date: todayStr(), content: "", attendees: [], team: activeTeam, visibleTo: [] };

  // 폼을 열면(새로 쓰기·다른 회의록 수정) 폼 위치로 스크롤
  useEffect(() => {
    if (showForm) formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showForm, editingId]);

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
    ? {
        title: editingMinutes.title,
        date: editingMinutes.date.toISOString().slice(0, 10),
        content: editingMinutes.content,
        attendees: [...editingMinutes.attendees],
        team: editingMinutes.team as MeetingTeam,
        visibleTo: [...(editingMinutes.visibleTo ?? [])],
      }
    : emptyForm;

  return (
    <div>
      <PageHeader
        title="회의록"
        description="팀별 회의 내용을 기록하고 확인 여부를 관리해요"
        actions={
          <Button onClick={openNew}>
            <Plus aria-hidden />
            새 회의록
          </Button>
        }
      />

      {/* 작성/수정 폼 */}
      {showForm && (
        <div ref={formRef} className="mb-x8 scroll-mt-20">
          <MeetingForm
            key={editingId ?? "new"}
            initialForm={editForm}
            isEdit={!!editingId}
            draftKey={editingId ? `meeting-minutes-edit-${editingId}` : "meeting-minutes-new"}
            staffList={staffList}
            onSubmit={handleSubmit}
            onCancel={() => { setShowForm(false); setEditingId(null); }}
            isPending={isPending}
          />
        </div>
      )}

      {/* 팀 탭 */}
      <Tabs value={activeTeam} onValueChange={(v) => setActiveTeam(v as MeetingTeam)}>
        <TabsList aria-label="팀">
          {TEAMS.map((team) => {
            const count = minutesList.filter((m) => m.team === team).length;
            const unread = minutesList.filter(
              (m) => m.team === team && !m.reads.some((r) => r.userId === currentUserId)
            ).length;
            const active = activeTeam === team;
            return (
              <TabsTrigger key={team} value={team}>
                {team}
                <span className={cn("t4-bold tabular-nums", active ? "text-fg-brand" : "text-fg-placeholder")}>
                  {count}
                </span>
                {unread > 0 && (
                  <>
                    <span className="size-1.5 rounded-full bg-bg-brand-solid" aria-hidden />
                    <span className="sr-only">미확인 {unread}건</span>
                  </>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {TEAMS.map((team) => (
          <TabsContent key={team} value={team}>
            <TeamPanel
              team={team}
              list={minutesList.filter((m) => m.team === team)}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              onNew={openNew}
              onEdit={openEdit}
              onDelete={handleDelete}
              onRead={handleRead}
              isPending={isPending}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

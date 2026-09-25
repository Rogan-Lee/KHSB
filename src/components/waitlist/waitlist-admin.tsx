"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  BranchWaitStatus,
  WaitGender,
  WaitGradeType,
  WaitlistStatus,
} from "@/generated/prisma/enums";
import { toast } from "sonner";
import {
  setWaitlistStatus,
  cancelWaitlist,
  updateWaitlistEntry,
  saveWaitlistGuide,
  bulkEnrollStudents,
  createBranch,
  updateBranch,
  createProgram,
  toggleProgram,
  updateProgram,
} from "@/actions/waitlist";
import { createConsultation } from "@/actions/consultations";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { DateTimePickerInput } from "@/components/ui/time-picker";
import { formatDateTime, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, inputBaseClass } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  EmptyState,
  FilterChip,
  FormActions,
  FormField,
  Notice,
  SearchField,
  Section,
  Segmented,
  StatCard,
  StatCards,
  StatusBadge,
  TableCard,
  Toolbar,
  type Tone,
} from "@/components/backoffice/ui";
import { Switch } from "seed-design/ui/switch";
import {
  Building2,
  CalendarPlus,
  Check,
  ClipboardList,
  Copy,
  FileText,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  Undo2,
  UserPlus,
  XCircle,
} from "lucide-react";
import { useConfirmDialog } from "@/components/suggestions/use-confirm-dialog";

type StudentLite = { id: string; name: string; grade: string };

type Program = {
  id: string;
  name: string;
  isActive: boolean;
  capacity: number | null;
  enrolled: number;
  waiting: number;
};
type Branch = {
  id: string;
  name: string;
  slug: string;
  waitStatus: BranchWaitStatus;
  notice: string | null;
  isActive: boolean;
  capacity: number | null;
  enrolled: number;
  waiting: number;
  programs: Program[];
};
type Entry = {
  id: string;
  name: string;
  phone: string;
  branchId: string;
  branchName: string;
  programId: string | null;
  programName: string | null;
  gender: WaitGender | null;
  gradeType: WaitGradeType | null;
  kind: "WAITLIST" | "INQUIRY";
  entryPreference: string | null; // "winter" | "immediate" | null
  phoneVerifiedAt: string | null;
  status: WaitlistStatus;
  studentId: string | null;
  matchedStudent: StudentLite | null;
  note: string | null;
  cancelReason: string | null;
  guideToken: string | null;
  guideContent: string | null;
  createdAt: string;
};

const WAIT_STATUS_LABEL: Record<BranchWaitStatus, string> = {
  WAITLIST_OPEN: "대기 등록",
  ALMOST_FULL: "마감 임박",
  IMMEDIATE: "바로 등원",
  CLOSED: "마감",
};
const STATUS_LABEL: Record<WaitlistStatus, string> = {
  WAITING: "대기",
  INVITED: "초대됨",
  ENROLLED: "등원",
  CANCELLED: "취소",
};
const STATUS_TONE: Record<WaitlistStatus, Tone> = {
  WAITING: "info",
  INVITED: "warn",
  ENROLLED: "ok",
  CANCELLED: "gray",
};

// 네이티브 select 를 SEED TextInput 규격으로
const nativeSelect = cn("h-10 border-0 pr-x2", inputBaseClass);

export function WaitlistAdmin({
  branches,
  entries,
  students,
}: {
  branches: Branch[];
  entries: Entry[];
  students: StudentLite[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"entries" | "branches">("entries");
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) setError(res.error ?? "처리에 실패했습니다");
      router.refresh();
    });
  }

  // 대기 순번: 같은 지점+학년의 대기신청(WAITLIST) WAITING 중 등록순. 단순 문의 제외.
  const positionOf = (entry: Entry): number => {
    if (entry.status !== "WAITING" || entry.kind !== "WAITLIST") return 0;
    const group = entries
      .filter(
        (e) =>
          e.branchId === entry.branchId &&
          e.gradeType === entry.gradeType &&
          e.status === "WAITING" &&
          e.kind === "WAITLIST"
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return group.findIndex((e) => e.id === entry.id) + 1;
  };

  const waitlistWaiting = entries.filter((e) => e.status === "WAITING" && e.kind === "WAITLIST").length;
  const invited = entries.filter((e) => e.status === "INVITED").length;
  const enrolled = entries.filter((e) => e.status === "ENROLLED").length;
  const inquiries = entries.filter((e) => e.kind === "INQUIRY").length;

  return (
    <div className="flex flex-col gap-x6">
      <StatCards cols={4}>
        <StatCard label="대기 중" value={waitlistWaiting} unit="명" sub="단순 문의 제외" />
        <StatCard label="안내 발송(초대됨)" value={invited} unit="명" />
        <StatCard label="등원 확정" value={enrolled} unit="명" />
        <StatCard label="단순 문의" value={inquiries} unit="건" />
      </StatCards>

      <ShareApply />

      <Tabs value={tab} onValueChange={(v) => setTab(v as "entries" | "branches")}>
        <TabsList>
          <TabsTrigger value="entries">
            대기자
            <span className={cn("t4-bold tabular-nums", tab === "entries" ? "text-fg-brand" : "text-fg-placeholder")}>
              {entries.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="branches">
            지점·프로그램
            <span className={cn("t4-bold tabular-nums", tab === "branches" ? "text-fg-brand" : "text-fg-placeholder")}>
              {branches.length}
            </span>
          </TabsTrigger>
        </TabsList>

        {error && <Notice tone="bad" className="mt-x4">{error}</Notice>}

        <TabsContent value="entries">
          <EntriesTab entries={entries} branches={branches} positionOf={positionOf} run={run} pending={pending} />
        </TabsContent>
        <TabsContent value="branches">
          <BranchesTab branches={branches} entries={entries} students={students} run={run} pending={pending} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** 대기 신청 유도 메시지 + /apply 링크 공유 (저장 없음, 작성→복사). */
function ShareApply() {
  const [origin, setOrigin] = useState("");
  // SSR 과 첫 렌더를 맞추려고 마운트 뒤에 origin 을 읽는다 (기존 동작 유지)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOrigin(window.location.origin), []);
  const link = `${origin}/apply`;
  const [msg, setMsg] = useState(
    "안녕하세요! 대기 신청 안내드립니다.\n현재 정원이 가득 차 대기 신청만 받고 있어요. 아래 링크에서 1분이면 신청하실 수 있습니다 👇"
  );

  async function copy(text: string, ok: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(ok);
    } catch {
      toast.error("복사 실패 — 브라우저 권한을 확인하세요");
    }
  }

  return (
    <Section
      title="대기 신청 링크 공유"
      description="안내 메시지와 함께 카톡·문자로 보내세요. (예비 신청자에게 발송)"
    >
      <div className="grid grid-cols-1 gap-x4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <FormField label="신청 링크" htmlFor="waitlist-apply-link">
          <div className="flex gap-x2">
            <Input id="waitlist-apply-link" readOnly value={link} className="min-w-0 flex-1" />
            <Button variant="secondary" onClick={() => copy(link, "신청 링크가 복사되었습니다")}>
              <Link2 />
              링크만 복사
            </Button>
          </div>
        </FormField>
        <FormField label="안내 메시지" htmlFor="waitlist-apply-msg" hint="복사하면 메시지 아래에 링크가 붙어요.">
          <Textarea
            id="waitlist-apply-msg"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            rows={3}
            className="resize-none"
            placeholder="유도 안내 메시지"
          />
        </FormField>
      </div>
      <FormActions className="mt-x2">
        <Button onClick={() => copy(`${msg}\n${link}`, "안내 메시지 + 링크가 복사되었습니다")} className="w-full sm:w-auto">
          <Copy />
          메시지 + 링크 복사
        </Button>
      </FormActions>
    </Section>
  );
}

type EntryFilter = WaitlistStatus | "ALL" | "INQUIRY" | "WINTER" | "IMMEDIATE";
const ENTRY_FILTERS: { key: EntryFilter; label: string }[] = [
  { key: "WAITING", label: "대기" },
  { key: "INVITED", label: "초대됨" },
  { key: "ENROLLED", label: "등원" },
  { key: "CANCELLED", label: "취소" },
  { key: "INQUIRY", label: "문의" },
  { key: "WINTER", label: "윈터 희망" },
  { key: "IMMEDIATE", label: "즉시 희망" },
  { key: "ALL", label: "전체" },
];

function matchesFilter(e: Entry, f: EntryFilter): boolean {
  if (f === "ALL") return true;
  if (f === "INQUIRY") return e.kind === "INQUIRY";
  if (f === "WINTER") return e.entryPreference === "winter";
  if (f === "IMMEDIATE") return e.entryPreference === "immediate";
  return e.status === f;
}

/** 입실 희망 뱃지 — winter/immediate 외 값(과거 데이터)은 미표시 */
function EntryPreferenceBadge({ value }: { value: string | null }) {
  if (value !== "winter" && value !== "immediate") return <span className="text-fg-placeholder">—</span>;
  return value === "winter" ? (
    <StatusBadge tone="info">윈터</StatusBadge>
  ) : (
    <StatusBadge tone="ok">즉시</StatusBadge>
  );
}

function EntriesTab({
  entries,
  branches,
  positionOf,
  run,
  pending,
}: {
  entries: Entry[];
  branches: Branch[];
  positionOf: (e: Entry) => number;
  run: (a: () => Promise<{ ok: boolean; error?: string }>) => void;
  pending: boolean;
}) {
  const [filter, setFilter] = useState<EntryFilter>("WAITING");
  const [editing, setEditing] = useState<Entry | null>(null);
  const [guiding, setGuiding] = useState<Entry | null>(null);
  const [consulting, setConsulting] = useState<Entry | null>(null);
  const { prompt, dialog } = useConfirmDialog();

  const shown = entries.filter((e) => matchesFilter(e, filter));
  const countOf = (k: EntryFilter) => entries.filter((e) => matchesFilter(e, k)).length;

  async function handleCancel(e: Entry) {
    // 취소 사유는 확인 다이얼로그에서 한 줄로 받는다 (비워도 됨).
    const reason = await prompt({
      title: `${e.name} 님의 대기를 취소할까요?`,
      description: "취소해도 목록의 ‘취소’ 필터에서 다시 대기로 되돌릴 수 있어요.",
      label: "취소 사유",
      placeholder: "예: 타 독서실 등록",
      confirmLabel: "대기 취소",
      cancelLabel: "닫기",
      destructive: true,
    });
    if (reason === null) return; // 취소 안 함
    run(() => cancelWaitlist(e.id, reason));
  }

  async function copyGuideLink(e: Entry) {
    if (!e.guideToken) return;
    const url = `${window.location.origin}/apply/guide/${e.guideToken}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("안내 링크가 복사되었습니다");
    } catch {
      toast.error("복사 실패 — 브라우저 권한을 확인하세요");
    }
  }

  const activeLabel = ENTRY_FILTERS.find((f) => f.key === filter)?.label ?? "";

  return (
    <div>
      <Toolbar>
        {ENTRY_FILTERS.map((f) => (
          <FilterChip key={f.key} selected={filter === f.key} count={countOf(f.key)} onClick={() => setFilter(f.key)}>
            {f.label}
          </FilterChip>
        ))}
      </Toolbar>

      <TableCard>
        {shown.length === 0 ? (
          <EmptyState
            compact
            icon={ClipboardList}
            title={filter === "ALL" ? "아직 대기자가 없어요" : `‘${activeLabel}’ 상태의 대기자가 없어요`}
            description={filter === "ALL" ? "위의 신청 링크를 공유하면 신청이 여기에 쌓여요." : "다른 필터를 눌러 확인해 보세요."}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16 text-right">순번</TableHead>
                <TableHead>이름</TableHead>
                <TableHead>연락처</TableHead>
                <TableHead>지점</TableHead>
                <TableHead>학년·성별</TableHead>
                <TableHead>입실 희망</TableHead>
                <TableHead>프로그램</TableHead>
                <TableHead>등록일시</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">처리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-right t4-bold text-fg-brand">
                    {e.status === "WAITING" && e.kind === "WAITLIST" ? positionOf(e) : <span className="t4-regular text-fg-placeholder">—</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-x1">
                      <span className="whitespace-nowrap t4-medium">{e.name}</span>
                      {e.kind === "INQUIRY" && <StatusBadge tone="violet">문의</StatusBadge>}
                      {e.matchedStudent && (
                        <span title={`기존 원생: ${e.matchedStudent.name} (${e.matchedStudent.grade})`}>
                          <StatusBadge tone="ok">기존 원생</StatusBadge>
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-x1">
                      <span className="whitespace-nowrap text-fg-neutral-muted">{e.phone || "—"}</span>
                      {e.phone && !e.phoneVerifiedAt && <StatusBadge tone="warn">미인증</StatusBadge>}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{e.branchName}</TableCell>
                  <TableCell className="whitespace-nowrap text-fg-neutral-muted">
                    {e.gradeType ? (e.gradeType === "REPEAT" ? "N수생" : "재학생") : "-"} ·{" "}
                    {e.gender ? (e.gender === "MALE" ? "남" : "여") : "-"}
                  </TableCell>
                  <TableCell>
                    <EntryPreferenceBadge value={e.entryPreference} />
                  </TableCell>
                  <TableCell className="text-fg-neutral-muted">{e.programName ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap t3-regular text-fg-neutral-subtle">{formatDateTime(e.createdAt)}</TableCell>
                  <TableCell>
                    <StatusBadge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</StatusBadge>
                    {e.status === "CANCELLED" && e.cancelReason && (
                      <p className="mt-x1 max-w-40 t2-regular text-fg-neutral-subtle">사유: {e.cancelReason}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-x1">
                      {e.status !== "ENROLLED" && (
                        <Button
                          variant="secondary"
                          size="xs"
                          disabled={pending}
                          onClick={() => run(() => setWaitlistStatus(e.id, "ENROLLED"))}
                        >
                          <Check />
                          등원확정
                        </Button>
                      )}
                      <Button variant="ghost" size="xs" disabled={pending} onClick={() => setGuiding(e)}>
                        <FileText />
                        {e.guideToken ? "안내 수정" : "안내 작성"}
                      </Button>
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8" aria-label={`${e.name} 더보기`} disabled={pending}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-44">
                          <DropdownMenuItem onSelect={() => setEditing(e)}>
                            <Pencil />
                            정보 수정
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setConsulting(e)}>
                            <CalendarPlus />
                            면담 등록
                          </DropdownMenuItem>
                          {e.guideToken && (
                            <DropdownMenuItem onSelect={() => copyGuideLink(e)}>
                              <Link2 />
                              안내 링크 복사
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {e.status === "CANCELLED" ? (
                            <DropdownMenuItem onSelect={() => run(() => setWaitlistStatus(e.id, "WAITING"))}>
                              <Undo2 />
                              대기복귀
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem className="text-fg-critical" onSelect={() => handleCancel(e)}>
                              <XCircle />
                              대기 취소
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>

      {editing && (
        <EditEntryModal
          entry={editing}
          branch={branches.find((b) => b.id === editing.branchId) ?? null}
          onClose={() => setEditing(null)}
          onSave={(data) => {
            run(() => updateWaitlistEntry(editing.id, data));
            setEditing(null);
          }}
        />
      )}

      {guiding && <GuideEditorModal entry={guiding} onClose={() => setGuiding(null)} />}
      {consulting && <ConsultationModal entry={consulting} onClose={() => setConsulting(null)} />}
      {dialog}
    </div>
  );
}

/** 면담 빠른 등록 — createConsultation 재사용. 기존 원생이면 studentId, 아니면 prospect. */
function ConsultationModal({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const router = useRouter();
  const [scheduledAt, setScheduledAt] = useState("");
  const [agenda, setAgenda] = useState("");
  const [saving, setSaving] = useState(false);
  const matched = entry.matchedStudent;

  async function save() {
    setSaving(true);
    const fd = new FormData();
    if (matched) {
      fd.set("studentId", matched.id);
      fd.set("category", "ENROLLED");
      fd.set("type", "STUDENT");
    } else {
      fd.set("prospectName", entry.name);
      fd.set("prospectPhone", entry.phone);
      fd.set("prospectGrade", entry.gradeType === "REPEAT" ? "N수생" : entry.gradeType === "ENROLLED" ? "재학생" : "");
      fd.set("category", "NEW_ADMISSION");
    }
    fd.set("owner", "DIRECTOR");
    if (scheduledAt) fd.set("scheduledAt", new Date(scheduledAt).toISOString());
    if (agenda.trim()) fd.set("agenda", agenda.trim());
    try {
      await createConsultation(fd);
      toast.success("면담이 등록되었습니다");
      router.refresh();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "면담 등록 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>면담 등록 — {entry.name}</DialogTitle>
          <DialogDescription>
            {matched ? `기존 원생(${matched.name}) 면담으로 등록돼요.` : "신규 상담(예비)으로 등록돼요."} 면담 관리에서 확인할 수 있어요.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-x4">
          <FormField label="면담 일시" hint="선택 사항이에요.">
            <DateTimePickerInput value={scheduledAt} onChange={setScheduledAt} className="w-full" />
          </FormField>
          <FormField label="안건·메모" htmlFor="waitlist-consult-agenda">
            <Textarea
              id="waitlist-consult-agenda"
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              rows={3}
              className="resize-none"
              placeholder="면담 안건 (선택)"
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            닫기
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "등록 중…" : "면담 등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GuideEditorModal({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const router = useRouter();
  const template =
    entry.guideContent ||
    `## 등록 안내\n안녕하세요, ${entry.name}님. 대기 순번이 도래하여 등록 안내드립니다.\n\n## 정보 입력\n아래 정보를 회신 부탁드립니다.\n- 학생 이름:\n- 생년월일:\n- 비상 연락처:\n\n## 입금 안내\n- 금액:\n- 입금 계좌:\n- 입금 기한:`;
  const [md, setMd] = useState(template);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await saveWaitlistGuide(entry.id, md);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const url = `${window.location.origin}/apply/guide/${res.data!.token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("안내 저장 + 링크 복사 완료");
    } catch {
      toast.success("안내가 저장되었습니다");
    }
    router.refresh();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>등록 안내 작성 — {entry.name}</DialogTitle>
          <DialogDescription>
            저장하면 공개 링크가 발급되고 자동으로 복사돼요. 카톡·문자로 직접 전달해 주세요. (대기 상태면 “초대됨”으로 바뀌어요)
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-r3 border border-stroke-neutral-muted p-x3">
          <MarkdownEditor value={md} onChange={setMd} placeholder="등록 안내 / 정보 입력 / 입금 안내 등" />
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            닫기
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "저장 중…" : "저장 + 링크 복사"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditEntryModal({
  entry,
  branch,
  onClose,
  onSave,
}: {
  entry: Entry;
  branch: Branch | null;
  onClose: () => void;
  onSave: (data: {
    name: string;
    phone: string;
    programId: string | null;
    gender: WaitGender;
    gradeType: WaitGradeType;
    note: string | null;
  }) => void;
}) {
  const [name, setName] = useState(entry.name);
  const [phone, setPhone] = useState(entry.phone);
  const [programId, setProgramId] = useState(entry.programId ?? "");
  const [gender, setGender] = useState<WaitGender>(entry.gender ?? "MALE");
  const [gradeType, setGradeType] = useState<WaitGradeType>(entry.gradeType ?? "ENROLLED");
  const [note, setNote] = useState(entry.note ?? "");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>대기자 정보 수정</DialogTitle>
          <DialogDescription>{entry.branchName}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-x4">
          <div className="grid grid-cols-2 gap-x3">
            <FormField label="이름" htmlFor="waitlist-edit-name">
              <Input id="waitlist-edit-name" value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField label="연락처" htmlFor="waitlist-edit-phone">
              <Input
                id="waitlist-edit-phone"
                value={phone}
                inputMode="numeric"
                onChange={(e) => setPhone(e.target.value)}
                className="tabular-nums"
              />
            </FormField>
          </div>
          <FormField label="프로그램" htmlFor="waitlist-edit-program">
            <select
              id="waitlist-edit-program"
              className={nativeSelect}
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
            >
              <option value="">선택 안 함</option>
              {branch?.programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </FormField>
          <div className="grid grid-cols-2 gap-x3">
            <FormField label="학년">
              <Segmented
                aria-label="학년"
                value={gradeType}
                onChange={(v) => setGradeType(v)}
                options={[
                  { value: "REPEAT", label: "N수생" },
                  { value: "ENROLLED", label: "재학생" },
                ]}
              />
            </FormField>
            <FormField label="성별">
              <Segmented
                aria-label="성별"
                value={gender}
                onChange={(v) => setGender(v)}
                options={[
                  { value: "MALE", label: "남" },
                  { value: "FEMALE", label: "여" },
                ]}
              />
            </FormField>
          </div>
          <FormField label="메모·요청" htmlFor="waitlist-edit-note">
            <Textarea
              id="waitlist-edit-note"
              className="resize-none"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            닫기
          </Button>
          <Button onClick={() => onSave({ name, phone, programId: programId || null, gender, gradeType, note: note || null })}>
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CapacityBadge({
  capacity,
  enrolled,
  waiting,
}: {
  capacity: number | null;
  enrolled: number;
  waiting: number;
}) {
  const remaining = capacity != null ? capacity - enrolled : null;
  const full = remaining != null && remaining <= 0;
  return (
    <span className="t3-regular tabular-nums text-fg-neutral-subtle">
      등원 <span className={cn("t3-bold", full ? "text-fg-critical" : "text-fg-neutral")}>{enrolled}</span>
      {capacity != null && <span> / 정원 {capacity}</span>}
      {remaining != null && (
        <span className={full ? "text-fg-critical" : "text-fg-positive"}> (잔여 {Math.max(0, remaining)})</span>
      )}
      <span className="text-fg-placeholder"> · </span>대기 {waiting}
    </span>
  );
}

function BranchesTab({
  branches,
  entries,
  students,
  run,
  pending,
}: {
  branches: Branch[];
  entries: Entry[];
  students: StudentLite[];
  run: (a: () => Promise<{ ok: boolean; error?: string }>) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [programInputs, setProgramInputs] = useState<Record<string, string>>({});
  const [enrolling, setEnrolling] = useState<Program | null>(null);

  const capOrNull = (v: string): number | null => {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  return (
    <div className="flex flex-col gap-x6">
      <Section title="지점 추가" description="slug 는 공개 신청 링크 주소에 쓰여요. 영문 소문자로 적어 주세요.">
        <form
          className="grid grid-cols-1 items-end gap-x3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          onSubmit={(ev) => {
            ev.preventDefault();
            run(() => createBranch({ name, slug }));
            setName("");
            setSlug("");
          }}
        >
          <FormField label="지점명" htmlFor="waitlist-branch-name">
            <Input id="waitlist-branch-name" placeholder="예: 동탄점" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="slug" htmlFor="waitlist-branch-slug">
            <Input id="waitlist-branch-slug" placeholder="예: dongtan" value={slug} onChange={(e) => setSlug(e.target.value)} />
          </FormField>
          <Button type="submit" disabled={pending}>
            <Plus />
            지점 추가
          </Button>
        </form>
      </Section>

      {branches.length === 0 && (
        <div className="rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default">
          <EmptyState compact icon={Building2} title="아직 등록된 지점이 없어요" description="위에서 첫 지점을 추가해 보세요." />
        </div>
      )}

      {branches.map((b) => (
        <Section
          key={b.id}
          title={
            <>
              {b.name}
              <span className="t4-regular text-fg-neutral-subtle">/{b.slug}</span>
              {!b.isActive && <StatusBadge tone="gray">비활성</StatusBadge>}
            </>
          }
          actions={
            <>
              <Select
                value={b.waitStatus}
                onValueChange={(v) => run(() => updateBranch(b.id, { waitStatus: v as BranchWaitStatus }))}
              >
                <SelectTrigger className="h-9 w-32" aria-label={`${b.name} 모집 상태`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(WAIT_STATUS_LABEL).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Switch
                size="24"
                label="활성"
                checked={b.isActive}
                disabled={pending}
                onCheckedChange={() => run(() => updateBranch(b.id, { isActive: !b.isActive }))}
              />
            </>
          }
        >
          <div className="flex flex-col gap-x5">
            {/* 지점 총정원 + 집계 */}
            <div className="flex flex-wrap items-end gap-x4">
              <FormField label="지점 총정원" htmlFor={`waitlist-branch-cap-${b.id}`}>
                <Input
                  id={`waitlist-branch-cap-${b.id}`}
                  type="number"
                  min={0}
                  className="w-28 tabular-nums"
                  defaultValue={b.capacity ?? ""}
                  placeholder="미설정"
                  onBlur={(ev) => {
                    const next = capOrNull(ev.target.value);
                    if (next !== b.capacity) run(() => updateBranch(b.id, { capacity: next }));
                  }}
                />
              </FormField>
              <div className="pb-x2_5">
                <CapacityBadge capacity={b.capacity} enrolled={b.enrolled} waiting={b.waiting} />
              </div>
            </div>

            {/* 안내문 */}
            <FormField label="공개 안내문" htmlFor={`waitlist-branch-notice-${b.id}`} hint="입력칸에서 벗어나면 바로 저장돼요.">
              <Textarea
                id={`waitlist-branch-notice-${b.id}`}
                className="resize-none"
                rows={2}
                defaultValue={b.notice ?? ""}
                placeholder="예: 현재 정원이 차서 대기 등록만 가능해요."
                onBlur={(ev) => {
                  if (ev.target.value !== (b.notice ?? "")) run(() => updateBranch(b.id, { notice: ev.target.value }));
                }}
              />
            </FormField>

            {/* 프로그램 */}
            <div className="flex flex-col gap-x2">
              <p className="t4-medium text-fg-neutral">프로그램 · 정원</p>
              <ul className="divide-y divide-stroke-neutral-muted overflow-hidden rounded-r3 border border-stroke-neutral-muted">
                {b.programs.length === 0 && (
                  <li className="px-x4 py-x4 text-center t4-regular text-fg-neutral-subtle">등록된 프로그램이 없어요</li>
                )}
                {b.programs.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-x4 gap-y-x2 px-x4 py-x3">
                    <div className="flex min-w-40 items-center gap-x2_5">
                      <Switch
                        size="16"
                        checked={p.isActive}
                        disabled={pending}
                        onCheckedChange={() => run(() => toggleProgram(p.id, !p.isActive))}
                        inputProps={{ "aria-label": `${p.name} ${p.isActive ? "비활성화" : "활성화"}` }}
                      />
                      <span className={cn("t4-medium", p.isActive ? "text-fg-neutral" : "text-fg-neutral-subtle line-through")}>
                        {p.name}
                      </span>
                    </div>
                    <label className="flex items-center gap-x2 t3-medium text-fg-neutral-subtle">
                      정원
                      <Input
                        type="number"
                        min={0}
                        className="h-9 w-20 tabular-nums"
                        defaultValue={p.capacity ?? ""}
                        placeholder="미설정"
                        onBlur={(ev) => {
                          const next = capOrNull(ev.target.value);
                          if (next !== p.capacity) run(() => updateProgram(p.id, { capacity: next }));
                        }}
                      />
                    </label>
                    <CapacityBadge capacity={p.capacity} enrolled={p.enrolled} waiting={p.waiting} />
                    <Button variant="secondary" size="xs" className="ml-auto" disabled={pending} onClick={() => setEnrolling(p)}>
                      <UserPlus />
                      기존 원생 등록
                    </Button>
                  </li>
                ))}
              </ul>
              <form
                className="flex gap-x2"
                onSubmit={(ev) => {
                  ev.preventDefault();
                  const v = programInputs[b.id] ?? "";
                  if (!v.trim()) return;
                  run(() => createProgram(b.id, v));
                  setProgramInputs((prev) => ({ ...prev, [b.id]: "" }));
                }}
              >
                <Input
                  className="min-w-0 flex-1"
                  placeholder="프로그램명 추가"
                  aria-label={`${b.name} 프로그램명`}
                  value={programInputs[b.id] ?? ""}
                  onChange={(e) => setProgramInputs((prev) => ({ ...prev, [b.id]: e.target.value }))}
                />
                <Button type="submit" variant="ink" disabled={pending}>
                  <Plus />
                  추가
                </Button>
              </form>
            </div>
          </div>
        </Section>
      ))}

      {enrolling && (
        <BulkEnrollModal
          program={enrolling}
          students={students}
          entries={entries}
          onClose={() => setEnrolling(null)}
        />
      )}
    </div>
  );
}

/** 기존 ACTIVE 원생을 프로그램 참여자로 일괄 등록. 이미 참여/신청한 학생 표시. */
function BulkEnrollModal({
  program,
  students,
  entries,
  onClose,
}: {
  program: Program;
  students: StudentLite[];
  entries: Entry[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // 이미 이 프로그램 참여자(ENROLLED + studentId)
  const participantIds = new Set(
    entries.filter((e) => e.programId === program.id && e.status === "ENROLLED" && e.studentId).map((e) => e.studentId)
  );
  // 이미 신청/매칭된 학생 (중복 인지용)
  const appliedIds = new Set(entries.map((e) => e.matchedStudent?.id).filter(Boolean));

  const candidates = students
    .filter((s) => !participantIds.has(s.id))
    .filter((s) => {
      const q = query.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.grade.toLowerCase().includes(q);
    });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    if (selected.size === 0) return;
    setSaving(true);
    const res = await bulkEnrollStudents(program.id, [...selected]);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`${res.data?.added ?? 0}명 등록 (중복 ${res.data?.skipped ?? 0}명 제외)`);
    router.refresh();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-md flex-col">
        <DialogHeader>
          <DialogTitle>기존 원생 등록 — {program.name}</DialogTitle>
          <DialogDescription>
            재원생을 이 프로그램 참여자로 추가해요. 이미 참여 중인 학생은 목록에서 빠져 있어요.
          </DialogDescription>
        </DialogHeader>
        <SearchField
          placeholder="이름·학년 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:w-full"
          aria-label="재원생 검색"
        />
        <div className="min-h-0 flex-1 divide-y divide-stroke-neutral-muted overflow-y-auto rounded-r3 border border-stroke-neutral-muted">
          {candidates.length === 0 ? (
            <p className="px-x4 py-x6 text-center t4-regular text-fg-neutral-subtle">추가할 수 있는 재원생이 없어요</p>
          ) : (
            candidates.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-x3 px-x4 py-x2_5 transition-colors hover:bg-bg-layer-default-pressed"
              >
                <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} />
                <span className="t4-medium text-fg-neutral">{s.name}</span>
                <span className="t3-regular text-fg-neutral-subtle">{s.grade}</span>
                {appliedIds.has(s.id) && (
                  <StatusBadge tone="info" className="ml-auto">신청함</StatusBadge>
                )}
              </label>
            ))
          )}
        </div>
        <DialogFooter className="sm:items-center sm:justify-between">
          <span className="t3-regular tabular-nums text-fg-neutral-subtle">{selected.size}명 선택</span>
          <div className="flex flex-col-reverse gap-x2 sm:flex-row">
            <Button variant="secondary" onClick={onClose}>
              닫기
            </Button>
            <Button onClick={save} disabled={saving || selected.size === 0}>
              {saving ? "등록 중…" : "참여자 등록"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

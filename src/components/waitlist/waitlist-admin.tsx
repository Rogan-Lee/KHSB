"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useStickyState } from "@/hooks/use-sticky-state";
import { useSortableTable } from "@/hooks/use-sortable-table";
import { useRouter } from "next/navigation";
import type {
  BranchWaitStatus,
  WaitGender,
  WaitGradeType,
  WaitlistStatus,
} from "@/generated/prisma/enums";
import { toast } from "sonner";
import { applyLinkOrigin } from "@/lib/apply-domain";
import { contactPhonesForDisplay } from "@/lib/waitlist-contact";
import { winterGradeLabel } from "@/lib/waitlist-winter";
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
import { formatDateTime, matchesSearch, timeAgo, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, inputBaseClass } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableHeader } from "@/components/ui/sortable-header";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
  DescriptionList,
  EmptyState,
  FilterChip,
  FormField,
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
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Phone,
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
type Kind = "WAITLIST" | "INQUIRY";
type Entry = {
  id: string;
  name: string;
  school: string | null;
  grade: string | null;
  phone: string; // 작성자가 인증한 번호
  parentPhone: string | null;
  studentPhone: string | null;
  branchId: string;
  branchName: string;
  programId: string | null;
  programName: string | null;
  gender: WaitGender | null;
  gradeType: WaitGradeType | null;
  kind: Kind;
  entryPreference: string | null; // "winter" | "immediate" | null
  winterGrade: string | null; // 윈터 시즌 예비 학년 — "pre_high1" | "pre_high2" | "pre_high3"
  referrerName: string | null; // 추천인(지인 이름)
  phoneVerifiedAt: string | null;
  status: WaitlistStatus;
  studentId: string | null;
  matchedStudent: StudentLite | null;
  note: string | null;
  cancelReason: string | null;
  guideToken: string | null;
  guideContent: string | null;
  createdAt: string;
  invitedAt: string | null;
  enrolledAt: string | null;
  cancelledAt: string | null;
  // 같은 전화번호로 잡힌 신규 상담 면담 (at = 실제 일시, 없으면 예정 일시)
  consultations: { id: string; at: string | null; status: string }[];
};

const WAIT_STATUS_LABEL: Record<BranchWaitStatus, string> = {
  WAITLIST_OPEN: "대기 등록",
  ALMOST_FULL: "마감 임박",
  IMMEDIATE: "바로 등원",
  CLOSED: "마감",
};
// 문의는 줄을 서지 않으니 같은 상태라도 말을 달리한다 — 취소(CANCELLED)는 "응대 끝"
const STATUS_LABEL: Record<Kind, Record<WaitlistStatus, string>> = {
  WAITLIST: { WAITING: "대기", INVITED: "안내함", ENROLLED: "등원", CANCELLED: "취소" },
  INQUIRY: { WAITING: "응대 중", INVITED: "안내함", ENROLLED: "등원", CANCELLED: "응대 끝" },
};
const STATUS_TONE: Record<WaitlistStatus, Tone> = {
  WAITING: "info",
  INVITED: "warn",
  ENROLLED: "ok",
  CANCELLED: "gray",
};
const CONSULT_LABEL: Record<string, string> = { SCHEDULED: "면담 예정", COMPLETED: "면담 완료", CANCELLED: "면담 취소" };

const gradeTypeLabel = (e: Entry) => (e.gradeType ? (e.gradeType === "REPEAT" ? "N수생" : "재학생") : null);
const genderLabel = (e: Entry) => (e.gender ? (e.gender === "MALE" ? "남" : "여") : null);
// 숫자만 저장된 번호를 010-1234-5678 로
const dashed = (phone: string) => phone.replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3");
const schoolLine = (e: Entry) => [e.school, e.grade].filter(Boolean).join(" ");

// 네이티브 select 를 SEED TextInput 규격으로
const nativeSelect = cn("h-10 border-0 pr-x2", inputBaseClass);

type View = "INQUIRY" | "WAITLIST" | "branches";
type Run = (a: () => Promise<{ ok: boolean; error?: string }>) => void;

export function WaitlistAdmin({
  seenSince,
  now,
  branches,
  entries,
  students,
}: {
  seenSince: string; // 이 직원이 직전에 화면을 연 시각 — 그 뒤에 들어온 건이 "새"
  now: string; // 서버 시각 — "3일 전" 표시를 서버·브라우저가 같게
  branches: Branch[];
  entries: Entry[];
  students: StudentLite[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [view, setView] = useStickyState<View>("waitlist:view", "INQUIRY");
  // 처리 뒤 새로고침(router.refresh)되면 seenSince 가 방금 시각으로 바뀌므로, 처음 연 때 값을 붙잡아 둔다
  const [since] = useState(seenSince);
  const isNew = (e: Entry) => e.createdAt > since;

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) toast.error(res.error ?? "처리에 실패했습니다");
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

  const inquiries = entries.filter((e) => e.kind === "INQUIRY");
  const waitlist = entries.filter((e) => e.kind === "WAITLIST");
  const openInquiries = inquiries.filter((e) => e.status === "WAITING").length;
  const waiting = waitlist.filter((e) => e.status === "WAITING").length;
  const enrolled = entries.filter((e) => e.status === "ENROLLED").length;
  const newInquiries = inquiries.filter(isNew).length;
  const newWaitlist = waitlist.filter(isNew).length;

  const tabCount = (n: number, active: boolean, hasNew: boolean) => (
    <span className={cn("inline-flex items-center gap-x1 t4-bold tabular-nums", active ? "text-fg-brand" : "text-fg-placeholder")}>
      {n}
      {hasNew && <span className="size-1.5 rounded-full bg-bg-brand-solid" aria-label="새 건 있음" />}
    </span>
  );

  return (
    <div className="flex flex-col gap-x6">
      <StatCards cols={4}>
        <StatCard label="새로 들어옴" value={newInquiries + newWaitlist} unit="건" sub="지난번에 본 뒤로" />
        <StatCard label="응대 중인 문의" value={openInquiries} unit="건" />
        <StatCard label="대기 중" value={waiting} unit="명" />
        <StatCard label="등원 확정" value={enrolled} unit="명" />
      </StatCards>

      <Tabs value={view} onValueChange={(v) => setView(v as View)}>
        <TabsList size="lg">
          <TabsTrigger value="INQUIRY">
            문의
            {tabCount(openInquiries, view === "INQUIRY", newInquiries > 0)}
          </TabsTrigger>
          <TabsTrigger value="WAITLIST">
            대기 신청
            {tabCount(waiting, view === "WAITLIST", newWaitlist > 0)}
          </TabsTrigger>
          <TabsTrigger value="branches">
            지점·프로그램
            {tabCount(branches.length, view === "branches", false)}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="INQUIRY">
          <EntriesTab kind="INQUIRY" entries={inquiries} branches={branches} positionOf={positionOf} isNew={isNew} now={now} run={run} pending={pending} />
        </TabsContent>
        <TabsContent value="WAITLIST">
          <EntriesTab kind="WAITLIST" entries={waitlist} branches={branches} positionOf={positionOf} isNew={isNew} now={now} run={run} pending={pending} />
        </TabsContent>
        <TabsContent value="branches">
          <BranchesTab branches={branches} entries={entries} students={students} run={run} pending={pending} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** 머리글 버튼 — 대기 신청 유도 메시지 + /apply 링크 공유 (저장 없음, 작성→복사). */
export function ShareApplyButton() {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  // SSR 과 첫 렌더를 맞추려고 마운트 뒤에 origin 을 읽는다 (기존 동작 유지)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOrigin(window.location.origin), []);
  const link = `${applyLinkOrigin(origin)}/apply`;
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
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Link2 />
        신청 링크 공유
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>대기 신청 링크 공유</DialogTitle>
            <DialogDescription>안내 메시지와 함께 카톡·문자로 보내세요.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-x4">
            <FormField label="신청 링크" htmlFor="waitlist-apply-link">
              <div className="flex gap-x2">
                <Input id="waitlist-apply-link" readOnly value={link} className="min-w-0 flex-1" />
                <Button variant="secondary" onClick={() => copy(link, "신청 링크가 복사되었습니다")}>
                  링크만 복사
                </Button>
              </div>
            </FormField>
            <FormField label="안내 메시지" htmlFor="waitlist-apply-msg" hint="복사하면 메시지 아래에 링크가 붙어요.">
              <Textarea
                id="waitlist-apply-msg"
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                rows={4}
                className="resize-none"
                placeholder="유도 안내 메시지"
              />
            </FormField>
          </div>
          <DialogFooter>
            <Button onClick={() => copy(`${msg}\n${link}`, "안내 메시지 + 링크가 복사되었습니다")}>
              <Copy />
              메시지 + 링크 복사
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type EntryFilter = WaitlistStatus | "OPEN" | "ALL" | "WINTER" | "IMMEDIATE";
const FILTERS: Record<Kind, { key: EntryFilter; label: string }[]> = {
  WAITLIST: [
    { key: "WAITING", label: "대기" },
    { key: "INVITED", label: "안내함" },
    { key: "ENROLLED", label: "등원" },
    { key: "CANCELLED", label: "취소" },
    { key: "WINTER", label: "윈터 희망" },
    { key: "IMMEDIATE", label: "즉시 희망" },
    { key: "ALL", label: "전체" },
  ],
  INQUIRY: [
    { key: "OPEN", label: "응대 중" },
    { key: "ENROLLED", label: "등원" },
    { key: "CANCELLED", label: "응대 끝" },
    { key: "ALL", label: "전체" },
  ],
};

function matchesFilter(e: Entry, f: EntryFilter): boolean {
  if (f === "ALL") return true;
  if (f === "OPEN") return e.status === "WAITING" || e.status === "INVITED";
  if (f === "WINTER") return e.entryPreference === "winter";
  if (f === "IMMEDIATE") return e.entryPreference === "immediate";
  return e.status === f;
}

function matchesEntry(e: Entry, q: string): boolean {
  return (
    matchesSearch(q, e.name, e.school, e.grade, e.referrerName, e.note, e.cancelReason, e.programName, e.matchedStudent?.name) ||
    // 전화번호는 숫자만 저장 — 010-1234 처럼 쳐도 찾게 하이픈을 뺀다
    matchesSearch(q.replace(/-/g, ""), e.phone, e.parentPhone, e.studentPhone)
  );
}

/** 입실 희망 뱃지 — winter/immediate 외 값(과거 데이터)은 미표시. 윈터는 예비 학년을 함께 표시 */
function EntryPreferenceBadge({ value, winterGrade }: { value: string | null; winterGrade: string | null }) {
  if (value !== "winter" && value !== "immediate") return <span className="text-fg-placeholder">—</span>;
  if (value === "immediate") return <StatusBadge tone="ok">즉시</StatusBadge>;
  const grade = winterGradeLabel(winterGrade);
  return (
    <div className="flex flex-wrap items-center gap-x1">
      <StatusBadge tone="info">윈터</StatusBadge>
      {grade && <span className="whitespace-nowrap t3-regular text-fg-neutral-muted">{grade}</span>}
    </div>
  );
}

/** 신청 시각 — "3일 전" + 날짜. 응대 중인 문의가 하루 넘게 묵으면 주황 */
function Received({ e, now, className }: { e: Entry; now: string; className?: string }) {
  const stale = e.kind === "INQUIRY" && e.status === "WAITING" && Date.parse(now) - Date.parse(e.createdAt) > 86_400_000;
  return (
    <span className={cn("whitespace-nowrap", className)} title={formatDateTime(e.createdAt)}>
      <span className={cn("t4-medium", stale ? "text-fg-warning" : "text-fg-neutral")}>{timeAgo(e.createdAt, now)}</span>
    </span>
  );
}

function EntriesTab({
  kind,
  entries,
  branches,
  positionOf,
  isNew,
  now,
  run,
  pending,
}: {
  kind: Kind;
  entries: Entry[];
  branches: Branch[];
  positionOf: (e: Entry) => number;
  isNew: (e: Entry) => boolean;
  now: string;
  run: Run;
  pending: boolean;
}) {
  const isInquiry = kind === "INQUIRY";
  const filters = FILTERS[kind];
  const [filter, setFilter] = useStickyState<EntryFilter>(`waitlist:filter:${kind}`, filters[0].key);
  const [query, setQuery] = useStickyState(`waitlist:q:${kind}`, "");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [guiding, setGuiding] = useState<Entry | null>(null);
  const [consulting, setConsulting] = useState<Entry | null>(null);
  const { prompt, dialog } = useConfirmDialog();

  // 검색은 칩 숫자에도 반영 — 찾는 사람이 어느 칩에 있는지 바로 보이게
  const searched = entries.filter((e) => matchesEntry(e, query));
  const countOf = (k: EntryFilter) => searched.filter((e) => matchesFilter(e, k)).length;
  // 기본은 최신순(서버가 내려 준 순서), 머리글을 누르면 그 열로 정렬
  const { rows: shown, sort, toggle } = useSortableTable(
    searched.filter((e) => matchesFilter(e, filter)),
    {
      position: (e) => positionOf(e) || null,
      name: (e) => e.name,
      createdAt: (e) => e.createdAt,
    }
  );
  const open = entries.find((e) => e.id === openId) ?? null;
  const showBranch = branches.length > 1;
  const showProgram = !isInquiry && entries.some((e) => e.programName);

  async function handleClose(e: Entry) {
    // 사유(결과)는 확인 다이얼로그에서 한 줄로 받는다 (비워도 됨).
    const reason = await prompt(
      isInquiry
        ? {
            title: `${e.name} 님 문의를 응대 끝으로 둘까요?`,
            description: "‘응대 끝’ 칩에서 다시 열 수 있어요.",
            label: "결과",
            placeholder: "예: 비용 안내함, 다음 달 다시 연락",
            confirmLabel: "응대 끝",
            cancelLabel: "닫기",
          }
        : {
            title: `${e.name} 님의 대기를 취소할까요?`,
            description: "취소해도 목록의 ‘취소’ 칩에서 다시 대기로 되돌릴 수 있어요.",
            label: "취소 사유",
            placeholder: "예: 타 독서실 등록",
            confirmLabel: "대기 취소",
            cancelLabel: "닫기",
            destructive: true,
          }
    );
    if (reason === null) return; // 취소 안 함
    run(() => cancelWaitlist(e.id, reason));
  }

  async function copyGuideLink(e: Entry) {
    if (!e.guideToken) return;
    const url = `${applyLinkOrigin(window.location.origin)}/apply/guide/${e.guideToken}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("안내 링크가 복사되었습니다");
    } catch {
      toast.error("복사 실패 — 브라우저 권한을 확인하세요");
    }
  }

  const actions: EntryActions = {
    enroll: (e) => run(() => setWaitlistStatus(e.id, "ENROLLED")),
    reopen: (e) => run(() => setWaitlistStatus(e.id, "WAITING")),
    close: handleClose,
    edit: setEditing,
    guide: setGuiding,
    copyGuide: copyGuideLink,
    consult: setConsulting,
  };

  const activeLabel = filters.find((f) => f.key === filter)?.label ?? "";
  const noun = isInquiry ? "문의" : "대기 신청";

  return (
    <div>
      <Toolbar>
        <SearchField
          value={query}
          onChange={(ev) => setQuery(ev.target.value)}
          onClear={() => setQuery("")}
          placeholder="이름·전화번호·학교·내용 검색"
          aria-label={`${noun} 검색`}
          enterKeyHint="search"
          autoComplete="off"
        />
        <div className="flex flex-wrap gap-x2">
          {filters.map((f) => (
            <FilterChip key={f.key} selected={filter === f.key} count={countOf(f.key)} onClick={() => setFilter(f.key)}>
              {f.label}
            </FilterChip>
          ))}
        </div>
      </Toolbar>

      <TableCard>
        {shown.length === 0 ? (
          <EmptyState
            compact
            icon={ClipboardList}
            title={
              query
                ? `‘${query}’에 맞는 ${noun}이 없어요`
                : filter === "ALL"
                  ? `아직 ${noun}이 없어요`
                  : `‘${activeLabel}’ ${noun}이 없어요`
            }
            description={query ? "검색어를 바꾸거나 다른 칩을 눌러 보세요." : "다른 칩을 눌러 확인해 보세요."}
          />
        ) : (
          <>
            {/* 휴대폰: 카드 목록 — 누르면 상세 */}
            <ul className="divide-y divide-stroke-neutral-muted md:hidden">
              {shown.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(e.id)}
                    className="flex min-h-11 w-full flex-col gap-x1 px-x4 py-x3 text-left transition-colors hover:bg-bg-layer-default-pressed"
                  >
                    <div className="flex items-center gap-x1_5">
                      <EntryName e={e} isNew={isNew(e)} />
                      <span className="ml-auto shrink-0">
                        <StatusBadge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[kind][e.status]}</StatusBadge>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x1_5 t3-regular text-fg-neutral-subtle">
                      <Received e={e} now={now} className="t3-regular" />
                      {!isInquiry && positionOf(e) > 0 && <span>· 순번 {positionOf(e)}</span>}
                      {schoolLine(e) && <span>· {schoolLine(e)}</span>}
                      {!isInquiry && gradeTypeLabel(e) && <span>· {gradeTypeLabel(e)}</span>}
                    </div>
                    {e.note && <p className="line-clamp-2 t3-regular text-fg-neutral-muted">{e.note}</p>}
                  </button>
                </li>
              ))}
            </ul>

            {/* 데스크톱: 표 — 줄을 누르면 상세 */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    {!isInquiry && (
                      <SortableHeader sortKey="position" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle} align="right" className="w-16">
                        순번
                      </SortableHeader>
                    )}
                    <SortableHeader sortKey="name" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle}>
                      이름
                    </SortableHeader>
                    <TableHead>연락처</TableHead>
                    {isInquiry && <TableHead>문의 내용</TableHead>}
                    {showBranch && <TableHead>지점</TableHead>}
                    {!isInquiry && <TableHead>학년·성별</TableHead>}
                    {!isInquiry && <TableHead>입실 희망</TableHead>}
                    {showProgram && <TableHead>프로그램</TableHead>}
                    <SortableHeader sortKey="createdAt" activeKey={sort?.key} dir={sort?.dir} onToggle={toggle}>
                      신청
                    </SortableHeader>
                    <TableHead>상태</TableHead>
                    <TableHead className="text-right">처리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((e) => (
                    <TableRow key={e.id} onClick={() => setOpenId(e.id)} className="cursor-pointer">
                      {!isInquiry && (
                        <TableCell className="text-right t4-bold text-fg-brand">
                          {positionOf(e) || <span className="t4-regular text-fg-placeholder">—</span>}
                        </TableCell>
                      )}
                      <TableCell className="max-w-72">
                        <EntryName e={e} isNew={isNew(e)} />
                        {(schoolLine(e) || e.referrerName) && (
                          <p className="mt-x0_5 t3-regular text-fg-neutral-subtle">
                            {[schoolLine(e), e.referrerName && `추천인 ${e.referrerName}`].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        {!isInquiry && e.note && (
                          <p className="mt-x0_5 truncate t3-regular text-fg-neutral-muted" title={e.note}>
                            {e.note}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <ContactPhones e={e} />
                      </TableCell>
                      {isInquiry && (
                        <TableCell className="min-w-56 max-w-96">
                          <p className="line-clamp-2 t4-regular text-fg-neutral-muted">{e.note ?? "—"}</p>
                        </TableCell>
                      )}
                      {showBranch && <TableCell className="whitespace-nowrap">{e.branchName}</TableCell>}
                      {!isInquiry && (
                        <TableCell className="whitespace-nowrap text-fg-neutral-muted">
                          {gradeTypeLabel(e) ?? "-"} · {genderLabel(e) ?? "-"}
                        </TableCell>
                      )}
                      {!isInquiry && (
                        <TableCell>
                          <EntryPreferenceBadge value={e.entryPreference} winterGrade={e.winterGrade} />
                        </TableCell>
                      )}
                      {showProgram && <TableCell className="text-fg-neutral-muted">{e.programName ?? "—"}</TableCell>}
                      <TableCell>
                        <Received e={e} now={now} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[kind][e.status]}</StatusBadge>
                        {e.status === "CANCELLED" && e.cancelReason && (
                          <p className="mt-x1 max-w-40 truncate t2-regular text-fg-neutral-subtle" title={e.cancelReason}>
                            {e.cancelReason}
                          </p>
                        )}
                      </TableCell>
                      <TableCell onClick={(ev) => ev.stopPropagation()}>
                        <RowActions e={e} kind={kind} actions={actions} pending={pending} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </TableCard>

      {open && (
        <EntrySheet
          e={open}
          kind={kind}
          position={positionOf(open)}
          isNew={isNew(open)}
          now={now}
          actions={actions}
          pending={pending}
          onClose={() => setOpenId(null)}
        />
      )}

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

type EntryActions = {
  enroll: (e: Entry) => void;
  reopen: (e: Entry) => void;
  close: (e: Entry) => void;
  edit: (e: Entry) => void;
  guide: (e: Entry) => void;
  copyGuide: (e: Entry) => void;
  consult: (e: Entry) => void;
};

function EntryName({ e, isNew }: { e: Entry; isNew: boolean }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x1">
      <span className="whitespace-nowrap t4-medium text-fg-neutral">{e.name}</span>
      {isNew && (
        <StatusBadge tone="brand" solid>
          새
        </StatusBadge>
      )}
      {e.matchedStudent && (
        <span title={`기존 원생: ${e.matchedStudent.name} (${e.matchedStudent.grade})`}>
          <StatusBadge tone="ok">기존 원생</StatusBadge>
        </span>
      )}
    </div>
  );
}

function ContactPhones({ e, call = false }: { e: Entry; call?: boolean }) {
  const rows = contactPhonesForDisplay(e);
  if (rows.length === 0) return <span className="text-fg-placeholder">—</span>;
  return (
    <div className={cn("flex flex-col", call ? "gap-x2" : "gap-x0_5")}>
      {rows.map((c) => (
        <div key={c.label} className="flex flex-wrap items-center gap-x1_5">
          <span className="whitespace-nowrap t3-regular text-fg-neutral-subtle">{c.label}</span>
          {call ? (
            // 휴대폰에서 누르면 바로 전화
            <a href={`tel:${c.phone}`} className="inline-flex min-h-11 items-center gap-x1 t4-medium tabular-nums text-fg-brand">
              <Phone className="size-4" aria-hidden />
              {dashed(c.phone)}
            </a>
          ) : (
            <span className="whitespace-nowrap tabular-nums text-fg-neutral-muted">{dashed(c.phone)}</span>
          )}
          {c.isApplicant && !e.phoneVerifiedAt && <StatusBadge tone="warn">미인증</StatusBadge>}
        </div>
      ))}
    </div>
  );
}

function RowActions({ e, kind, actions, pending }: { e: Entry; kind: Kind; actions: EntryActions; pending: boolean }) {
  return (
    <div className="flex items-center justify-end gap-x1">
      {e.status !== "ENROLLED" && (
        <Button variant="secondary" size="xs" disabled={pending} onClick={() => actions.enroll(e)}>
          <Check />
          등원확정
        </Button>
      )}
      {kind === "WAITLIST" && (
        <Button variant="ghost" size="xs" disabled={pending} onClick={() => actions.guide(e)}>
          <FileText />
          {e.guideToken ? "안내 수정" : "안내 작성"}
        </Button>
      )}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`${e.name} 더보기`} disabled={pending}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem onSelect={() => actions.edit(e)}>
            <Pencil />
            정보 수정
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => actions.consult(e)}>
            <CalendarPlus />
            면담 등록
          </DropdownMenuItem>
          {e.guideToken && (
            <DropdownMenuItem onSelect={() => actions.copyGuide(e)}>
              <Link2 />
              안내 링크 복사
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {e.status === "CANCELLED" ? (
            <DropdownMenuItem onSelect={() => actions.reopen(e)}>
              <Undo2 />
              {kind === "INQUIRY" ? "다시 열기" : "대기복귀"}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem className={kind === "WAITLIST" ? "text-fg-critical" : undefined} onSelect={() => actions.close(e)}>
              <XCircle />
              {kind === "INQUIRY" ? "응대 끝" : "대기 취소"}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** 상세 — 신청 원문·연락처(누르면 전화)·진행 기록·처리 버튼. 휴대폰에선 이 화면에서 모든 처리를 한다 */
function EntrySheet({
  e,
  kind,
  position,
  isNew,
  now,
  actions,
  pending,
  onClose,
}: {
  e: Entry;
  kind: Kind;
  position: number;
  isNew: boolean;
  now: string;
  actions: EntryActions;
  pending: boolean;
  onClose: () => void;
}) {
  const isInquiry = kind === "INQUIRY";
  // 상태 시각은 마지막 값만 남는다 — 지금 상태와 맞는 것만 보여 준다(되돌린 뒤의 옛 시각은 숨김)
  const timeline = [
    { at: e.createdAt, label: isInquiry ? "문의 접수" : "대기 신청", detail: null as string | null },
    ...e.consultations.map((c) => ({ at: c.at, label: CONSULT_LABEL[c.status] ?? "면담", detail: null })),
    ...(e.invitedAt ? [{ at: e.invitedAt, label: "등록 안내 보냄", detail: null }] : []),
    ...(e.status === "ENROLLED" && e.enrolledAt ? [{ at: e.enrolledAt, label: "등원 확정", detail: null }] : []),
    ...(e.status === "CANCELLED" && e.cancelledAt
      ? [{ at: e.cancelledAt, label: isInquiry ? "응대 끝" : "대기 취소", detail: e.cancelReason }]
      : []),
  ].sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));

  const info: ({ label: string; value: ReactNode } | null)[] = [
    !isInquiry && position > 0 ? { label: "대기 순번", value: `${position}번` } : null,
    !isInquiry ? { label: "학년·성별", value: [gradeTypeLabel(e), genderLabel(e)].filter(Boolean).join(" · ") || null } : null,
    !isInquiry ? { label: "입실 희망", value: <EntryPreferenceBadge value={e.entryPreference} winterGrade={e.winterGrade} /> } : null,
    e.programName ? { label: "프로그램", value: e.programName } : null,
    { label: "지점", value: e.branchName },
    e.referrerName ? { label: "추천인", value: e.referrerName } : null,
    e.matchedStudent ? { label: "기존 원생", value: `${e.matchedStudent.name} (${e.matchedStudent.grade})` } : null,
  ];

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="shrink-0 border-b border-stroke-neutral-muted px-x6 pb-x5 pt-x6 pr-x14">
          <div className="flex flex-wrap items-center gap-x1">
            <StatusBadge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[kind][e.status]}</StatusBadge>
            {isNew && (
              <StatusBadge tone="brand" solid>
                새
              </StatusBadge>
            )}
          </div>
          <SheetTitle className="mt-x2">
            {e.name}
            {schoolLine(e) && <span className="ml-x2 t5-regular text-fg-neutral-subtle">{schoolLine(e)}</span>}
          </SheetTitle>
          <SheetDescription className="tabular-nums">
            {timeAgo(e.createdAt, now)} {isInquiry ? "문의" : "신청"} · {formatDateTime(e.createdAt)}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-x6 overflow-y-auto px-x6 py-x5">
          <section className="flex flex-col gap-x2">
            <h3 className="t4-bold text-fg-neutral">{isInquiry ? "문의 내용" : "요청 사항"}</h3>
            {e.note ? (
              <p className="whitespace-pre-wrap break-words rounded-r3 bg-bg-neutral-weak p-x4 t4-regular text-fg-neutral">{e.note}</p>
            ) : (
              <p className="t4-regular text-fg-placeholder">남긴 내용이 없어요</p>
            )}
          </section>

          <section className="flex flex-col gap-x2">
            <h3 className="t4-bold text-fg-neutral">연락처</h3>
            <ContactPhones e={e} call />
          </section>

          <DescriptionList items={info.filter((x) => x != null)} />

          <section className="flex flex-col gap-x2">
            <h3 className="t4-bold text-fg-neutral">진행</h3>
            <ol className="flex flex-col gap-x3 border-l-2 border-stroke-neutral-muted pl-x4">
              {timeline.map((t, i) => (
                <li key={i} className="flex flex-col gap-x0_5">
                  <span className="t4-medium text-fg-neutral">{t.label}</span>
                  <span className="t3-regular tabular-nums text-fg-neutral-subtle">
                    {t.at ? formatDateTime(t.at) : "일시 미정"}
                  </span>
                  {t.detail && <span className="t3-regular text-fg-neutral-muted">{t.detail}</span>}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div
          className="flex shrink-0 flex-wrap items-center gap-x2 border-t border-stroke-neutral-muted px-x6 pt-x4"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
        >
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => actions.edit(e)}>
            <Pencil />
            정보 수정
          </Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => actions.consult(e)}>
            <CalendarPlus />
            면담 등록
          </Button>
          {!isInquiry && (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => actions.guide(e)}>
              <MessageSquareText />
              {e.guideToken ? "안내 수정" : "안내 작성"}
            </Button>
          )}
          <div className="ml-auto flex items-center gap-x2">
            {e.status === "CANCELLED" ? (
              <Button variant="secondary" disabled={pending} onClick={() => actions.reopen(e)}>
                <Undo2 />
                {isInquiry ? "다시 열기" : "대기복귀"}
              </Button>
            ) : (
              <Button variant="secondary" disabled={pending} onClick={() => actions.close(e)}>
                {isInquiry ? "응대 끝" : "대기 취소"}
              </Button>
            )}
            {e.status !== "ENROLLED" && (
              <Button disabled={pending} onClick={() => actions.enroll(e)}>
                <Check />
                등원 확정
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
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
      fd.set("prospectPhone", entry.parentPhone || entry.phone);
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
    const url = `${applyLinkOrigin(window.location.origin)}/apply/guide/${res.data!.token}`;
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
    parentPhone: string;
    studentPhone: string;
    programId: string | null;
    gender: WaitGender;
    gradeType: WaitGradeType;
    note: string | null;
  }) => void;
}) {
  const [name, setName] = useState(entry.name);
  const [parentPhone, setParentPhone] = useState(entry.parentPhone ?? "");
  const [studentPhone, setStudentPhone] = useState(entry.studentPhone ?? "");
  // 학부모/학생 구분 입력 이전 신청 — 기존 번호를 보여주고 어느 칸인지 채우게 한다
  const legacyPhone = !entry.parentPhone && !entry.studentPhone ? entry.phone : null;
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
          <FormField label="이름" htmlFor="waitlist-edit-name">
            <Input id="waitlist-edit-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-x3">
            <FormField label="학부모 휴대폰" htmlFor="waitlist-edit-parent-phone">
              <Input
                id="waitlist-edit-parent-phone"
                value={parentPhone}
                inputMode="numeric"
                onChange={(e) => setParentPhone(e.target.value)}
                className="tabular-nums"
              />
            </FormField>
            <FormField label="학생 휴대폰" htmlFor="waitlist-edit-student-phone">
              <Input
                id="waitlist-edit-student-phone"
                value={studentPhone}
                inputMode="numeric"
                onChange={(e) => setStudentPhone(e.target.value)}
                className="tabular-nums"
              />
            </FormField>
          </div>
          {legacyPhone && (
            <p className="-mt-x2 t3-regular text-fg-neutral-subtle">
              접수 번호 <span className="tabular-nums">{legacyPhone}</span> — 학부모/학생 구분 없이 받은 신청이에요.
            </p>
          )}
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
          <Button onClick={() => onSave({ name, parentPhone, studentPhone, programId: programId || null, gender, gradeType, note: note || null })}>
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

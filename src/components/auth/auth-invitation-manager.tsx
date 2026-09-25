"use client";

import {
  Copy,
  Inbox,
  KeyRound,
  Mail,
  RefreshCw,
  SearchX,
  UserRoundPlus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createAuthInvitationsBulk,
  createParentAuthInvitation,
  revokeAuthInvitation,
  sendPasswordResetForAccount,
} from "@/actions/auth-invitations";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import {
  EmptyState,
  FormField,
  PageHeader,
  SearchField,
  Section,
  StatusBadge,
  type Tone,
} from "@/components/backoffice/ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BulkInvitationResult } from "@/lib/auth-invitations";
import { cn } from "@/lib/utils";

type StaffOption = {
  email: string;
  id: string;
  name: string;
  role: string;
};

type StudentOption = {
  grade: string;
  id: string;
  isOnlineManaged: boolean;
  name: string;
};

type ParentStudentOption = {
  grade: string;
  id: string;
  name: string;
  parentPhone: string;
};

type InviteStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";

type InvitationRow = {
  expiresAt: string;
  id: string;
  name: string;
  status: InviteStatus;
  type: "STAFF" | "STUDENT" | "PARENT";
};

type AccountRow = {
  email: string;
  id: string;
  name: string;
  type: "STAFF" | "STUDENT" | "PARENT";
  username: string;
};

const STATUS_META: Record<InviteStatus, { tone: Tone; label: string }> = {
  ACCEPTED: { tone: "ok", label: "가입완료" },
  EXPIRED: { tone: "gray", label: "만료됨" },
  PENDING: { tone: "warn", label: "대기중" },
  REVOKED: { tone: "gray", label: "취소됨" },
};

const TYPE_META: Record<AccountRow["type"], { tone: Tone; label: string }> = {
  STAFF: { tone: "info", label: "직원" },
  STUDENT: { tone: "gray", label: "학생" },
  PARENT: { tone: "violet", label: "학부모" },
};

// 서버·브라우저 렌더 결과가 같도록 KST 고정
function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type PanelOption = {
  id: string;
  label: string;
};

export function AuthInvitationManager({
  accounts,
  invitations,
  parentStudents,
  staff,
  students,
}: {
  accounts: AccountRow[];
  invitations: InvitationRow[];
  parentStudents: ParentStudentOption[];
  staff: StaffOption[];
  students: StudentOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<BulkInvitationResult[]>([]);
  const [revokeTarget, setRevokeTarget] = useState<InvitationRow | null>(null);

  const staffOptions = useMemo<PanelOption[]>(
    () =>
      staff.map((user) => ({
        id: user.id,
        label: `${user.name} · ${user.role} · ${user.email}`,
      })),
    [staff],
  );

  const studentOptions = useMemo<PanelOption[]>(
    () =>
      students.map((student) => ({
        id: student.id,
        label: `${student.name} · ${student.grade}${
          student.isOnlineManaged ? " · 온라인 관리" : ""
        }`,
      })),
    [students],
  );

  const pendingCount = invitations.filter((i) => i.status === "PENDING").length;

  function issueBulk(type: "STAFF" | "STUDENT", ids: string[]) {
    if (ids.length === 0) {
      toast.error("초대할 대상을 선택하세요");
      return;
    }

    startTransition(async () => {
      try {
        const next =
          type === "STAFF"
            ? await createAuthInvitationsBulk({ type, targetUserIds: ids })
            : await createAuthInvitationsBulk({ type, targetStudentIds: ids });
        setResults(next);

        const ok = next.filter((row) => row.ok).length;
        const failed = next.length - ok;
        if (ok > 0) {
          toast.success(
            failed > 0
              ? `${ok}건 발급 · ${failed}건 실패`
              : `${ok}건의 초대 링크를 발급했습니다`,
          );
        } else {
          toast.error("초대 링크를 발급하지 못했습니다");
        }
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "초대 링크를 만들지 못했습니다",
        );
      }
    });
  }

  // 확인은 ConfirmDialog 에서 받는다
  function revoke(id: string) {
    startTransition(async () => {
      try {
        await revokeAuthInvitation(id);
        toast.success("초대를 취소했습니다");
        setRevokeTarget(null);
        router.refresh();
      } catch {
        toast.error("초대를 취소하지 못했습니다");
      }
    });
  }

  return (
    <>
      <PageHeader
        title="계정 초대"
        description="직원·학생·학부모의 자체 로그인 계정을 초대 링크로 발급해요."
      />

      <div className="flex flex-col gap-x6">
        {/* 초대 링크 발급 */}
        <Section
          title="초대 링크 발급"
          description="대상을 고르면 한 번에 초대 링크를 만들어요. 링크는 카톡·문자로 전달하세요."
        >
          <Tabs defaultValue="STAFF">
            <TabsList variant="segment" aria-label="초대 대상">
              <TabsTrigger value="STAFF">
                직원 <span className="tabular-nums text-fg-neutral-subtle">{staffOptions.length}</span>
              </TabsTrigger>
              <TabsTrigger value="STUDENT">
                학생 <span className="tabular-nums text-fg-neutral-subtle">{studentOptions.length}</span>
              </TabsTrigger>
              <TabsTrigger value="PARENT">학부모</TabsTrigger>
            </TabsList>
            <TabsContent value="STAFF" forceMount className="data-[state=inactive]:hidden">
              <BulkInvitePanel
                description="등록된 이메일·역할을 그대로 사용해요. 계정이 아직 없는 재직 직원만 보여요."
                emptyLabel="초대 가능한 직원이 없어요"
                icon={KeyRound}
                options={staffOptions}
                pending={isPending}
                onIssue={(ids) => issueBulk("STAFF", ids)}
              />
            </TabsContent>
            <TabsContent value="STUDENT" forceMount className="data-[state=inactive]:hidden">
              <BulkInvitePanel
                description="학생이 아이디와 복구 이메일을 직접 정해요. 계정이 아직 없는 재원생만 보여요."
                emptyLabel="초대 가능한 학생이 없어요"
                icon={UserRoundPlus}
                options={studentOptions}
                pending={isPending}
                onIssue={(ids) => issueBulk("STUDENT", ids)}
              />
            </TabsContent>
            <TabsContent value="PARENT" forceMount className="data-[state=inactive]:hidden">
              <ParentInvitePanel
                pending={isPending}
                startTransition={startTransition}
                students={parentStudents}
                onIssued={(row) => {
                  setResults([row]);
                  router.refresh();
                }}
              />
            </TabsContent>
          </Tabs>
        </Section>

        {results.length > 0 ? <ResultsPanel results={results} /> : null}

        {/* 초대 현황 */}
        <Section
          title="초대 현황"
          count={invitations.length}
          description={pendingCount > 0 ? `가입을 기다리는 초대가 ${pendingCount}건 있어요.` : "최근 발급한 초대 60건까지 보여요."}
          flush
          actions={
            <Button size="sm" variant="ghost" onClick={() => router.refresh()}>
              <RefreshCw />
              새로고침
            </Button>
          }
        >
          {invitations.length === 0 ? (
            <div className="border-t border-stroke-neutral-muted">
              <EmptyState compact icon={Inbox} title="발급된 초대가 없어요" description="위에서 대상을 골라 초대 링크를 만들어 보세요." />
            </div>
          ) : (
            <div className="border-t border-stroke-neutral-muted">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-x5">상태</TableHead>
                    <TableHead>이름</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>만료</TableHead>
                    <TableHead className="pr-x5 text-right">
                      <span className="sr-only">관리</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((invitation) => {
                    const meta = STATUS_META[invitation.status];
                    const type = TYPE_META[invitation.type];
                    return (
                      <TableRow key={invitation.id}>
                        <TableCell className="pl-x5">
                          <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                        </TableCell>
                        <TableCell className="t4-medium whitespace-nowrap">{invitation.name}</TableCell>
                        <TableCell className="whitespace-nowrap text-fg-neutral-muted">{type.label}</TableCell>
                        <TableCell className="whitespace-nowrap t3-regular tabular-nums text-fg-neutral-subtle">
                          {fmtDateTime(invitation.expiresAt)}
                        </TableCell>
                        <TableCell className="pr-x5 text-right">
                          {invitation.status === "PENDING" ? (
                            <Button
                              aria-label={`${invitation.name} 초대 취소`}
                              size="sm"
                              variant="ghost"
                              className="text-fg-neutral-muted"
                              disabled={isPending}
                              onClick={() => setRevokeTarget(invitation)}>
                              <X />
                              취소
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </Section>

        <AccountsPanel accounts={accounts} />
      </div>

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        title="초대를 취소할까요?"
        description={
          <>
            <span className="t4-bold text-fg-neutral">{revokeTarget?.name}</span>님에게 보낸 초대 링크로 더 이상
            가입할 수 없어요. 다시 초대하려면 새 링크를 발급하세요.
          </>
        }
        tone="critical"
        confirmLabel="초대 취소"
        cancelLabel="닫기"
        pendingLabel="취소하는 중…"
        pending={isPending}
        onConfirm={() => revokeTarget && revoke(revokeTarget.id)}
      />
    </>
  );
}

function AccountsPanel({ accounts }: { accounts: AccountRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [resetTarget, setResetTarget] = useState<AccountRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) =>
      `${a.name} ${a.username} ${a.email}`.toLowerCase().includes(q),
    );
  }, [accounts, query]);

  // 확인은 ConfirmDialog 에서 받는다
  function sendReset(account: AccountRow) {
    startTransition(async () => {
      try {
        await sendPasswordResetForAccount(account.email);
        toast.success(`${account.name} 재설정 링크를 ${account.email}로 보냈습니다`);
        setResetTarget(null);
      } catch {
        toast.error("재설정 링크를 보내지 못했습니다");
      }
    });
  }

  return (
    <Section
      title="비밀번호 재설정"
      count={accounts.length}
      description="비밀번호를 잊은 계정의 등록 이메일로 재설정 링크를 보내요."
      flush
    >
      <div className="border-t border-stroke-neutral-muted px-x5 py-x3">
        <SearchField
          placeholder="이름 · 아이디 · 이메일 검색"
          aria-label="계정 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="border-t border-stroke-neutral-muted">
        {filtered.length === 0 ? (
          <EmptyState
            compact
            icon={query ? SearchX : Users}
            title={query ? "일치하는 계정이 없어요" : "아직 만들어진 계정이 없어요"}
            description={query ? "다른 검색어로 찾아보세요." : "초대받은 사람이 가입하면 여기에 나타나요."}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-x5">이름</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>아이디</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead className="pr-x5 text-right">
                  <span className="sr-only">관리</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((account) => {
                const type = TYPE_META[account.type];
                return (
                  <TableRow key={account.id}>
                    <TableCell className="pl-x5 t4-medium whitespace-nowrap">{account.name}</TableCell>
                    <TableCell>
                      <StatusBadge tone={type.tone}>{type.label}</StatusBadge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-fg-neutral-muted">
                      {account.username ? `@${account.username}` : <span className="text-fg-placeholder">—</span>}
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-fg-neutral-muted">{account.email}</TableCell>
                    <TableCell className="pr-x5 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => setResetTarget(account)}>
                        <Mail />
                        재설정 발송
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <ConfirmDialog
        open={resetTarget !== null}
        onOpenChange={(open) => {
          if (!open) setResetTarget(null);
        }}
        title="재설정 링크를 보낼까요?"
        description={
          <>
            <span className="t4-bold text-fg-neutral">{resetTarget?.name}</span>님의 등록 이메일로 비밀번호 재설정
            링크를 보내요. 링크로 새 비밀번호를 정하면 기존 비밀번호는 쓸 수 없어요.
          </>
        }
        confirmLabel="보내기"
        pendingLabel="보내는 중…"
        pending={isPending}
        onConfirm={() => resetTarget && sendReset(resetTarget)}
      >
        {resetTarget && (
          <p className="rounded-r2 bg-bg-layer-fill px-x3 py-x2_5 t4-regular text-fg-neutral-muted break-all">
            {resetTarget.email}
          </p>
        )}
      </ConfirmDialog>
    </Section>
  );
}

/** 선택 목록 — 체크박스 행 */
function OptionRow({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-x3 px-x4 py-x2_5 transition-colors hover:bg-bg-transparent-pressed",
        checked && "bg-bg-transparent-selected hover:bg-bg-transparent-selected",
      )}>
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      <span className="min-w-0 truncate t4-regular text-fg-neutral">{children}</span>
    </label>
  );
}

function BulkInvitePanel({
  description,
  emptyLabel,
  icon: Icon,
  onIssue,
  options,
  pending,
}: {
  description: string;
  emptyLabel: string;
  icon: LucideIcon;
  onIssue: (ids: string[]) => void;
  options: PanelOption[];
  pending: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allSelected = options.length > 0 && selected.size === options.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(options.map((o) => o.id)));
  }

  return (
    <div className="flex flex-col gap-x3">
      <p className="t4-regular text-fg-neutral-subtle">{description}</p>

      {options.length === 0 ? (
        <div className="rounded-r3 bg-bg-layer-fill">
          <EmptyState compact icon={Icon} title={emptyLabel} />
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-r3 border border-stroke-neutral-muted">
            <div className="flex items-center justify-between gap-x2 border-b border-stroke-neutral-muted bg-bg-layer-fill px-x4 py-x2">
              <label className="flex cursor-pointer items-center gap-x3 t4-medium text-fg-neutral">
                <Checkbox
                  checked={allSelected ? true : selected.size > 0 ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                />
                {allSelected ? "전체 해제" : "전체 선택"}
              </label>
              <span className="t3-regular tabular-nums text-fg-neutral-subtle">
                {selected.size}/{options.length} 선택
              </span>
            </div>
            <div className="max-h-72 overflow-y-auto py-x1">
              {options.map((option) => (
                <OptionRow
                  key={option.id}
                  checked={selected.has(option.id)}
                  onToggle={() => toggle(option.id)}>
                  {option.label}
                </OptionRow>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              className="w-full sm:w-auto"
              disabled={pending || selected.size === 0}
              onClick={() => onIssue(Array.from(selected))}>
              {pending
                ? "발급 중…"
                : selected.size > 0
                  ? `${selected.size}명 초대 링크 발급`
                  : "초대 링크 발급"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function ParentInvitePanel({
  onIssued,
  pending,
  startTransition,
  students,
}: {
  onIssued: (row: BulkInvitationResult) => void;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
  students: ParentStudentOption[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [relation, setRelation] = useState("");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      `${s.name} ${s.grade} ${s.parentPhone}`.toLowerCase().includes(q),
    );
  }, [query, students]);

  const selectedPhone = useMemo(() => {
    const first = students.find((s) => selected.has(s.id));
    return first?.parentPhone ?? "";
  }, [selected, students]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function issue() {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      toast.error("자녀 학생을 선택하세요");
      return;
    }

    startTransition(async () => {
      try {
        const issued = await createParentAuthInvitation({
          studentIds: ids,
          relation: relation.trim() || undefined,
        });
        onIssued({
          expiresAt: issued.expiresAt,
          id: ids[0],
          name: `${issued.name} (${issued.parentPhone})`,
          ok: true,
          url: issued.url,
        });
        setSelected(new Set());
        toast.success("학부모 초대 링크를 발급했습니다");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "초대 링크를 만들지 못했습니다",
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-x3">
      <p className="t4-regular text-fg-neutral-subtle">
        자녀 학생을 골라 학부모용 초대 링크를 만들어요. 형제·자매를 함께 고르면 한 계정에 연결돼요.
        링크는 학생의 학부모 전화번호로 전달하세요.
      </p>

      <SearchField
        placeholder="학생 이름 · 학년 검색"
        aria-label="학생 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="sm:w-full"
      />
      <div className="overflow-hidden rounded-r3 border border-stroke-neutral-muted">
        <div className="max-h-72 overflow-y-auto py-x1">
          {filtered.length === 0 ? (
            <EmptyState compact icon={query ? SearchX : Users} title="초대 가능한 학생이 없어요" />
          ) : (
            filtered.map((student) => (
              <OptionRow
                key={student.id}
                checked={selected.has(student.id)}
                onToggle={() => toggle(student.id)}>
                {student.name} · {student.grade} · <span className="tabular-nums">{student.parentPhone}</span>
              </OptionRow>
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x3 sm:grid-cols-2">
        <FormField label="관계" htmlFor="parent-relation" hint="선택 입력 · 예: 모, 부">
          <Input
            id="parent-relation"
            type="text"
            placeholder="예: 모"
            value={relation}
            onChange={(e) => setRelation(e.target.value)}
          />
        </FormField>
        <div className="flex flex-col justify-end gap-x2 sm:items-end">
          {selectedPhone ? (
            <p className="t3-regular text-fg-neutral-subtle">
              전달할 학부모 전화번호 <span className="t3-medium tabular-nums text-fg-neutral">{selectedPhone}</span>
            </p>
          ) : null}
          <Button
            className="w-full sm:w-auto"
            disabled={pending || selected.size === 0}
            onClick={issue}>
            {pending
              ? "발급 중…"
              : selected.size > 0
                ? `자녀 ${selected.size}명 학부모 초대 발급`
                : "학부모 초대 발급"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ResultsPanel({ results }: { results: BulkInvitationResult[] }) {
  const ok = results.filter((row) => row.ok && row.url);
  const failed = results.filter((row) => !row.ok);

  async function copyAll() {
    const text = ok.map((row) => `${row.name}\t${row.url}`).join("\n");
    await navigator.clipboard.writeText(text);
    toast.success(`${ok.length}건의 링크를 복사했습니다`);
  }

  return (
    <Section
      title="발급 결과"
      description={
        <>
          <span className="text-fg-positive">{ok.length}건 성공</span>
          {failed.length > 0 ? <span className="text-fg-critical"> · {failed.length}건 실패</span> : null}
          {ok.length > 0 ? " · 링크를 복사해 전달하세요." : null}
        </>
      }
      flush
      actions={
        ok.length > 0 ? (
          <Button size="sm" variant="outline" onClick={copyAll}>
            <Copy />
            전체 복사
          </Button>
        ) : null
      }>
      <ul className="flex flex-col border-t border-stroke-neutral-muted py-x1">
        {ok.map((row) => (
          <li key={row.id} className="flex items-center gap-x3 px-x5 py-x2">
            <span className="w-28 shrink-0 truncate t4-medium text-fg-neutral">
              {row.name}
            </span>
            <span className="min-w-0 flex-1 truncate t3-regular text-fg-neutral-subtle">
              {row.url}
            </span>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`${row.name} 링크 복사`}
              onClick={async () => {
                await navigator.clipboard.writeText(row.url ?? "");
                toast.success(`${row.name} 링크를 복사했습니다`);
              }}>
              <Copy />
            </Button>
          </li>
        ))}
        {failed.map((row) => (
          <li key={row.id} className="px-x5 py-x2 t3-regular text-fg-critical">
            실패: {row.error ?? "초대를 만들지 못했습니다"}
          </li>
        ))}
      </ul>
    </Section>
  );
}

"use client";

import { Copy, KeyRound, RefreshCw, UserRoundPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createAuthInvitationsBulk,
  revokeAuthInvitation,
} from "@/actions/auth-invitations";
import { Button } from "@/components/ui/button";
import { PageHead } from "@/components/ui/page-head";
import type { BulkInvitationResult } from "@/lib/auth-invitations";

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

type InvitationRow = {
  createdAt: string;
  expiresAt: string;
  id: string;
  name: string;
  type: "STAFF" | "STUDENT";
};

type PanelOption = {
  id: string;
  label: string;
};

export function AuthInvitationManager({
  invitations,
  staff,
  students,
}: {
  invitations: InvitationRow[];
  staff: StaffOption[];
  students: StudentOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<BulkInvitationResult[]>([]);

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

  function revoke(id: string) {
    startTransition(async () => {
      try {
        await revokeAuthInvitation(id);
        toast.success("초대를 취소했습니다");
        router.refresh();
      } catch {
        toast.error("초대를 취소하지 못했습니다");
      }
    });
  }

  return (
    <div className="space-y-6">
      <PageHead
        title="계정 초대"
        subline="직원과 학생의 자체 로그인 계정을 일괄 발급합니다."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <BulkInvitePanel
          description="대상을 선택해 한 번에 초대 링크를 발급합니다. 등록된 이메일·역할을 그대로 사용합니다."
          emptyLabel="초대 가능한 직원이 없습니다"
          icon={KeyRound}
          options={staffOptions}
          pending={isPending}
          onIssue={(ids) => issueBulk("STAFF", ids)}
          title="직원 계정 일괄 초대"
        />

        <BulkInvitePanel
          description="대상을 선택해 한 번에 초대 링크를 발급합니다. 학생이 아이디와 복구 이메일을 직접 설정합니다."
          emptyLabel="초대 가능한 학생이 없습니다"
          icon={UserRoundPlus}
          options={studentOptions}
          pending={isPending}
          onIssue={(ids) => issueBulk("STUDENT", ids)}
          title="학생 계정 일괄 초대"
        />
      </div>

      {results.length > 0 ? <ResultsPanel results={results} /> : null}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">사용 대기 중인 초대</h2>
          <Button size="compact" variant="ghost" onClick={() => router.refresh()}>
            <RefreshCw />
            새로고침
          </Button>
        </div>
        <div className="overflow-hidden rounded-[8px] border border-line bg-panel">
          {invitations.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink-4">
              사용 대기 중인 초대가 없습니다.
            </p>
          ) : (
            invitations.map((invitation, index) => (
              <div
                key={invitation.id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  index > 0 ? "border-t border-line-2" : ""
                }`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {invitation.name}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-4">
                    {invitation.type === "STAFF" ? "직원" : "학생"} · 만료{" "}
                    {new Date(invitation.expiresAt).toLocaleString("ko-KR")}
                  </p>
                </div>
                <Button
                  aria-label={`${invitation.name} 초대 취소`}
                  size="icon"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => revoke(invitation.id)}>
                  <X />
                </Button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function BulkInvitePanel({
  description,
  emptyLabel,
  icon: Icon,
  onIssue,
  options,
  pending,
  title,
}: {
  description: string;
  emptyLabel: string;
  icon: React.ElementType;
  onIssue: (ids: string[]) => void;
  options: PanelOption[];
  pending: boolean;
  title: string;
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
    <section className="rounded-[8px] border border-line bg-panel p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-[8px] bg-brand-soft text-brand-2">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-ink-4">{description}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {options.length === 0 ? (
          <p className="rounded-[8px] border border-line-2 bg-canvas-2 px-3 py-6 text-center text-sm text-ink-4">
            {emptyLabel}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="text-xs font-medium text-brand-2 hover:underline"
                onClick={toggleAll}>
                {allSelected ? "전체 해제" : "전체 선택"}
              </button>
              <span className="text-xs text-ink-4">
                {selected.size}/{options.length} 선택
              </span>
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-[8px] border border-line-2 bg-canvas-2 p-1">
              {options.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-center gap-2 rounded-[6px] px-2 py-1.5 hover:bg-panel">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-[var(--brand,#2563eb)]"
                    checked={selected.has(option.id)}
                    onChange={() => toggle(option.id)}
                  />
                  <span className="min-w-0 truncate text-sm text-ink">
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
            <Button
              className="w-full"
              disabled={pending || selected.size === 0}
              onClick={() => onIssue(Array.from(selected))}>
              {selected.size > 0
                ? `${selected.size}명 초대 링크 발급`
                : "초대 링크 발급"}
            </Button>
          </>
        )}
      </div>
    </section>
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
    <div className="rounded-[8px] border border-brand/30 bg-brand-soft p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-brand-2">
          발급 결과 · {ok.length}건 성공
          {failed.length > 0 ? ` · ${failed.length}건 실패` : ""}
        </p>
        {ok.length > 0 ? (
          <Button size="compact" variant="outline" onClick={copyAll}>
            <Copy />
            전체 복사
          </Button>
        ) : null}
      </div>

      <div className="mt-3 space-y-2">
        {ok.map((row) => (
          <div
            key={row.id}
            className="flex items-center gap-2 rounded-[6px] bg-panel px-3 py-2">
            <span className="w-20 shrink-0 truncate text-xs font-medium text-ink">
              {row.name}
            </span>
            <code className="min-w-0 flex-1 truncate text-xs text-ink-4">
              {row.url}
            </code>
            <Button
              size="compact"
              variant="ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(row.url ?? "");
                toast.success(`${row.name} 링크를 복사했습니다`);
              }}>
              <Copy />
            </Button>
          </div>
        ))}
        {failed.map((row) => (
          <p key={row.id} className="px-3 text-xs text-destructive">
            실패: {row.error ?? "초대를 만들지 못했습니다"}
          </p>
        ))}
      </div>
    </div>
  );
}

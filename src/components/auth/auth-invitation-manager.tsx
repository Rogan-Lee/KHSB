"use client";

import { Copy, KeyRound, RefreshCw, UserRoundPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createAuthInvitation,
  revokeAuthInvitation,
} from "@/actions/auth-invitations";
import { Button } from "@/components/ui/button";
import { PageHead } from "@/components/ui/page-head";

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
  const [staffId, setStaffId] = useState(staff[0]?.id ?? "");
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [latestUrl, setLatestUrl] = useState("");

  function issue(type: "STAFF" | "STUDENT") {
    const targetId = type === "STAFF" ? staffId : studentId;
    if (!targetId) {
      toast.error("초대할 대상을 선택하세요");
      return;
    }

    startTransition(async () => {
      try {
        const result =
          type === "STAFF"
            ? await createAuthInvitation({
                type: "STAFF",
                targetUserId: targetId,
              })
            : await createAuthInvitation({
                type: "STUDENT",
                targetStudentId: targetId,
              });
        setLatestUrl(result.url);
        await navigator.clipboard.writeText(result.url);
        toast.success("초대 링크를 발급하고 클립보드에 복사했습니다");
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
        subline="직원과 학생의 자체 로그인 계정을 발급합니다."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <InvitePanel
          description="등록된 직원 이메일과 역할을 그대로 사용합니다."
          icon={KeyRound}
          onIssue={() => issue("STAFF")}
          pending={isPending}
          title="직원 계정 초대">
          <select
            className="h-10 w-full rounded-[8px] border border-line bg-panel px-3 text-sm text-ink"
            value={staffId}
            onChange={(event) => setStaffId(event.target.value)}>
            {staff.length === 0 ? (
              <option value="">초대 가능한 직원이 없습니다</option>
            ) : (
              staff.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} · {user.role} · {user.email}
                </option>
              ))
            )}
          </select>
        </InvitePanel>

        <InvitePanel
          description="학생이 로그인 아이디와 복구 이메일을 직접 설정합니다."
          icon={UserRoundPlus}
          onIssue={() => issue("STUDENT")}
          pending={isPending}
          title="학생 계정 초대">
          <select
            className="h-10 w-full rounded-[8px] border border-line bg-panel px-3 text-sm text-ink"
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}>
            {students.length === 0 ? (
              <option value="">초대 가능한 학생이 없습니다</option>
            ) : (
              students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name} · {student.grade}
                  {student.isOnlineManaged ? " · 온라인 관리" : ""}
                </option>
              ))
            )}
          </select>
        </InvitePanel>
      </div>

      {latestUrl ? (
        <div className="rounded-[8px] border border-brand/30 bg-brand-soft p-4">
          <p className="text-xs font-semibold text-brand-2">최근 발급 링크</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate text-xs text-ink">
              {latestUrl}
            </code>
            <Button
              size="compact"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(latestUrl);
                toast.success("링크를 복사했습니다");
              }}>
              <Copy />
              복사
            </Button>
          </div>
        </div>
      ) : null}

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

function InvitePanel({
  children,
  description,
  icon: Icon,
  onIssue,
  pending,
  title,
}: {
  children: React.ReactNode;
  description: string;
  icon: React.ElementType;
  onIssue: () => void;
  pending: boolean;
  title: string;
}) {
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
        {children}
        <Button className="w-full" disabled={pending} onClick={onIssue}>
          초대 링크 발급
        </Button>
      </div>
    </section>
  );
}

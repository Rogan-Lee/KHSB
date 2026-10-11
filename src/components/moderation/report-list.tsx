// 신고 목록 — 처리 대기·처리 완료가 같은 행 모양을 쓴다.
//  · @/lib/safety(Prisma 의존)의 라벨을 직접 쓰므로 서버 컴포넌트에서만 import 한다
//  · 신고된 글(snapshot)·신고자가 적은 내용(detail)은 사용자가 쓴 글 — 글자 그대로만 보여 준다(HTML 해석 없음)

import Link from "next/link";
import { ArrowRight, Paperclip } from "lucide-react";
import { DescriptionList, StatusBadge, type Tone } from "@/components/backoffice/ui";
import {
  REPORT_REASONS,
  REPORT_RESOLUTIONS,
  REPORT_TARGET_LABEL,
  SAFETY_ACTOR_LABEL,
  type ContentReportView,
  type ReportResolution,
} from "@/lib/safety";
import { cn, formatDateTime } from "@/lib/utils";
import { ResolveReportButton, type ResolutionOption } from "./resolve-report-button";

/** 운영자가 신고를 확인·조치하기로 약속한 시간 */
export const REPORT_SLA_MS = 24 * 60 * 60 * 1000;

const RESOLUTION_TONE: Record<ReportResolution, Tone> = {
  REMOVED: "bad",
  WARNED: "warn",
  RESTRICTED: "warn",
  DISMISSED: "gray",
};

// 경고·이용 제한은 시스템이 대신 해 주지 않는다 — 원장이 직접 한 조치를 기록으로 남기는 값
const RESOLUTION_HINT: Record<ReportResolution, string> = {
  REMOVED: "신고된 글을 양쪽 대화에서 완전히 지워요",
  WARNED: "당사자에게 직접 주의를 준 뒤 기록으로 남겨요",
  RESTRICTED: "담당 변경·계정 정지 같은 조치를 한 뒤 기록으로 남겨요",
  DISMISSED: "확인해 보니 조치할 일이 없을 때 골라요",
};

/** "글 삭제"는 신고된 글이 있을 때만(사용자 신고엔 지울 글이 없다) */
function resolutionOptions(canRemove: boolean): ResolutionOption[] {
  return (Object.keys(REPORT_RESOLUTIONS) as ReportResolution[])
    .filter((value) => value !== "REMOVED" || canRemove)
    .map((value) => ({ value, label: REPORT_RESOLUTIONS[value], hint: RESOLUTION_HINT[value] }));
}

function elapsedLabel(ms: number) {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return hours % 24 > 0 ? `${days}일 ${hours % 24}시간 전` : `${days}일 전`;
}

const ATTACHMENT_PREFIX = "첨부: ";

/** 신고 당시 글 — `첨부: https://…` 줄만 새 탭 링크로 바꾸고 나머지는 그대로 둔다 */
function Snapshot({ text }: { text: string }) {
  const lines: string[] = [];
  const files: string[] = [];
  for (const line of text.split("\n")) {
    const url = line.startsWith(ATTACHMENT_PREFIX) ? line.slice(ATTACHMENT_PREFIX.length).trim() : "";
    if (/^https:\/\/\S+$/.test(url)) files.push(url);
    else lines.push(line);
  }
  const body = lines.join("\n").trim();
  return (
    <>
      {body && <p className="whitespace-pre-wrap break-words t4-regular text-fg-neutral">{body}</p>}
      {files.length > 0 && (
        <ul className={cn("flex flex-wrap gap-x-x3 gap-y-x1", body && "mt-x2")}>
          {files.map((url, i) => (
            <li key={i}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-x1 t3-medium text-fg-neutral-muted underline underline-offset-2 hover:text-fg-neutral"
              >
                <Paperclip className="size-3.5" aria-hidden />
                첨부 {i + 1}
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** 신고자·대상 — 학생이면 원생 상세로 이어진다 */
function Party({ label, user }: { label: string; user: ContentReportView["reporter"] }) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-x1_5">
      <span className="shrink-0 t3-regular text-fg-neutral-subtle">
        {label} · {SAFETY_ACTOR_LABEL[user.type]}
      </span>
      {user.type === "STUDENT" ? (
        <Link
          href={`/students/${user.id}`}
          className="truncate t4-bold text-fg-neutral underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-stroke-focus-ring"
        >
          {user.name}
        </Link>
      ) : (
        <span className="truncate t4-bold text-fg-neutral">{user.name}</span>
      )}
    </span>
  );
}

function ReportItem({ report, now }: { report: ContentReportView; now: number }) {
  const open = report.status === "OPEN";
  const age = now - new Date(report.createdAt).getTime();
  const overdue = open && age > REPORT_SLA_MS;
  const removed = report.resolution === "REMOVED";

  return (
    <li className="flex flex-col gap-x3 px-x5 py-x4 sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-x3">
        <div className="flex flex-wrap items-center gap-x2">
          {open && (overdue ? <StatusBadge tone="bad">24시간 지남</StatusBadge> : <StatusBadge tone="warn">대기</StatusBadge>)}
          <StatusBadge tone="gray">{REPORT_TARGET_LABEL[report.targetType]}</StatusBadge>
          <span className="t3-regular text-fg-neutral-subtle">사유</span>
          <span className="t4-medium text-fg-neutral">{REPORT_REASONS[report.reason]}</span>
          <span className="ml-auto t3-regular tabular-nums text-fg-neutral-subtle">
            접수 {formatDateTime(report.createdAt)}
            {open && (
              <>
                {" · "}
                <span className={overdue ? "t3-bold text-fg-critical" : undefined}>{elapsedLabel(age)}</span>
              </>
            )}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-x2 gap-y-x1">
          <Party label="신고자" user={report.reporter} />
          <ArrowRight className="size-4 shrink-0 text-fg-placeholder" aria-hidden />
          <Party label="대상" user={report.target} />
        </div>

        <div className="rounded-r3 bg-bg-layer-fill px-x4 py-x3">
          <p className="mb-x1 t3-medium text-fg-neutral-subtle">신고된 글{removed ? " · 삭제됨" : ""}</p>
          {report.snapshot ? (
            <Snapshot text={report.snapshot} />
          ) : (
            <p className="t4-regular text-fg-neutral-subtle">
              {report.targetType === "USER" ? "특정 글이 아니라 사용자를 신고했어요." : "남아 있는 글 내용이 없어요."}
            </p>
          )}
        </div>

        {report.detail && (
          <div>
            <p className="t3-medium text-fg-neutral-subtle">신고자가 적은 내용</p>
            <p className="mt-x1 whitespace-pre-wrap break-words t4-regular text-fg-neutral-muted">{report.detail}</p>
          </div>
        )}

        {!open && (
          <DescriptionList
            cols={3}
            className="border-t border-stroke-neutral-muted pt-x3"
            items={[
              {
                label: "처리 결과",
                value: report.resolution ? (
                  <StatusBadge tone={RESOLUTION_TONE[report.resolution]}>
                    {REPORT_RESOLUTIONS[report.resolution]}
                  </StatusBadge>
                ) : null,
              },
              { label: "처리자", value: report.resolvedByName },
              { label: "처리 시각", value: report.resolvedAt ? formatDateTime(report.resolvedAt) : null },
              {
                label: "메모",
                value: report.resolutionNote ? (
                  <span className="whitespace-pre-wrap">{report.resolutionNote}</span>
                ) : null,
                full: true,
              },
            ]}
          />
        )}
      </div>

      {open && (
        <ResolveReportButton
          reportId={report.id}
          summary={`${SAFETY_ACTOR_LABEL[report.target.type]} ${report.target.name} · ${REPORT_TARGET_LABEL[report.targetType]} · ${REPORT_REASONS[report.reason]}`}
          options={resolutionOptions(report.targetId != null)}
        />
      )}
    </li>
  );
}

export function ReportList({ reports, now }: { reports: ContentReportView[]; now: number }) {
  return (
    <ul className="divide-y divide-stroke-neutral-muted border-t border-stroke-neutral-muted">
      {reports.map((report) => (
        <ReportItem key={report.id} report={report} now={now} />
      ))}
    </ul>
  );
}

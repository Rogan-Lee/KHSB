import { validateStaffMagicLink } from "@/lib/staff-auth";
import { getRequestMeta, hasGatePass } from "@/lib/token-auth";
import { getMyPortalSummary } from "@/actions/staff-portal";
import { StaffGate } from "@/components/magic-link-gate/staff-gate";
import { TokenNotice } from "@/components/magic-link-gate/token-notice";
import { ClockButtons } from "./clock-buttons";
import { Briefcase, Clock, History, ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";

function formatKstDateTime(d: Date): string {
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatMinutes(total: number): string {
  if (total <= 0) return "0분";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

export default async function StaffPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const meta = await getRequestMeta();
  const session = await validateStaffMagicLink(token, meta);

  if (!session) {
    return (
      <TokenNotice
        title="유효하지 않은 링크예요"
        body={
          "이 링크는 만료되었거나 무효화되었어요.\n담당 원장님께 새 링크를 요청해 주세요."
        }
      />
    );
  }

  const gated = await hasGatePass("STAFF", token, session.user.id);
  if (!gated) {
    return <StaffGate token={token} />;
  }

  const summary = await getMyPortalSummary(token);

  return (
    <div
      className="min-h-[100svh] bg-[#f5f6fa]"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="mx-auto max-w-[480px] px-4 py-5 space-y-4">
        {/* Hero */}
        <section className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 p-5 text-white shadow-md">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 opacity-80" strokeWidth={2.4} />
            <p className="text-[11.5px] font-semibold uppercase tracking-wider opacity-80">
              근무자 포털
            </p>
          </div>
          <h1 className="mt-1 text-[22px] font-bold tracking-[-0.02em]">
            {summary.userName}님
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed opacity-90">
            {summary.isWorking
              ? "지금 출근 상태예요. 퇴근할 때 잊지 말고 태깅해 주세요."
              : "출근하실 때 아래 버튼을 눌러 주세요."}
          </p>
        </section>

        {/* Today's status */}
        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-gray-500" strokeWidth={2.4} />
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-gray-500">
              현재 상태
            </p>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-[15px] font-bold text-gray-900">
                {summary.isWorking ? "출근 중" : "퇴근 상태"}
              </p>
              {summary.lastTag && (
                <p className="mt-0.5 text-[12px] text-gray-500">
                  마지막 태깅:{" "}
                  {summary.lastTag.type === "CLOCK_IN" ? "출근" : "퇴근"} ·{" "}
                  {formatKstDateTime(summary.lastTag.taggedAt)}
                </p>
              )}
              {!summary.lastTag && (
                <p className="mt-0.5 text-[12px] text-gray-500">
                  아직 출퇴근 기록이 없어요.
                </p>
              )}
            </div>
            <span
              className={`inline-flex h-8 items-center rounded-full px-3 text-[11.5px] font-bold ${
                summary.isWorking
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {summary.isWorking ? "ON" : "OFF"}
            </span>
          </div>

          <div className="mt-4">
            <ClockButtons token={token} isWorking={summary.isWorking} />
          </div>
        </section>

        {/* Monthly summary */}
        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-[11.5px] font-semibold uppercase tracking-wider text-gray-500">
            {summary.monthYear}년 {summary.monthMonth}월 누적
          </p>
          <p className="mt-2 text-[22px] font-bold tracking-[-0.02em] text-gray-900 tabular-nums">
            {formatMinutes(summary.monthMinutes)}
          </p>
          <p className="mt-1 text-[11.5px] text-gray-500">
            출/퇴근 짝이 맞은 시간만 합산해요. 정확한 급여 산정은 관리자가 검토 후 확정해요.
          </p>
        </section>

        {/* Recent tags */}
        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <History className="h-3.5 w-3.5 text-gray-500" strokeWidth={2.4} />
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-gray-500">
              최근 출퇴근 5건
            </p>
          </div>
          {summary.recentTags.length === 0 ? (
            <p className="mt-3 text-[12.5px] text-gray-500">아직 기록이 없어요.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {summary.recentTags.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-semibold text-gray-900">
                      {t.type === "CLOCK_IN" ? "출근" : "퇴근"}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {formatKstDateTime(t.taggedAt)}
                    </p>
                  </div>
                  {t.note && (
                    <span className="max-w-[120px] truncate text-[11px] text-gray-500">
                      {t.note}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Safety notice */}
        <section className="rounded-2xl border border-gray-100 bg-white/60 p-3.5">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <div>
              <p className="text-[12px] font-semibold text-gray-700">본인 전용 링크</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-gray-500">
                외부에 공유하면 다른 사람이 본인 명의로 출퇴근을 태깅할 수 있어요. 의심되는
                상황이 생기면 즉시 담당 원장님께 알려 주세요.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

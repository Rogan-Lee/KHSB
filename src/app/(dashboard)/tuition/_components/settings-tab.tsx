"use client";

// 설정 탭 (원장급) — 수강료 기본값·안내문과 학생별 수강료.
// 여기 값은 "청구 예정" 목록과 발행 화면의 기본값을 정할 뿐, 이미 발행한 청구서는 바꾸지 않는다.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Users } from "lucide-react";
import { Switch } from "seed-design/ui/switch";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, FormActions, FormField, Notice, SearchField, Section, StatusBadge } from "@/components/backoffice/ui";
import { loadTuitionProviderBalance, updateTuitionProfile, updateTuitionSetting } from "@/actions/tuition";
import type { AdminTuitionStudent } from "@/lib/tuition/admin-data";
import { parseReminderDays, type TuitionRefundPolicyValue, type TuitionTaxTypeValue } from "@/lib/tuition/calc";
import type { TuitionProviderInfo } from "@/lib/tuition/provider-info";
import type { TuitionSettingValues } from "@/lib/tuition/core";
import { REFUND_POLICY_LABEL, TAX_TYPE_LABEL, won } from "@/lib/tuition/format";
import { callTuition, digitsOnly, MoneyInput, StudentCell, toAmount } from "./shared";

const REFUND_POLICIES: TuitionRefundPolicyValue[] = ["DAILY", "ACADEMY_LAW", "MANUAL"];

const TAX_TYPES: TuitionTaxTypeValue[] = ["EXEMPT", "TAXABLE"];

const REFUND_POLICY_HINT: Record<TuitionRefundPolicyValue, string> = {
  DAILY: "남은 일수만큼 일할 계산한 금액을 제안해요.",
  ACADEMY_LAW: "월 단위로 1/3 경과 전 2/3, 1/2 경과 전 1/2, 이후 없음으로 제안해요.",
  MANUAL: "제안 없이 환불할 때마다 금액을 직접 입력해요.",
};

export function SettingsTab({
  setting,
  onlinePaymentAvailable,
  students,
  provider,
}: {
  setting: TuitionSettingValues;
  onlinePaymentAvailable: boolean;
  students: AdminTuitionStudent[];
  /** 연결된 결제사 — null 이면 온라인 결제 없음 */
  provider: TuitionProviderInfo | null;
}) {
  return (
    <div className="flex flex-col gap-x6">
      <SettingForm setting={setting} onlinePaymentAvailable={onlinePaymentAvailable} provider={provider} />
      <StudentFees students={students} defaultMonthlyFee={setting.defaultMonthlyFee} />
    </div>
  );
}

// ─── 결제 연동 ────────────────────────────────────────────────────────

/** 결제사 이름이 아니라 능력 값으로 안내를 만든다 — 결제사가 바뀌어도 이 블록은 그대로 맞는다 */
function ProviderInfoBlock({ provider }: { provider: TuitionProviderInfo | null }) {
  if (!provider) {
    return (
      <div className="border-t border-stroke-neutral-muted pt-x3">
        <p className="t4-bold text-fg-neutral">결제 연동</p>
        <p className="mt-x1 t3-regular text-fg-neutral-subtle">
          연결된 온라인 결제사가 없어요. 지금은 현장 결제만 받을 수 있어요.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-x2 border-t border-stroke-neutral-muted pt-x3">
      <div className="flex flex-wrap items-center gap-x2">
        <p className="t4-bold text-fg-neutral">결제 연동</p>
        <span className="t4-regular text-fg-neutral">{provider.label}</span>
        {provider.testMode && <StatusBadge tone="warn">시험 환경</StatusBadge>}
      </div>
      <ul className="flex flex-col gap-x1 t3-regular text-fg-neutral-subtle">
        <li>{provider.canNotify ? "알림톡 청구서 발송 가능" : "알림톡 청구서 발송 불가"}</li>
        <li>
          {provider.partialCancel
            ? "부분 취소 가능"
            : "전액 취소만 가능 — 부분 환불은 직접 환불 후 기록"}
        </li>
      </ul>
      {provider.hasBalance && <BalanceRow />}
    </div>
  );
}

/** 쌤포인트 잔액 — 유료 외부 조회라 마운트 때 부르지 않고 버튼을 눌렀을 때만 확인한다 */
function BalanceRow() {
  const [loading, startLoad] = useTransition();
  const [result, setResult] = useState<{ balance: number | null; chargeUrl: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function check() {
    setError(null);
    startLoad(async () => {
      const res = await callTuition(() => loadTuitionProviderBalance());
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res.data ?? { balance: null, chargeUrl: null });
    });
  }

  return (
    <div className="mt-x1 flex flex-wrap items-center gap-x3">
      <span className="t3-medium text-fg-neutral">쌤포인트 잔액</span>
      {result && (
        <span className="t4-bold tabular-nums text-fg-neutral">
          {result.balance === null ? "확인할 수 없어요" : `${result.balance.toLocaleString("ko-KR")}P`}
        </span>
      )}
      <Button type="button" size="xs" variant="outline" onClick={check} disabled={loading}>
        {loading ? "확인 중…" : "잔액 확인"}
      </Button>
      {result?.chargeUrl && (
        <a
          href={result.chargeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-x1 t3-medium text-fg-brand underline-offset-4 hover:underline"
        >
          충전하러 가기
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      )}
      {error && <span className="t3-regular text-fg-critical">{error}</span>}
    </div>
  );
}

// ─── 수강료 설정 ───────────────────────────────────────────────────────

function SettingForm({
  setting,
  onlinePaymentAvailable,
  provider,
}: {
  setting: TuitionSettingValues;
  onlinePaymentAvailable: boolean;
  provider: TuitionProviderInfo | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [defaultFee, setDefaultFee] = useState(setting.defaultMonthlyFee === null ? "" : String(setting.defaultMonthlyFee));
  const [dueDays, setDueDays] = useState(String(setting.dueDays));
  const [leadDays, setLeadDays] = useState(String(setting.leadDays));
  const [reminderDays, setReminderDays] = useState(setting.reminderDays);
  const [refundPolicy, setRefundPolicy] = useState<TuitionRefundPolicyValue>(setting.refundPolicy);
  const [onlineEnabled, setOnlineEnabled] = useState(setting.onlinePaymentEnabled);
  const [taxType, setTaxType] = useState<TuitionTaxTypeValue>(setting.taxType);
  const [autoIssueEnabled, setAutoIssueEnabled] = useState(setting.autoIssueEnabled);
  const [autoIssueLeadDays, setAutoIssueLeadDays] = useState(String(setting.autoIssueLeadDays));
  const [guideText, setGuideText] = useState(setting.guideText ?? "");
  const [onsiteGuideText, setOnsiteGuideText] = useState(setting.onsiteGuideText ?? "");

  function save() {
    if (dueDays === "" || leadDays === "") {
      toast.error("납부 기한 일수와 청구 예정 표시 기준 일수를 입력해 주세요");
      return;
    }
    if (autoIssueLeadDays === "" || Number(autoIssueLeadDays) > 30) {
      toast.error("자동 청구 시점은 이용 종료 0~30일 전으로 입력해 주세요");
      return;
    }
    startTransition(async () => {
      const res = await callTuition(() =>
        updateTuitionSetting({
          defaultMonthlyFee: toAmount(defaultFee),
          dueDays: Number(dueDays),
          leadDays: Number(leadDays),
          reminderDays,
          refundPolicy,
          onlinePaymentEnabled: onlineEnabled,
          taxType,
          autoIssueEnabled,
          autoIssueLeadDays: Number(autoIssueLeadDays),
          guideText: guideText.trim() || null,
          onsiteGuideText: onsiteGuideText.trim() || null,
        }),
      );
      if (res.ok) {
        toast.success("설정을 저장했어요");
        // 서버가 정리해 저장한 모양("3, 7" → "7,3")으로 입력칸도 맞춘다
        setReminderDays(parseReminderDays(reminderDays).join(","));
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Section
      title="수강료 설정"
      description="청구서를 발행할 때의 기본값과 학부모 앱에 보이는 안내문이에요."
      className="max-w-3xl"
    >
      <div className="flex flex-col gap-x5">
        <div className="grid grid-cols-1 gap-x4 sm:grid-cols-3">
          <FormField
            label="기본 월 수강료 (원)"
            htmlFor="tuition-setting-fee"
            hint="학생별 수강료가 없는 학생에게 적용돼요."
          >
            <MoneyInput
              id="tuition-setting-fee"
              value={defaultFee}
              onValueChange={setDefaultFee}
              disabled={pending}
              placeholder="미설정"
            />
          </FormField>
          <FormField label="납부 기한 일수" htmlFor="tuition-setting-due" required hint="발행일로부터 며칠 뒤까지 (0~60)">
            <Input
              id="tuition-setting-due"
              inputMode="numeric"
              value={dueDays}
              disabled={pending}
              onChange={(e) => setDueDays(digitsOnly(e.target.value).slice(0, 2))}
              className="tabular-nums"
            />
          </FormField>
          <FormField
            label="청구 예정 표시 기준 일수"
            htmlFor="tuition-setting-lead"
            required
            hint="다음 이용 시작 며칠 전부터 올릴지 (0~60)"
          >
            <Input
              id="tuition-setting-lead"
              inputMode="numeric"
              value={leadDays}
              disabled={pending}
              onChange={(e) => setLeadDays(digitsOnly(e.target.value).slice(0, 2))}
              className="tabular-nums"
            />
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-x4 sm:grid-cols-2">
          <FormField
            label="재결제 안내 시점"
            htmlFor="tuition-setting-reminder"
            hint="이용 종료 며칠 전에 학부모에게 알릴지 쉼표로 구분해 적어요. 예: 7,3 (비우면 보내지 않아요)"
          >
            <Input
              id="tuition-setting-reminder"
              value={reminderDays}
              maxLength={40}
              disabled={pending}
              onChange={(e) => setReminderDays(e.target.value)}
              placeholder="7,3"
              className="tabular-nums"
            />
          </FormField>
          <FormField label="환불 계산 방식" hint={REFUND_POLICY_HINT[refundPolicy]}>
            <Select
              value={refundPolicy}
              onValueChange={(value) => setRefundPolicy(value as TuitionRefundPolicyValue)}
              disabled={pending}
            >
              <SelectTrigger aria-label="환불 계산 방식">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REFUND_POLICIES.map((policy) => (
                  <SelectItem key={policy} value={policy}>
                    {REFUND_POLICY_LABEL[policy]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>

        <FormField
          label="과세 유형"
          hint="과세로 두면 청구서와 현금영수증에 공급가액·세액(부가세 10% 포함 금액 기준)을 나눠 보여 줘요. 이미 발행한 청구서는 바뀌지 않아요."
        >
          <Select value={taxType} onValueChange={(value) => setTaxType(value as TuitionTaxTypeValue)} disabled={pending}>
            <SelectTrigger aria-label="과세 유형" className="sm:max-w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAX_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {TAX_TYPE_LABEL[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <div className="flex flex-col gap-x3 rounded-r3 bg-bg-layer-fill px-x4 py-x4">
          <div className="flex">
            <Switch
              size="24"
              label="자동 청구"
              checked={autoIssueEnabled}
              disabled={pending}
              onCheckedChange={setAutoIssueEnabled}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x2 t4-regular text-fg-neutral">
            <label htmlFor="tuition-setting-auto-lead">이용 종료</label>
            <Input
              id="tuition-setting-auto-lead"
              inputMode="numeric"
              value={autoIssueLeadDays}
              disabled={pending || !autoIssueEnabled}
              onChange={(e) => setAutoIssueLeadDays(digitsOnly(e.target.value).slice(0, 2))}
              aria-label="자동 청구 시점 (이용 종료 며칠 전, 0~30)"
              className="h-9 w-20 tabular-nums"
            />
            <span>일 전에 발행 (0~30)</span>
          </div>
          <p className="t3-regular text-fg-neutral-subtle">
            이용 기간이 끝나는 학생에게 다음 1개월 청구서를 자동으로 발행하고 학부모에게 알림을 보내요. 2개월 이상
            선결제와 처음 청구하는 학생은 직접 발행해 주세요. 청구 제외로 둔 학생과 수강료가 정해지지 않은 학생은
            건너뛰어요.
          </p>
        </div>

        <div className="flex flex-col gap-x3 rounded-r3 bg-bg-layer-fill px-x4 py-x4">
          {/* 세로 배치 안에 그대로 두면 스위치가 가로로 늘어나 라벨이 오른쪽 끝으로 밀린다 */}
          <div className="flex">
            <Switch
              size="24"
              label="온라인 결제 사용"
              checked={onlineEnabled}
              disabled={pending}
              onCheckedChange={setOnlineEnabled}
            />
          </div>
          <p className="t3-regular text-fg-neutral-subtle">
            끄면 학부모 앱에서 결제하기 버튼이 사라지고 현장 결제(지역화폐·현장 카드)만 받아요.
          </p>
          {!onlinePaymentAvailable && (
            <Notice tone="warn" title="지금은 온라인 결제가 꺼져 있어요">
              {setting.onlinePaymentEnabled
                ? "결제사 키가 아직 등록되지 않았어요. 키가 등록될 때까지 학부모 앱에는 현장 결제만 안내돼요."
                : "‘온라인 결제 사용’이 꺼져 있어 학부모 앱에는 현장 결제만 안내돼요."}
            </Notice>
          )}
          <ProviderInfoBlock provider={provider} />
        </div>

        <FormField
          label="학부모 안내문"
          htmlFor="tuition-setting-guide"
          hint="학부모 앱 수강료 화면에 보여요. 납부 방법·환불 규정 등을 적어 주세요."
        >
          <Textarea
            id="tuition-setting-guide"
            value={guideText}
            maxLength={5000}
            rows={5}
            disabled={pending}
            onChange={(e) => setGuideText(e.target.value)}
            className="resize-y"
          />
        </FormField>
        <FormField
          label="현장 결제 안내문"
          htmlFor="tuition-setting-onsite-guide"
          hint="현장 결제를 신청하는 학부모에게 보여요. 결제 가능한 시간·지역화폐 종류 등을 적어 주세요."
        >
          <Textarea
            id="tuition-setting-onsite-guide"
            value={onsiteGuideText}
            maxLength={5000}
            rows={4}
            disabled={pending}
            onChange={(e) => setOnsiteGuideText(e.target.value)}
            className="resize-y"
          />
        </FormField>

        <FormActions>
          <Button onClick={save} disabled={pending} className="w-full sm:w-auto">
            {pending ? "저장 중…" : "저장"}
          </Button>
        </FormActions>
      </div>
    </Section>
  );
}

// ─── 학생별 수강료 ─────────────────────────────────────────────────────

function StudentFees({
  students,
  defaultMonthlyFee,
}: {
  students: AdminTuitionStudent[];
  defaultMonthlyFee: number | null;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.name.toLowerCase().includes(q) || s.grade.toLowerCase().includes(q));
  }, [students, query]);

  return (
    <Section
      title="학생별 수강료"
      count={students.length}
      description="월 수강료를 비워 두면 기본 월 수강료를 써요. ‘청구 제외’는 청구 예정 목록에서만 빠지고, 직접 발행은 할 수 있어요."
      actions={
        <SearchField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
          placeholder="이름·학년 검색"
          aria-label="학생 검색"
          className="sm:w-56"
        />
      }
      flush
    >
      {filtered.length === 0 ? (
        <EmptyState
          compact
          icon={Users}
          title={students.length === 0 ? "재원 중인 학생이 없어요" : "검색 결과가 없어요"}
        />
      ) : (
        <div className="border-t border-stroke-neutral-muted">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>학생</TableHead>
                <TableHead>월 수강료 (원)</TableHead>
                <TableHead>청구 제외</TableHead>
                <TableHead>메모</TableHead>
                <TableHead className="text-right">저장</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((student) => (
                <StudentFeeRow key={student.id} student={student} defaultMonthlyFee={defaultMonthlyFee} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}

function StudentFeeRow({
  student,
  defaultMonthlyFee,
}: {
  student: AdminTuitionStudent;
  defaultMonthlyFee: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fee, setFee] = useState(student.monthlyFee === null ? "" : String(student.monthlyFee));
  const [paused, setPaused] = useState(student.billingPaused);
  const [memo, setMemo] = useState(student.memo ?? "");

  const dirty =
    toAmount(fee) !== student.monthlyFee || paused !== student.billingPaused || memo.trim() !== (student.memo ?? "");

  function save() {
    startTransition(async () => {
      const res = await callTuition(() =>
        updateTuitionProfile({
          studentId: student.id,
          monthlyFee: toAmount(fee),
          billingPaused: paused,
          memo: memo.trim() || null,
        }),
      );
      if (res.ok) {
        toast.success(`${student.name} 학생 수강료를 저장했어요`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <TableRow>
      <TableCell>
        <StudentCell student={student} />
      </TableCell>
      <TableCell>
        <MoneyInput
          aria-label={`${student.name} 월 수강료`}
          value={fee}
          onValueChange={setFee}
          disabled={pending}
          placeholder={defaultMonthlyFee === null ? "미설정" : `기본 ${won(defaultMonthlyFee)}`}
          className="h-9 w-40"
        />
      </TableCell>
      <TableCell>
        <label className="flex cursor-pointer items-center gap-x2 whitespace-nowrap t4-regular text-fg-neutral-muted">
          <Checkbox
            checked={paused}
            disabled={pending}
            onCheckedChange={(checked) => setPaused(checked === true)}
            aria-label={`${student.name} 청구 제외`}
          />
          제외
        </label>
      </TableCell>
      <TableCell>
        <Input
          aria-label={`${student.name} 메모`}
          value={memo}
          maxLength={300}
          disabled={pending}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="예: 형제 할인, 장학"
          className="h-9 min-w-40"
        />
      </TableCell>
      <TableCell className="text-right">
        <Button variant={dirty ? "default" : "secondary"} size="xs" onClick={save} disabled={pending || !dirty}>
          {pending ? "저장 중…" : "저장"}
        </Button>
      </TableCell>
    </TableRow>
  );
}

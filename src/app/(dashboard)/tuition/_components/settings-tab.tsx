"use client";

// 설정 탭 (원장급) — 수강료 기본값·안내문과 학생별 수강료.
// 여기 값은 "청구 예정" 목록과 발행 화면의 기본값을 정할 뿐, 이미 발행한 청구서는 바꾸지 않는다.

import { useMemo, useState, useTransition } from "react";
import { useStickyState } from "@/hooks/use-sticky-state";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Users } from "lucide-react";
import { Switch } from "seed-design/ui/switch";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, FormActions, FormField, Notice, SearchField, Section, StatusBadge } from "@/components/backoffice/ui";
import {
  loadTuitionProviderBalance,
  updateTuitionPricing,
  updateTuitionProfile,
  updateTuitionProfilesBulk,
  updateTuitionSetting,
  type TuitionProfileBulkInput,
} from "@/actions/tuition";
import type { AdminTuitionStudent } from "@/lib/tuition/admin-data";
import { parseReminderDays, type TuitionRefundPolicyValue, type TuitionTaxTypeValue } from "@/lib/tuition/calc";
import type { TuitionProviderInfo } from "@/lib/tuition/provider-info";
import type { TuitionSettingValues } from "@/lib/tuition/core";
import { dotDate, REFUND_POLICY_LABEL, TAX_TYPE_LABEL, won } from "@/lib/tuition/format";
import { dailyRateOf, DEFAULT_TUITION_PRICING, validatePricing, type TuitionPricing } from "@/lib/tuition/pricing";
import { callTuition, digitsOnly, MoneyInput, StudentCell, toAmount } from "./shared";

const REFUND_POLICIES: TuitionRefundPolicyValue[] = ["DAILY", "ACADEMY_LAW", "MANUAL"];

const TAX_TYPES: TuitionTaxTypeValue[] = ["EXEMPT", "TAXABLE"];

const REFUND_POLICY_HINT: Record<TuitionRefundPolicyValue, string> = {
  DAILY: "남은 일수만큼 일할 계산한 금액을 제안해요.",
  ACADEMY_LAW:
    "강한선배 환불 규정(학원법)이에요. 이용 중인 달은 1/3 경과 전 2/3, 1/2 경과 전 1/2, 이후 없음, 시작 전인 달은 전액으로 제안해요. 천 원 미만은 절사해요.",
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
      <PricingSection pricing={setting.pricing} />
      <SettingForm setting={setting} onlinePaymentAvailable={onlinePaymentAvailable} provider={provider} />
      <StudentFees students={students} />
    </div>
  );
}

// ─── 수강료 산식 ──────────────────────────────────────────────────────

type PlanDraft = { monthlyFee: string; prepayMonthlyFee: string; basisDays: string };
type PricingDraft = { plans: Record<string, PlanDraft>; combineFromDay: string; calendarDays: string; dailyRoundUnit: number };

function toPricingDraft(pricing: TuitionPricing): PricingDraft {
  return {
    plans: Object.fromEntries(
      pricing.plans.map((plan) => [
        plan.key,
        { monthlyFee: String(plan.monthlyFee), prepayMonthlyFee: String(plan.prepayMonthlyFee), basisDays: String(plan.basisDays) },
      ]),
    ),
    combineFromDay: String(pricing.combineFromDay),
    calendarDays: String(pricing.calendarDays),
    dailyRoundUnit: pricing.dailyRoundUnit,
  };
}

/** 입력값 → 저장할 산식 (검사는 validatePricing — 서버도 같은 함수로 다시 본다) */
function fromPricingDraft(draft: PricingDraft, base: TuitionPricing) {
  const num = (text: string) => (text.trim() === "" ? Number.NaN : Number(text));
  return validatePricing({
    plans: base.plans.map((plan) => ({
      key: plan.key,
      monthlyFee: num(draft.plans[plan.key].monthlyFee),
      prepayMonthlyFee: num(draft.plans[plan.key].prepayMonthlyFee),
      basisDays: num(draft.plans[plan.key].basisDays),
    })),
    prepayMonths: base.prepayMonths,
    calendarDays: num(draft.calendarDays),
    combineFromDay: num(draft.combineFromDay),
    dailyRoundUnit: draft.dailyRoundUnit,
  });
}

const ROUND_UNITS = [1, 10, 100, 1000];
const DAYS_INPUT = "h-9 w-20 text-right tabular-nums";

/** 반별 금액과 일할 규칙 — 청구 일정·자동 청구·직접 발행이 모두 이 값으로 계산한다 */
function PricingSection({ pricing }: { pricing: TuitionPricing }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(() => toPricingDraft(pricing));
  const checked = fromPricingDraft(draft, pricing);
  // 화면 미리보기는 고친 값이 맞을 때 그 값으로, 아니면 저장된 값으로
  const view = checked.ok ? checked.pricing : pricing;
  const dirty = JSON.stringify(draft) !== JSON.stringify(toPricingDraft(pricing));
  const isDefault = JSON.stringify(draft) === JSON.stringify(toPricingDraft(DEFAULT_TUITION_PRICING));

  function patchPlan(key: string, change: Partial<PlanDraft>) {
    setDraft((prev) => ({ ...prev, plans: { ...prev.plans, [key]: { ...prev.plans[key], ...change } } }));
  }

  function save() {
    if (!checked.ok) return;
    startTransition(async () => {
      const res = await callTuition(() => updateTuitionPricing(checked.pricing));
      if (res.ok) {
        toast.success("수강료 산식을 저장했어요. 청구 일정이 새 값으로 다시 계산돼요");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Section
      title="수강료 산식"
      description="청구 일정·자동 청구·직접 발행이 이 값으로 금액을 계산해요. 반은 학생 정보의 ‘반’에 ‘선택’이 들어가면 선택반, 아니면 정규반이에요. 바꾼 값은 앞으로 내는 청구서부터 적용되고, 이미 발행한 청구서는 그대로예요."
      className="max-w-3xl"
      flush
    >
      <div className="border-t border-stroke-neutral-muted">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>반</TableHead>
              <TableHead>월 수강료 (원)</TableHead>
              <TableHead>{pricing.prepayMonths}달 선등록 월 수강료 (원)</TableHead>
              <TableHead>일할 기준</TableHead>
              <TableHead className="text-right">일 단가 (1달 · {pricing.prepayMonths}달)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pricing.plans.map((plan) => {
              const row = draft.plans[plan.key];
              const viewPlan = view.plans.find((p) => p.key === plan.key) ?? plan;
              return (
                <TableRow key={plan.key}>
                  <TableCell className="t4-medium">{plan.name}</TableCell>
                  <TableCell>
                    <MoneyInput
                      aria-label={`${plan.name} 월 수강료`}
                      value={row.monthlyFee}
                      onValueChange={(digits) => patchPlan(plan.key, { monthlyFee: digits })}
                      disabled={pending}
                      className="h-9 w-32"
                    />
                  </TableCell>
                  <TableCell>
                    <MoneyInput
                      aria-label={`${plan.name} 선등록 월 수강료`}
                      value={row.prepayMonthlyFee}
                      onValueChange={(digits) => patchPlan(plan.key, { prepayMonthlyFee: digits })}
                      disabled={pending}
                      className="h-9 w-32"
                    />
                    <span className="mt-x1 block t3-regular tabular-nums text-fg-neutral-subtle">
                      {pricing.prepayMonths}달 {won(viewPlan.prepayMonthlyFee * pricing.prepayMonths)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-x1_5 t4-regular">
                      <Input
                        aria-label={`${plan.name} 일할 기준 일수`}
                        inputMode="decimal"
                        value={row.basisDays}
                        disabled={pending}
                        onChange={(e) => patchPlan(plan.key, { basisDays: e.target.value.replace(/[^0-9.]/g, "").slice(0, 4) })}
                        className={DAYS_INPUT}
                      />
                      일
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {won(dailyRateOf(viewPlan.monthlyFee, viewPlan, view))} · {won(dailyRateOf(viewPlan.prepayMonthlyFee, viewPlan, view))}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-x4 border-t border-stroke-neutral-muted px-x6 py-x4">
        <div className="flex flex-wrap items-center gap-x6 t4-regular text-fg-neutral">
          <label className="flex items-center gap-x1_5">
            <Input
              aria-label="다음 달과 묶는 입실일"
              inputMode="numeric"
              value={draft.combineFromDay}
              disabled={pending}
              onChange={(e) => setDraft((prev) => ({ ...prev, combineFromDay: digitsOnly(e.target.value).slice(0, 2) }))}
              className={DAYS_INPUT}
            />
            일 이후 입실이면 다음 달과 묶어 청구
          </label>
          <label className="flex items-center gap-x1_5">
            달력 한 달 =
            <Input
              aria-label="달력 한 달 기준 일수"
              inputMode="decimal"
              value={draft.calendarDays}
              disabled={pending}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, calendarDays: e.target.value.replace(/[^0-9.]/g, "").slice(0, 4) }))
              }
              className={DAYS_INPUT}
            />
            일
          </label>
          <label className="flex items-center gap-x1_5">
            일 단가
            <select
              aria-label="일 단가 버림 단위"
              value={draft.dailyRoundUnit}
              disabled={pending}
              onChange={(e) => setDraft((prev) => ({ ...prev, dailyRoundUnit: Number(e.target.value) }))}
              className="h-9 rounded-r2 px-x2 shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-weak)] tabular-nums"
            >
              {ROUND_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit === 1 ? "버림 없음" : `${won(unit)} 미만 버림`}
                </option>
              ))}
            </select>
          </label>
        </div>

        <ul className="flex list-disc flex-col gap-x1 pl-x5 t3-regular text-fg-neutral-muted">
          <li>등록 기준은 매월 1일~말일이에요.</li>
          <li>
            {view.combineFromDay}일 전에 입실하면 입실일~말일을 일할로, {view.combineFromDay}일 이후에 입실하면 그달 일할과
            다음 달 한 달을 한 청구서로 보내요.
          </li>
          <li>
            일 단가는 월 수강료 ÷ 일할 기준 일수({view.calendarDays}일은 30일·31일 달 모두)
            {view.dailyRoundUnit > 1 && `이고 ${won(view.dailyRoundUnit)} 미만은 버려요`}. 일할 기준이 {view.calendarDays}일보다
            짧은 반은 남은 날을 그 비율로 줄여 세요.
          </li>
          <li>{pricing.prepayMonths}달 선등록은 일 단가를 포함한 모든 계산이 할인 금액 기준이에요.</li>
        </ul>

        {!checked.ok && <Notice tone="bad">{checked.error}</Notice>}
        <FormActions>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDraft(toPricingDraft(DEFAULT_TUITION_PRICING))}
            disabled={pending || isDefault}
          >
            기본값으로
          </Button>
          <Button size="sm" onClick={save} disabled={pending || !dirty || !checked.ok}>
            {pending ? "저장 중…" : "산식 저장"}
          </Button>
        </FormActions>
      </div>
    </Section>
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
  // 반별 금액(수강료 산식)으로 바뀌어 화면에서는 고치지 않는다 — 저장할 때 기존 값을 그대로 보낸다
  const defaultFee = setting.defaultMonthlyFee === null ? "" : String(setting.defaultMonthlyFee);
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
      toast.error("자동 청구 시점은 이용 시작 0~30일 전으로 입력해 주세요");
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
        <div className="grid grid-cols-1 gap-x4 sm:grid-cols-2">
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
            label="청구 일정 표시 기준 일수"
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
            <label htmlFor="tuition-setting-auto-lead">이용 시작</label>
            <Input
              id="tuition-setting-auto-lead"
              inputMode="numeric"
              value={autoIssueLeadDays}
              disabled={pending || !autoIssueEnabled}
              onChange={(e) => setAutoIssueLeadDays(digitsOnly(e.target.value).slice(0, 2))}
              aria-label="자동 청구 시점 (이용 시작 며칠 전, 0~30)"
              className="h-9 w-20 tabular-nums"
            />
            <span>일 전에 발행 (0~30)</span>
          </div>
          <p className="t3-regular text-fg-neutral-subtle">
            청구 일정에서 ‘확인 필요’가 아닌 학생의 다음 청구서를 자동으로 발행하고 학부모에게 알림을 보내요. 신규는
            입실일부터 말일까지 일할로(15일 이후 입실은 다음 달까지 한 청구서로) 나가요. 청구 시작일을 정해야 하는 기존
            원생, 미납이 있는 학생, 퇴원 예정인 학생, 청구 제외로 둔 학생은 건너뛰어요. 세 달 선등록은 처음 한 번 직접
            발행하면 그 뒤로는 같은 세 달(할인 금액)로 이어서 나가요.
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

function StudentFees({ students }: { students: AdminTuitionStudent[] }) {
  const [query, setQuery] = useStickyState("tuition-fees:query", "");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.name.toLowerCase().includes(q) || s.grade.toLowerCase().includes(q));
  }, [students, query]);
  // 목록에서 사라진 학생(퇴원 등)은 선택에서 뺀다
  const selectedIds = students.filter((s) => selected.has(s.id)).map((s) => s.id);
  const allShownSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleShown() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of filtered) {
        if (allShownSelected) next.delete(s.id);
        else next.add(s.id);
      }
      return next;
    });
  }

  return (
    <Section
      title="학생별 수강료·청구 시작일"
      count={students.length}
      description="월 수강료를 비워 두면 반 금액을 써요(형제 할인처럼 다르게 받을 때만 적어 주세요). 청구 시작일은 시스템을 쓰기 전부터 다닌 학생이나 휴원 뒤 복귀처럼 다음 청구를 시작할 날을 정할 때만 써요. 한 번 납부하면 그 뒤로는 납부한 기간에 이어서 청구돼요. 보류 사유를 적으면 자동 청구하지 않고 청구 일정에 ‘확인 필요’로 올려요(지우면 다시 자동). ‘청구 제외’는 청구 일정에서 아예 빠지고, 직접 발행은 할 수 있어요."
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
          {selectedIds.length > 0 && (
            <StudentFeesBulkBar studentIds={selectedIds} onDone={() => setSelected(new Set())} />
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 !pr-0">
                  <Checkbox
                    checked={allShownSelected}
                    onCheckedChange={toggleShown}
                    aria-label={query.trim() ? "검색된 학생 모두 선택" : "학생 모두 선택"}
                  />
                </TableHead>
                <TableHead>학생</TableHead>
                <TableHead>월 수강료 (원)</TableHead>
                <TableHead>청구 시작일</TableHead>
                <TableHead>청구 제외</TableHead>
                <TableHead>보류 사유</TableHead>
                <TableHead>메모</TableHead>
                <TableHead className="text-right">저장</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((student) => (
                <StudentFeeRow
                  // 일괄 입력으로 값이 바뀌면 행을 새로 그려 입력칸에 반영한다
                  key={[student.id, student.monthlyFee, student.billingAnchor, student.holdReason, student.billingPaused, student.memo].join("|")}
                  student={student}
                  selected={selected.has(student.id)}
                  onToggle={() => toggle(student.id)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}

type BulkField = TuitionProfileBulkInput["field"];

const BULK_FIELD_LABEL: Record<BulkField, string> = {
  billingAnchor: "청구 시작일",
  monthlyFee: "월 수강료",
  holdReason: "보류 사유",
  billingPaused: "청구 제외",
};

/** 고른 학생 모두에게 한 항목을 같은 값으로 — 비워 두고 적용하면 그 항목을 지운다 */
function StudentFeesBulkBar({ studentIds, onDone }: { studentIds: string[]; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [field, setField] = useState<BulkField>("billingAnchor");
  const [anchor, setAnchor] = useState<string | null>(null);
  const [fee, setFee] = useState("");
  const [hold, setHold] = useState("");
  const [paused, setPaused] = useState<"true" | "false">("true");
  const count = studentIds.length;

  function apply() {
    const input: TuitionProfileBulkInput =
      field === "billingAnchor"
        ? { studentIds, field, value: anchor }
        : field === "monthlyFee"
          ? { studentIds, field, value: toAmount(fee) }
          : field === "holdReason"
            ? { studentIds, field, value: hold.trim() || null }
            : { studentIds, field, value: paused === "true" };
    startTransition(async () => {
      const res = await callTuition(() => updateTuitionProfilesBulk(input));
      if (res.ok) {
        toast.success(`${res.data.updated}명의 ${BULK_FIELD_LABEL[field]}을 바꿨어요`);
        onDone();
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x2 border-b border-stroke-neutral-muted bg-bg-layer-fill px-x4 py-x3">
      <span className="t4-bold text-fg-neutral">{count}명 선택</span>
      <Select value={field} onValueChange={(value) => setField(value as BulkField)} disabled={pending}>
        <SelectTrigger aria-label="일괄로 바꿀 항목" className="h-8 w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(BULK_FIELD_LABEL) as BulkField[]).map((key) => (
            <SelectItem key={key} value={key}>
              {BULK_FIELD_LABEL[key]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {field === "billingAnchor" && (
        <DatePicker size="sm" aria-label="일괄 청구 시작일" value={anchor} onChange={setAnchor} disabled={pending} placeholder="날짜 선택 (비우면 지움)" />
      )}
      {field === "monthlyFee" && (
        <MoneyInput
          aria-label="일괄 월 수강료"
          value={fee}
          onValueChange={setFee}
          disabled={pending}
          placeholder="비우면 반 금액"
          className="h-8 w-40"
        />
      )}
      {field === "holdReason" && (
        <Input
          aria-label="일괄 보류 사유"
          value={hold}
          maxLength={100}
          disabled={pending}
          onChange={(e) => setHold(e.target.value)}
          placeholder="비우면 보류를 풀어요"
          className="h-8 w-56"
        />
      )}
      {field === "billingPaused" && (
        <Select value={paused} onValueChange={(value) => setPaused(value as "true" | "false")} disabled={pending}>
          <SelectTrigger aria-label="일괄 청구 제외" className="h-8 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">청구 제외</SelectItem>
            <SelectItem value="false">제외 해제</SelectItem>
          </SelectContent>
        </Select>
      )}
      <Button size="xs" onClick={apply} disabled={pending}>
        {pending ? "적용 중…" : `${count}명에게 적용`}
      </Button>
      <Button variant="ghost" size="xs" onClick={onDone} disabled={pending}>
        선택 해제
      </Button>
    </div>
  );
}

function StudentFeeRow({
  student,
  selected,
  onToggle,
}: {
  student: AdminTuitionStudent;
  selected: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fee, setFee] = useState(student.monthlyFee === null ? "" : String(student.monthlyFee));
  const [paused, setPaused] = useState(student.billingPaused);
  const [anchor, setAnchor] = useState(student.billingAnchor ?? "");
  const [hold, setHold] = useState(student.holdReason ?? "");
  const [memo, setMemo] = useState(student.memo ?? "");

  const dirty =
    toAmount(fee) !== student.monthlyFee ||
    paused !== student.billingPaused ||
    anchor !== (student.billingAnchor ?? "") ||
    hold.trim() !== (student.holdReason ?? "") ||
    memo.trim() !== (student.memo ?? "");

  function save() {
    startTransition(async () => {
      const res = await callTuition(() =>
        updateTuitionProfile({
          studentId: student.id,
          monthlyFee: toAmount(fee),
          billingPaused: paused,
          memo: memo.trim() || null,
          billingAnchor: anchor || null,
          holdReason: hold.trim() || null,
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
    <TableRow data-state={selected ? "selected" : undefined}>
      <TableCell className="w-10 !pr-0">
        <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`${student.name} 선택`} />
      </TableCell>
      <TableCell>
        <StudentCell student={student} />
      </TableCell>
      <TableCell>
        <MoneyInput
          aria-label={`${student.name} 월 수강료`}
          value={fee}
          onValueChange={setFee}
          disabled={pending}
          placeholder={`${student.planName} ${won(student.effectiveMonthlyFee)}`}
          className="h-9 w-40"
        />
      </TableCell>
      <TableCell>
        <DatePicker
          size="sm"
          aria-label={`${student.name} 청구 시작일`}
          value={anchor || null}
          disabled={pending}
          onChange={(value) => setAnchor(value ?? "")}
          placeholder="없음"
          className="h-9 w-[8.75rem]"
        />
        <p className="mt-x1 flex items-center gap-x1_5 whitespace-nowrap t3-regular tabular-nums text-fg-neutral-subtle">
          {student.hasOpenInvoice ? "미납 청구서 있음" : `다음 청구 ${dotDate(student.nextPeriodStart)}부터`}
          {anchor && (
            <button
              type="button"
              className="t3-medium text-fg-neutral-muted underline-offset-2 hover:underline disabled:opacity-50"
              onClick={() => setAnchor("")}
              disabled={pending}
            >
              지우기
            </button>
          )}
        </p>
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
          aria-label={`${student.name} 보류 사유`}
          value={hold}
          maxLength={100}
          disabled={pending}
          onChange={(e) => setHold(e.target.value)}
          placeholder="예: 다음 달 반 변경 상담 중"
          className="h-9 min-w-40"
        />
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

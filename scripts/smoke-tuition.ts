/**
 * 수강료 코어 스모크 — 실제 DB 트랜잭션·락으로 결제·경합·환불 흐름을 돌려 본다 (결제사는 모의 결제).
 *
 * 개발 DB 전용. 합성 학생(__SMOKE_TUITION_*)만 만들고, 끝나면(실패해도) 전부 지운다. 저장소 루트에서:
 *   npx tsx --env-file=.env.development.local scripts/smoke-tuition.ts
 *
 * 단위 테스트(vitest)는 prisma 를 흉내 내므로 조건부 갱신·advisory lock 이 실제로 한 건만 통과시키는지는
 * 여기서 확인한다. 동시 요청은 Promise.allSettled 로 겹쳐 보낸다.
 */
import { createHash } from "node:crypto";

// 운영 Supabase project-ref 의 SHA-256 (scripts/db-push.mjs 와 같은 값 — 공개 저장소라 원문 대신 해시)
const PROD_PROJECT_REF_SHA256 = "37276d3cbb4b3ab00f9978c8eb33b48f41a1a852506ebb19a9b890cae6db5247";

function assertDevDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL 이 없습니다. --env-file=.env.development.local 로 실행하세요");
  const isProd = url
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((part) => createHash("sha256").update(part).digest("hex") === PROD_PROJECT_REF_SHA256);
  if (isProd) throw new Error("운영 DB 에서는 실행할 수 없습니다");
  if (process.env.NODE_ENV === "production") throw new Error("운영 환경에서는 실행할 수 없습니다");
}

let passed = 0;
function check(condition: unknown, label: string): void {
  if (!condition) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`  ok  ${label}`);
}

async function waitFor(label: string, condition: () => Promise<boolean>, timeoutMs = 8_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`FAIL: 시간 초과 — ${label}`);
}

async function main() {
  assertDevDatabase();
  process.env.TUITION_PROVIDER = "mock";
  delete process.env.TOSS_SECRET_KEY;

  const { prisma } = await import("@/lib/prisma");
  const core = await import("@/lib/tuition/core");
  const mock = await import("@/lib/tuition/mock-provider");
  const { TuitionError } = await import("@/lib/tuition/types");
  const { getTuitionProvider } = await import("@/lib/tuition/provider-registry");
  // 주변 환경에 결제선생 키가 있어도 앞부분은 토스식 모의 결제로 돈다 (TUITION_PROVIDER=mock)
  const calc = await import("@/lib/tuition/calc");

  const provider = getTuitionProvider();
  if (provider?.name !== "mock") throw new Error("모의 결제사가 선택되지 않았습니다");

  const actor = { id: "smoke-staff", name: "스모크" };
  const parent = "smoke-parent";
  const names = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"].map(
    (s) => `__SMOKE_TUITION_${s}__`,
  );

  const cleanup = async () => {
    const students = await prisma.student.findMany({ where: { name: { in: names } }, select: { id: true } });
    const studentIds = students.map((s) => s.id);
    if (studentIds.length === 0) return;
    const invoices = await prisma.tuitionInvoice.findMany({
      where: { studentId: { in: studentIds } },
      select: { id: true },
    });
    const invoiceIds = invoices.map((i) => i.id);
    await prisma.tuitionCashReceipt.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.tuitionRefund.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.tuitionPayment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.tuitionEvent.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.tuitionInvoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
  };
  await cleanup(); // 이전 실행이 중간에 죽었을 때 남은 것

  // J·K 는 알림톡 발송을 보므로 휴대폰 형식 번호(실제로 쓰이지 않는 000 국번)를 넣는다 — 모의 결제선생이라 아무 것도 나가지 않는다
  const makeStudent = (name: string) =>
    prisma.student.create({
      data: {
        name,
        grade: "테스트",
        status: "ACTIVE",
        parentPhone: /_[JK]__$/.test(name) ? "010-0000-0000" : "000-0000-0000",
        startDate: new Date(),
      },
      select: { id: true },
    });
  const codeOf = (result: PromiseSettledResult<unknown>) =>
    result.status === "rejected" && result.reason instanceof TuitionError ? result.reason.code : null;
  const invoiceOf = (id: string) => prisma.tuitionInvoice.findUniqueOrThrow({ where: { id } });
  const paymentsOf = (invoiceId: string) =>
    prisma.tuitionPayment.findMany({ where: { invoiceId }, orderBy: { createdAt: "asc" } });
  const productKeyOf = async (paymentId: string) =>
    (await prisma.tuitionPayment.findUniqueOrThrow({ where: { id: paymentId } })).providerProductKey as string;
  const issue = (studentId: string, months = 1) =>
    core.issueInvoice(
      { studentId, periodStart: "2026-11-01", months, monthlyFee: 690_000, dueDate: "2026-11-05", notify: false },
      actor,
    );

  try {
    const [a, b, c, d, e, f, g, h, i, j, k, l, m, n] = await Promise.all(names.map(makeStudent));

    console.log("\n1. 발행 — 선결제 금액, 기간 겹침, 동시 발행");
    const inv1 = await issue(a.id, 3);
    const row1 = await invoiceOf(inv1.invoiceId);
    check(row1.amount === 2_070_000 && row1.months === 3, "3개월 선결제 금액 2,070,000원");
    check(calc.dateKey(row1.periodEnd) === "2027-01-31", "이용 종료일 2027-01-31");
    const overlap = await Promise.allSettled([issue(a.id, 1)]);
    check(codeOf(overlap[0]) === "PERIOD_OVERLAP", "같은 기간 재발행은 PERIOD_OVERLAP");
    const race = await Promise.allSettled([issue(b.id), issue(b.id), issue(b.id)]);
    check(race.filter((r) => r.status === "fulfilled").length === 1, "동시에 세 번 발행해도 한 건만 생성");
    const invB = (race.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ invoiceId: string }>).value;

    console.log("\n2. 결제 시작 — 동시에 눌러도 링크 하나");
    const checkouts = await Promise.all([
      core.startCheckout({ invoiceId: inv1.invoiceId, studentId: a.id, authUserId: parent, baseUrl: "http://localhost:3000" }),
      core.startCheckout({ invoiceId: inv1.invoiceId, studentId: a.id, authUserId: parent, baseUrl: "http://localhost:3000" }),
    ]);
    check(checkouts[0].payUrl === checkouts[1].payUrl, "두 요청이 같은 결제 링크를 받음");
    check((await paymentsOf(inv1.invoiceId)).length === 1, "결제 행은 하나");
    const wrongChild = await Promise.allSettled([
      core.startCheckout({ invoiceId: inv1.invoiceId, studentId: b.id, authUserId: parent }),
    ]);
    check(codeOf(wrongChild[0]) === "NOT_FOUND", "다른 자녀의 청구서는 결제 시작 불가");

    console.log("\n3. 결제 완료 — 웹훅 중복·동기화 동시 도착");
    const order1 = mock.mockPay(await productKeyOf(checkouts[0].paymentId), "card");
    await Promise.all([
      core.handleProviderWebhook(order1.orderKey),
      core.handleProviderWebhook(order1.orderKey),
      core.syncInvoice(inv1.invoiceId, "SYNC", { force: true }),
    ]);
    const paid1 = await invoiceOf(inv1.invoiceId);
    check(paid1.status === "PAID" && paid1.paidAmount === 2_070_000, "납부 완료, 납부액 일치");
    check(paid1.paidPaymentId === checkouts[0].paymentId, "납부 확정 결제가 그 링크 결제");
    check(paid1.coverageEnd !== null && calc.dateKey(paid1.coverageEnd) === "2027-01-31", "이용 종료일 설정");
    const doneEvents = await prisma.tuitionEvent.count({
      where: { invoiceId: inv1.invoiceId, type: "PAYMENT_DONE" },
    });
    check(doneEvents === 1, "결제 완료 기록은 한 번만");
    const replay = await core.handleProviderWebhook(order1.orderKey);
    check(replay.outcome === "NOOP", "웹훅을 다시 받아도 변화 없음");

    console.log("\n4. 현장 확인 뒤 도착한 온라인 결제 — 자동 환불");
    const coB = await core.startCheckout({ invoiceId: invB.invoiceId, studentId: b.id, authUserId: parent });
    const orderB = mock.mockPay(await productKeyOf(coB.paymentId), "card"); // 결제는 됐지만 웹훅이 아직 안 옴
    const onsiteB = await core.confirmOnsitePayment({ invoiceId: invB.invoiceId, method: "LOCAL_CURRENCY" }, actor);
    const dup = await core.handleProviderWebhook(orderB.orderKey);
    check(dup.outcome === "DUPLICATE", "늦게 온 온라인 결제는 중복으로 분류");
    await waitFor("자동 환불 완료", async () => {
      const refund = await prisma.tuitionRefund.findFirst({ where: { paymentId: coB.paymentId } });
      return refund?.status === "DONE";
    });
    const paidB = await invoiceOf(invB.invoiceId);
    check(paidB.status === "PAID" && paidB.paidPaymentId === onsiteB.paymentId, "청구서는 현장 결제로 납부 유지");
    check(paidB.refundedAmount === 0, "중복 결제 환불은 청구서 환불액에 포함되지 않음");
    const dupRow = await prisma.tuitionPayment.findUniqueOrThrow({ where: { id: coB.paymentId } });
    check(dupRow.isDuplicate && dupRow.status === "DONE" && dupRow.refundedAmount === 690_000, "중복 결제 전액 환불 기록");
    check((await provider.getOrder(orderB.orderKey))?.status === "CANCELED", "결제사 주문도 취소됨");
    await core.handleProviderWebhook(orderB.orderKey);
    check((await prisma.tuitionRefund.count({ where: { paymentId: coB.paymentId } })) === 1, "웹훅을 다시 받아도 환불은 한 건");

    console.log("\n5. 현장 확인과 온라인 결제 웹훅이 동시에 도착");
    const invC = await issue(c.id);
    const coC = await core.startCheckout({ invoiceId: invC.invoiceId, studentId: c.id, authUserId: parent });
    const orderC = mock.mockPay(await productKeyOf(coC.paymentId), "card");
    const both = await Promise.allSettled([
      core.confirmOnsitePayment({ invoiceId: invC.invoiceId, method: "ONSITE_CARD" }, actor),
      core.handleProviderWebhook(orderC.orderKey),
    ]);
    const paidC = await invoiceOf(invC.invoiceId);
    check(paidC.status === "PAID" && paidC.paidPaymentId !== null, "한 건만 납부로 확정");
    if (both[0].status === "rejected") {
      check(codeOf(both[0]) === "ALREADY_PAID", "진 쪽(현장 확인)은 ALREADY_PAID 로 거절");
      check(paidC.paidPaymentId === coC.paymentId, "온라인 결제가 납부로 확정");
    } else {
      await waitFor("진 쪽(온라인 결제) 자동 환불", async () => {
        const refund = await prisma.tuitionRefund.findFirst({ where: { paymentId: coC.paymentId } });
        return refund?.status === "DONE";
      });
      check(true, "진 쪽(온라인 결제)은 자동 환불");
    }
    const doneRows = (await paymentsOf(invC.invoiceId)).filter((p) => p.status === "DONE" && !p.isDuplicate);
    check(doneRows.length === 1, "납부로 인정된 결제는 정확히 한 건");

    console.log("\n6. 환불 — 일할 제안, 초과·동시 요청, 타임아웃, 거절");
    const suggestion = calc.suggestRefund({
      policy: "DAILY",
      paidAmount: paid1.paidAmount,
      refundable: paid1.paidAmount,
      periodStart: paid1.periodStart,
      periodEnd: paid1.periodEnd,
      months: paid1.months,
      lastUsedDate: calc.parseDateKey("2026-11-30"),
    });
    check(suggestion.amount === 1_395_000, "일할 제안 1,395,000원 (92일 중 30일 이용)");
    const refundRace = await Promise.allSettled([
      core.requestRefund({ invoiceId: inv1.invoiceId, amount: 1_395_000, reason: "스모크", lastUsedDate: "2026-11-30" }, actor),
      core.requestRefund({ invoiceId: inv1.invoiceId, amount: 1_395_000, reason: "스모크", lastUsedDate: "2026-11-30" }, actor),
    ]);
    const refundOk = refundRace.filter((r) => r.status === "fulfilled").length;
    const afterRace = await invoiceOf(inv1.invoiceId);
    check(refundOk === 1 && afterRace.refundedAmount === 1_395_000, "동시에 두 번 환불 요청해도 한 번만 환불");
    check(afterRace.status === "PARTIALLY_REFUNDED", "일부 환불 상태");
    check(afterRace.coverageEnd !== null && calc.dateKey(afterRace.coverageEnd) === "2026-11-30", "이용 종료일이 마지막 이용일로 당겨짐");
    const over = await Promise.allSettled([
      core.requestRefund({ invoiceId: inv1.invoiceId, amount: 700_000, reason: "초과" }, actor),
    ]);
    check(codeOf(over[0]) === "REFUND_EXCEEDS", "환불 가능액 초과는 거절");

    mock.mockSetCancelBehavior("timeout");
    const timedOut = await core.requestRefund({ invoiceId: inv1.invoiceId, amount: 100_000, reason: "타임아웃" }, actor);
    check(timedOut.status === "PENDING", "결제사 응답이 없으면 처리 중으로 남음");
    const during = await Promise.allSettled([
      core.requestRefund({ invoiceId: inv1.invoiceId, amount: 1_000, reason: "겹침" }, actor),
    ]);
    check(codeOf(during[0]) === "REFUND_IN_PROGRESS", "처리 중 환불이 있으면 새 환불 거절");
    const reconciled = await core.runTuitionReconcile();
    check(reconciled.synced >= 1, "대조 작업이 결제사 취소 내역을 반영");
    const settled = await prisma.tuitionRefund.findUniqueOrThrow({ where: { id: timedOut.refundId } });
    check(settled.status === "DONE", "처리 중이던 환불이 완료로 확정");
    check((await invoiceOf(inv1.invoiceId)).refundedAmount === 1_495_000, "환불 합계 1,495,000원 (중복 반영 없음)");
    await core.handleProviderWebhook(order1.orderKey);
    await core.runTuitionReconcile();
    check((await invoiceOf(inv1.invoiceId)).refundedAmount === 1_495_000, "웹훅·대조를 다시 돌려도 합계 그대로");

    mock.mockSetCancelBehavior("reject");
    const rejected = await core.requestRefund({ invoiceId: inv1.invoiceId, amount: 50_000, reason: "거절" }, actor);
    check(rejected.status === "FAILED" && !!rejected.failMessage, "결제사 거절은 실패 + 사유");
    check((await invoiceOf(inv1.invoiceId)).refundedAmount === 1_495_000, "실패한 환불은 합계에 반영되지 않음");

    const manual = await Promise.allSettled([
      core.requestRefund({ invoiceId: invB.invoiceId, amount: 690_000, reason: "현장 환불", lastUsedDate: null }, actor),
    ]);
    check(codeOf(manual[0]) === "INVALID_INPUT", "현장 결제 환불은 환불 완료 확인이 있어야 함");
    const manualOk = await core.requestRefund(
      { invoiceId: invB.invoiceId, amount: 690_000, reason: "현장 환불", lastUsedDate: null, manualConfirmed: true },
      actor,
    );
    const refundedB = await invoiceOf(invB.invoiceId);
    check(manualOk.status === "DONE" && refundedB.status === "REFUNDED", "현장 결제 전액 환불");
    check(refundedB.coverageEnd === null, "이용 전 환불이면 이용 기간 없음");
    const reissue = await issue(b.id);
    check(!!reissue.invoiceId, "전액 환불한 기간은 다시 청구 가능");

    console.log("\n7. 가상계좌 — 입금 대기 → 입금");
    const invD = await issue(d.id);
    const coD = await core.startCheckout({ invoiceId: invD.invoiceId, studentId: d.id, authUserId: parent });
    const orderD = mock.mockPay(await productKeyOf(coD.paymentId), "virtual-account");
    await core.syncInvoice(invD.invoiceId, "SYNC", { force: true });
    const waiting = await prisma.tuitionPayment.findUniqueOrThrow({ where: { id: coD.paymentId } });
    check(waiting.status === "PENDING" && !!waiting.depositAccount, "입금 대기 안내 저장");
    check((await invoiceOf(invD.invoiceId)).status === "REQUESTED", "입금 전에는 미납");
    mock.mockDeposit(orderD.orderKey);
    const deposited = await core.handleProviderWebhook(orderD.orderKey);
    check(deposited.outcome === "PAID" && (await invoiceOf(invD.invoiceId)).status === "PAID", "입금되면 납부 완료");

    console.log("\n8. 현장 결제 신청 · 청구 취소 뒤 도착한 결제");
    const invE = await issue(e.id);
    const coE = await core.startCheckout({ invoiceId: invE.invoiceId, studentId: e.id, authUserId: parent });
    const req1 = await core.requestOnsitePayment({ invoiceId: invE.invoiceId, studentId: e.id, authUserId: parent, method: "LOCAL_CURRENCY" });
    const req2 = await core.requestOnsitePayment({ invoiceId: invE.invoiceId, studentId: e.id, authUserId: parent, method: "LOCAL_CURRENCY" });
    check(req1.paymentId === req2.paymentId, "현장 결제 신청을 두 번 해도 한 건");
    const closedLink = await prisma.tuitionPayment.findUniqueOrThrow({ where: { id: coE.paymentId } });
    check(closedLink.status === "CANCELED" && closedLink.closedReason === "ONSITE_REQUESTED", "신청하면 열려 있던 링크는 닫힘");
    const blocked = await Promise.allSettled([
      core.startCheckout({ invoiceId: invE.invoiceId, studentId: e.id, authUserId: parent }),
    ]);
    check(codeOf(blocked[0]) === "ONSITE_REQUEST_EXISTS", "신청 중에는 온라인 결제 시작 불가");
    await core.withdrawOnsiteRequest({ paymentId: req1.paymentId, studentId: e.id, authUserId: parent });
    const coE2 = await core.startCheckout({ invoiceId: invE.invoiceId, studentId: e.id, authUserId: parent });
    check(coE2.paymentId !== coE.paymentId, "철회 뒤에는 새 링크로 결제 가능");
    const orderE = mock.mockPay(await productKeyOf(coE2.paymentId), "card");
    await core.cancelInvoice(invE.invoiceId, "스모크 취소", actor);
    check((await invoiceOf(invE.invoiceId)).status === "CANCELED", "청구 취소");
    const late = await core.handleProviderWebhook(orderE.orderKey);
    check(late.outcome === "DUPLICATE", "취소된 청구서에 들어온 결제는 납부로 잡지 않음");
    await waitFor("취소된 청구서 결제 자동 환불", async () => {
      const refund = await prisma.tuitionRefund.findFirst({ where: { paymentId: coE2.paymentId } });
      return refund?.status === "DONE";
    });
    check((await invoiceOf(invE.invoiceId)).status === "CANCELED", "청구서는 취소 상태 유지");

    console.log("\n9. 안내 — 도달 기록, 자동 안내 중복 방지");
    const invF = await issue(f.id);
    const notice = await core.sendTuitionNotices([invF.invoiceId], "REMIND", actor);
    check(notice.length === 1 && notice[0].sent === 0, "연결된 학부모가 없으면 도달 0으로 기록");
    const first = await core.sendTuitionNotice({ invoiceId: invF.invoiceId, kind: "REMIND", dedupKey: `SMOKE:${invF.invoiceId}` });
    const second = await core.sendTuitionNotice({ invoiceId: invF.invoiceId, kind: "REMIND", dedupKey: `SMOKE:${invF.invoiceId}` });
    check(!first.skipped && second.skipped, "같은 자동 안내는 한 번만");

    console.log("\n10. DB 제약 — 코드가 실수해도 어긋난 금액은 거부");
    const violation = await prisma.tuitionInvoice
      .update({ where: { id: invF.invoiceId }, data: { refundedAmount: 1 } })
      .then(() => false)
      .catch(() => true);
    check(violation, "납부액보다 큰 환불액은 DB 가 거부");

    console.log("\n11. 락 — 다른 연결이 같은 학생을 처리하는 동안에는 기다린다");
    // 운영에서는 서버 인스턴스마다 DB 연결이 따로라, 락이 연결을 넘어 걸리는지를 별도 연결로 확인한다
    const { Client } = await import("pg");
    const holder = new Client({ connectionString: process.env.DATABASE_URL });
    await holder.connect();
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`tuition:${f.id}`]);
      const startedAt = Date.now();
      let finished = false;
      const waitingCall = core
        .confirmOnsitePayment({ invoiceId: invF.invoiceId, method: "CASH" }, actor)
        .finally(() => {
          finished = true;
        });
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      check(!finished, "락이 잡혀 있는 동안 납부 확정이 진행되지 않음");
      await holder.query("COMMIT");
      await waitingCall;
      check(Date.now() - startedAt >= 1_400, "락이 풀린 뒤에 처리됨");
      check((await invoiceOf(invF.invoiceId)).status === "PAID", "기다린 요청은 정상 처리");
    } finally {
      await holder.query("ROLLBACK").catch(() => undefined);
      await holder.end();
    }

    console.log("\n12. 추가 항목 · 안내 메시지 · 청구서 링크");
    const invG = await core.issueInvoice(
      {
        studentId: g.id,
        periodStart: "2026-11-01",
        months: 1,
        monthlyFee: 690_000,
        discount: 20_000,
        dueDate: "2026-11-05",
        extraItems: [{ name: "교재비", amount: 30_000 }],
        parentMessage: "교재비가 포함됐어요",
        notify: false,
      },
      actor,
    );
    const rowG = await invoiceOf(invG.invoiceId);
    check(rowG.amount === 700_000, "청구 금액 = 수강료 + 추가 항목 − 할인 (700,000원)");
    check(calc.readExtraItems(rowG.extraItems).length === 1 && rowG.parentMessage === "교재비가 포함됐어요", "추가 항목·안내 메시지 저장");
    check(!!rowG.shareToken && rowG.shareToken.length >= 32 && !rowG.autoIssued, "발행하면 청구서 링크 토큰이 생김");
    const bill = await core.getBillByToken(rowG.shareToken as string);
    check(bill?.amount === 700_000 && bill.tuitionAmount === 690_000 && bill.extraItems[0]?.name === "교재비", "링크로 청구 내용 조회");
    check(bill?.studentName !== names[6] && bill?.status === "REQUESTED", "링크 화면의 학생 이름은 가려짐");
    check((await core.findInvoiceByToken(`${rowG.shareToken}x`)) === null, "틀린 토큰으로는 찾을 수 없음");
    check((await core.ensureBillToken(invG.invoiceId)) === rowG.shareToken, "이미 있는 토큰은 바뀌지 않음");

    // 로그인 없는 링크에서 결제 (authUserId 없음)
    const coG = await core.startCheckout({ invoiceId: invG.invoiceId, studentId: g.id, authUserId: null });
    const orderG = mock.mockPay(await productKeyOf(coG.paymentId), "card");
    await core.handleProviderWebhook(orderG.orderKey);
    const paidG = await prisma.tuitionPayment.findUniqueOrThrow({ where: { id: coG.paymentId } });
    check((await invoiceOf(invG.invoiceId)).status === "PAID", "링크에서 결제해도 납부 완료");
    check(!!paidG.cardIssuer && !!paidG.approvalNumber && paidG.installmentMonths === 0, "카드사·할부·승인번호 저장");
    check((await core.getBillByToken(rowG.shareToken as string))?.status === "PAID", "링크 화면도 납부 완료로 바뀜");

    const autoG = await core.issueInvoice(
      { studentId: g.id, periodStart: "2026-12-01", months: 1, monthlyFee: 690_000, dueDate: "2026-12-05", notify: false },
      null,
    );
    const autoRow = await invoiceOf(autoG.invoiceId);
    check(autoRow.autoIssued && autoRow.issuedById === null && !!autoRow.shareToken, "발행자 없이 발행하면 자동 청구로 표시");

    console.log("\n13. 현금영수증 — 대상 수납, 발급 금액, 상태 전이");
    const cashF = (await paymentsOf(invF.invoiceId)).find((p) => p.status === "DONE");
    if (!cashF) throw new Error("FAIL: 현금 수납 건이 없습니다");
    const onCard = await Promise.allSettled([
      core.requestCashReceipt({ paymentId: coG.paymentId, purpose: "INCOME", identifier: "010-1234-5678" }, actor),
    ]);
    check(codeOf(onCard[0]) === "INVALID_INPUT", "카드 결제에는 현금영수증을 등록할 수 없음");
    const requests = await Promise.allSettled([
      core.requestCashReceipt({ paymentId: cashF.id, purpose: "INCOME", identifier: "010-1234-5678" }, actor),
      core.requestCashReceipt({ paymentId: cashF.id, purpose: "INCOME", identifier: "010-1234-5678" }, actor),
    ]);
    check(requests.every((r) => r.status === "fulfilled"), "동시에 두 번 등록해도 오류 없이 처리");
    const receipts = await prisma.tuitionCashReceipt.findMany({ where: { paymentId: cashF.id } });
    check(receipts.length === 1 && receipts[0].status === "REQUESTED" && receipts[0].amount === 690_000, "결제당 한 건, 발급 필요 690,000원");
    check(receipts[0].identifier === "01012345678", "번호는 숫자만 저장");

    await core.requestRefund(
      { invoiceId: invF.invoiceId, amount: 90_000, reason: "일부 환불", manualConfirmed: true },
      actor,
    );
    await core.markCashReceiptIssued(receipts[0].id, "A12345678", actor);
    const issuedReceipt = await prisma.tuitionCashReceipt.findUniqueOrThrow({ where: { id: receipts[0].id } });
    check(issuedReceipt.status === "ISSUED" && issuedReceipt.amount === 600_000, "신청 뒤 환불되면 남은 수납액(600,000원)으로 발급");
    check(issuedReceipt.supplyAmount + issuedReceipt.taxAmount === issuedReceipt.amount, "공급가액 + 세액 = 발급 금액");
    const again = await Promise.allSettled([core.markCashReceiptIssued(receipts[0].id, "B12345678", actor)]);
    check(again[0].status === "rejected", "이미 발급 완료된 건은 다시 발급 처리할 수 없음");
    const editIssued = await Promise.allSettled([
      core.requestCashReceipt({ paymentId: cashF.id, purpose: "EXPENSE", identifier: "123-45-67890" }, actor),
    ]);
    check(editIssued[0].status === "rejected", "발급 완료된 건은 고칠 수 없음");
    const badSplit = await prisma.tuitionCashReceipt
      .update({ where: { id: receipts[0].id }, data: { supplyAmount: 1 } })
      .then(() => false)
      .catch(() => true);
    check(badSplit, "공급가액 + 세액이 금액과 다르면 DB 가 거부");
    await core.cancelCashReceipt(receipts[0].id, "환불로 재발급", actor);
    const cancelAgain = await Promise.allSettled([core.cancelCashReceipt(receipts[0].id, "중복", actor)]);
    check(cancelAgain[0].status === "rejected", "취소는 한 번만");
    await core.requestCashReceipt({ paymentId: cashF.id, purpose: "EXPENSE", identifier: "123-45-67890" }, actor);
    const reRequested = await prisma.tuitionCashReceipt.findMany({ where: { paymentId: cashF.id } });
    check(
      reRequested.length === 1 && reRequested[0].status === "REQUESTED" && reRequested[0].approvalNumber === null,
      "취소 뒤 다시 등록하면 같은 건이 발급 필요로 돌아감",
    );

    // ── 여기부터 결제선생 — 같은 코어를 결제선생 연동 코드(payssam.ts)로 돌린다. 요청은 모의 결제선생(메모리)으로 간다 ──
    process.env.TUITION_PROVIDER = "payssam";
    process.env.PAYSSAM_BASE_URL = "mock";
    process.env.PAYSSAM_TALK = "1";
    const ps = await import("@/lib/tuition/payssam-mock");
    ps.payssamMockReset();
    const origin = "http://localhost:3999";
    const linkRowOf = async (invoiceId: string) =>
      (await paymentsOf(invoiceId)).filter((p) => p.method === "LINK").at(-1) ?? null;
    const payBill = async (invoiceId: string, studentId: string) => {
      const checkout = await core.startCheckout({ invoiceId, studentId, authUserId: parent, baseUrl: origin });
      const billId = await productKeyOf(checkout.paymentId);
      ps.payssamMockPay(billId);
      await core.handleProviderWebhook(billId);
      return { checkout, billId };
    };

    console.log("\n14. 결제선생 — 청구서 생성 · 결제 콜백");
    const payssam = getTuitionProvider();
    check(payssam?.name === "payssam" && !payssam.partialCancel && payssam.linkIsOrder && payssam.canNotify, "결제사가 결제선생으로 선택됨");
    const invH = await issue(h.id);
    const tokenH = (await invoiceOf(invH.invoiceId)).shareToken;
    const coH = await core.startCheckout({ invoiceId: invH.invoiceId, studentId: h.id, authUserId: parent, baseUrl: origin });
    const billH = await productKeyOf(coH.paymentId);
    check(/^u[0-9a-z]{19}$/.test(billH) && coH.payUrl.endsWith(`/pay/${billH}`), "billId 20자 · 결제 주소 수신");
    const mockH = ps.payssamMockGet(billH);
    check(mockH?.sendType === "URL" && mockH.price === 690_000 && mockH.productName === "11월 수강료", "청구 사유·금액 전달");
    check(mockH?.callbackUrl === `${origin}/api/webhooks/payssam`, "콜백 주소 전달");
    check(!!tokenH && mockH?.pageRedirectUrl === `${origin}/bill/${tokenH}`, "결제 뒤 돌아올 주소 = 청구서 링크");
    const coH2 = await core.startCheckout({ invoiceId: invH.invoiceId, studentId: h.id, authUserId: parent, baseUrl: origin });
    check(coH2.payUrl === coH.payUrl && (await paymentsOf(invH.invoiceId)).length === 1, "다시 눌러도 같은 청구서");
    ps.payssamMockPay(billH);
    await Promise.all([core.handleProviderWebhook(billH), core.handleProviderWebhook(billH)]);
    const paidH = await invoiceOf(invH.invoiceId);
    const rowH = await prisma.tuitionPayment.findUniqueOrThrow({ where: { id: coH.paymentId } });
    check(paidH.status === "PAID" && paidH.paidPaymentId === coH.paymentId, "콜백이 겹쳐 와도 한 번만 납부 완료");
    check(rowH.providerOrderKey === billH && rowH.cardIssuer === "현대카드" && !!rowH.approvalNumber, "카드사·승인번호 저장");

    console.log("\n15. 결제선생 — 전액 취소만 가능, 일부 금액은 직접 환불");
    const partialNoConfirm = await Promise.allSettled([
      core.requestRefund({ invoiceId: invH.invoiceId, amount: 100_000, reason: "일부 환불" }, actor),
    ]);
    check(codeOf(partialNoConfirm[0]) === "INVALID_INPUT", "일부 금액은 직접 환불 확인 없이는 거절");
    const partialH = await core.requestRefund(
      { invoiceId: invH.invoiceId, amount: 100_000, reason: "일부 환불", manualConfirmed: true },
      actor,
    );
    const partialRow = await prisma.tuitionRefund.findUniqueOrThrow({ where: { id: partialH.refundId } });
    check(partialH.status === "DONE" && partialRow.method === "MANUAL", "직접 환불로 기록");
    check(ps.payssamMockGet(billH)?.state === "F", "결제선생 결제는 그대로 (취소 요청을 보내지 않음)");
    check((await invoiceOf(invH.invoiceId)).refundedAmount === 100_000, "환불 합계 반영");
    const restNoConfirm = await Promise.allSettled([
      core.requestRefund({ invoiceId: invH.invoiceId, amount: 590_000, reason: "나머지 환불" }, actor),
    ]);
    check(codeOf(restNoConfirm[0]) === "INVALID_INPUT", "이미 일부를 돌려준 결제는 남은 전부도 직접 환불");

    const invI = await issue(i.id);
    const paidI = await payBill(invI.invoiceId, i.id);
    // 취소 요청이 반영된 뒤 응답만 오지 않는 상황
    ps.payssamMockSetFault("timeout", "/bill/cancel");
    const stuckI = await core.requestRefund(
      { invoiceId: invI.invoiceId, amount: 690_000, reason: "입실 전 전액 환불 요청입니다 (사유가 20자를 넘는다)", lastUsedDate: null },
      actor,
    );
    check(stuckI.status === "PENDING" && ps.payssamMockGet(paidI.billId)?.state === "C", "취소 응답을 못 받으면 처리 중으로 남음 (결제선생에는 반영됨)");
    const settledI = await core.processRefund(stuckI.refundId);
    const refundI = await prisma.tuitionRefund.findUniqueOrThrow({ where: { id: stuckI.refundId } });
    check(settledI.status === "DONE" && refundI.method === "PROVIDER", "다시 확인하면 이미 취소된 것을 알아보고 환불 완료 (두 번 취소하지 않음)");
    check(ps.payssamMockGet(paidI.billId)?.state === "C", "결제선생 청구서도 취소 상태");
    const afterI = await invoiceOf(invI.invoiceId);
    check(afterI.status === "REFUNDED" && afterI.refundedAmount === 690_000, "청구서 환불 완료");
    await core.handleProviderWebhook(paidI.billId);
    await core.syncInvoice(invI.invoiceId, "SYNC", { force: true });
    check((await prisma.tuitionRefund.count({ where: { invoiceId: invI.invoiceId } })) === 1, "다시 조회해도 환불은 한 건");

    console.log("\n16. 결제선생 — 카카오 알림톡 청구서");
    const invJ = await issue(j.id);
    const coJ = await core.startCheckout({ invoiceId: invJ.invoiceId, studentId: j.id, authUserId: parent, baseUrl: origin });
    const urlBillJ = await productKeyOf(coJ.paymentId);
    const talkJ = await core.sendInvoiceTalk({ invoiceId: invJ.invoiceId, baseUrl: origin }, actor);
    const talkBillJ = await productKeyOf(talkJ.paymentId);
    check(!talkJ.resent && talkBillJ.startsWith("t") && talkJ.paymentId !== coJ.paymentId, "알림톡용 청구서를 새로 만듦");
    check(ps.payssamMockGet(talkBillJ)?.sendType === "TALK" && ps.payssamMockGet(talkBillJ)?.phone === "01000000000", "학부모 번호로 알림톡 발송");
    check(ps.payssamMockPoints() === 99, "쌤포인트 1 차감");
    await waitFor("앞서 만든 주소용 청구서 파기", async () => ps.payssamMockGet(urlBillJ)?.state === "D");
    check(ps.payssamMockGet(urlBillJ)?.state === "D", "앞서 만든 주소용 청구서는 파기됨 (청구서당 살아 있는 청구서는 하나)");
    const coJ2 = await core.startCheckout({ invoiceId: invJ.invoiceId, studentId: j.id, authUserId: parent, baseUrl: origin });
    check(coJ2.paymentId === talkJ.paymentId && coJ2.payUrl.endsWith(`/pay/${talkBillJ}`), "앱의 결제하기도 알림톡 청구서를 연다");
    const talkJ2 = await core.sendInvoiceTalk({ invoiceId: invJ.invoiceId, baseUrl: origin }, actor);
    check(talkJ2.resent && talkJ2.paymentId === talkJ.paymentId && ps.payssamMockGet(talkBillJ)?.talkCount === 2, "다시 보내면 같은 청구서 재발송");
    const noPhone = await Promise.allSettled([core.sendInvoiceTalk({ invoiceId: invH.invoiceId }, actor)]);
    check(codeOf(noPhone[0]) === "ALREADY_PAID", "납부된 청구서에는 보내지 않음");
    const invK = await issue(k.id);
    ps.payssamMockSetPoints(0);
    const noPoints = await Promise.allSettled([core.sendInvoiceTalk({ invoiceId: invK.invoiceId, baseUrl: origin }, actor)]);
    check(
      codeOf(noPoints[0]) === "PROVIDER_REJECTED" &&
        noPoints[0].status === "rejected" &&
        String((noPoints[0].reason as Error).message).includes("포인트가 부족"),
      "포인트가 부족하면 사유와 함께 실패",
    );
    check((await linkRowOf(invK.invoiceId))?.status === "FAILED", "실패한 발송은 결제 행에 남음");
    ps.payssamMockSetPoints(100);
    const invalidPhone = await Promise.allSettled([core.sendInvoiceTalk({ invoiceId: (await issue(l.id)).invoiceId }, actor)]);
    check(codeOf(invalidPhone[0]) === "INVALID_INPUT", "휴대폰 번호가 아니면 보내지 않음");

    console.log("\n17. 결제선생 — 콜백 누락 · 매니저 사이트 직접 처리");
    const invL = (await prisma.tuitionInvoice.findFirstOrThrow({ where: { studentId: l.id } })).id;
    const coL = await core.startCheckout({ invoiceId: invL, studentId: l.id, authUserId: parent, baseUrl: origin });
    const billL = await productKeyOf(coL.paymentId);
    ps.payssamMockManagerDestroy(billL);
    await core.syncInvoice(invL, "SYNC", { force: true });
    const closedL = await prisma.tuitionPayment.findUniqueOrThrow({ where: { id: coL.paymentId } });
    check(closedL.status === "CANCELED" && closedL.closedReason === "EXPIRED", "매니저 사이트에서 파기한 청구서는 닫힘");
    const coL2 = await core.startCheckout({ invoiceId: invL, studentId: l.id, authUserId: parent, baseUrl: origin });
    const billL2 = await productKeyOf(coL2.paymentId);
    check(coL2.paymentId !== coL.paymentId && billL2 !== billL, "다음 결제는 새 청구서로");
    ps.payssamMockPay(billL2); // 콜백이 오지 않은 결제
    check((await invoiceOf(invL)).status === "REQUESTED", "콜백이 없으면 아직 결제 요청");
    const polled = await core.runTuitionReconcile();
    check(polled.synced >= 1 && (await invoiceOf(invL)).status === "PAID", "대조 작업이 조회로 납부를 반영");

    const invM = await issue(m.id);
    const paidM = await payBill(invM.invoiceId, m.id);
    ps.payssamMockManagerCancel(paidM.billId);
    // 결제된 청구서는 하루에 한 번만 다시 조회한다 — 조회할 때가 된 것으로 맞춘다
    await prisma.tuitionPayment.update({
      where: { id: paidM.checkout.paymentId },
      data: { lastSyncedAt: new Date(Date.now() - 25 * 60 * 60_000) },
    });
    await core.runTuitionReconcile();
    const afterM = await invoiceOf(invM.invoiceId);
    const externalM = await prisma.tuitionRefund.findFirst({ where: { invoiceId: invM.invoiceId } });
    check(externalM?.source === "EXTERNAL" && externalM.amount === 690_000 && externalM.status === "DONE", "매니저 사이트 직접 취소를 환불로 기록");
    check(afterM.status === "REFUNDED" && afterM.needsReview, "청구서는 환불 + 확인 필요로 표시");

    const invN = await issue(n.id);
    const coN = await core.startCheckout({ invoiceId: invN.invoiceId, studentId: n.id, authUserId: parent, baseUrl: origin });
    const billN = await productKeyOf(coN.paymentId);
    ps.payssamMockPay(billN); // 결제는 됐지만 콜백이 오기 전에
    await core.confirmOnsitePayment({ invoiceId: invN.invoiceId, method: "CASH" }, actor); // 현장에서 현금으로도 받음
    await core.handleProviderWebhook(billN);
    // 자동 환불은 응답 뒤에 돈다 — 결제선생 취소와 우리 쪽 환불 기록이 둘 다 끝날 때까지 기다린다
    await waitFor(
      "중복 결제 자동 환불",
      async () => (await prisma.tuitionRefund.count({ where: { paymentId: coN.paymentId, status: "DONE" } })) === 1,
    );
    check(ps.payssamMockGet(billN)?.state === "C", "결제선생 청구서가 취소됨");
    const dupN = await prisma.tuitionPayment.findUniqueOrThrow({ where: { id: coN.paymentId } });
    const afterN = await invoiceOf(invN.invoiceId);
    check(dupN.isDuplicate && dupN.refundedAmount === 690_000, "늦게 반영된 결제선생 결제는 중복 — 결제선생으로 전액 자동 취소");
    check(afterN.status === "PAID" && afterN.paidPaymentId !== coN.paymentId && afterN.refundedAmount === 0, "청구서는 현장 결제로 납부 유지");

    console.log("\n18. 결제선생 현금영수증 — 바로 발급 · 동시 클릭 · 응답 유실 · 취소");
    const crId = reRequested[0].id;
    const crOf = () => prisma.tuitionCashReceipt.findUniqueOrThrow({ where: { id: crId } });
    const liveReceipts = () => ps.payssamMockCashReceipts().filter((r) => r.canceledAt === null);
    check(!!payssam?.cashReceipts, "결제선생은 현금영수증을 바로 발급할 수 있음");
    const issues = await Promise.allSettled([
      core.issueCashReceiptWithProvider(crId, actor),
      core.issueCashReceiptWithProvider(crId, actor),
    ]);
    const crIssued = await crOf();
    const crFirst = ps.payssamMockCashReceipt(crIssued.providerBillId ?? "");
    check(issues.some((r) => r.status === "fulfilled") && liveReceipts().length === 1, "동시에 두 번 눌러도 결제선생 발급은 한 장");
    check(crIssued.status === "ISSUED" && crIssued.approvalNumber === crFirst?.approvalNumber, "결제선생 승인번호로 발급 완료 기록");
    check(
      crFirst?.price === 600_000 && crFirst.trader === "1" && crFirst.issuanceNumber === "1234567890",
      "남은 수납액(600,000원) · 지출증빙 · 사업자번호로 발급",
    );

    await core.cancelCashReceipt(crId, "환불로 재발급", actor);
    check((await crOf()).status === "CANCELED" && liveReceipts().length === 0, "취소하면 결제선생에서도 취소");
    await core.requestCashReceipt({ paymentId: cashF.id, purpose: "INCOME", identifier: "010-000-1234" }, actor);
    check((await crOf()).providerBillId === null, "다시 등록하면 쓴 번호를 비움");

    ps.payssamMockSetFault("timeout", "/cash-receipt/issue");
    const lost = await Promise.allSettled([core.issueCashReceiptWithProvider(crId, actor)]);
    const crPending = await crOf();
    check(
      codeOf(lost[0]) === "PROVIDER_UNAVAILABLE" && crPending.status === "REQUESTED" && !!crPending.providerBillId,
      "응답을 못 받으면 번호를 남긴 채 발급 필요 (결제선생에는 발급돼 있음)",
    );
    const manualBlocked = await Promise.allSettled([core.markCashReceiptIssued(crId, "A12345678", actor)]);
    check(manualBlocked[0].status === "rejected", "결과를 모르는 건은 홈택스 발급 기록을 막음");
    await core.issueCashReceiptWithProvider(crId, actor);
    const crResolved = await crOf();
    check(
      crResolved.status === "ISSUED" &&
        crResolved.providerBillId === crPending.providerBillId &&
        liveReceipts().length === 1 &&
        crResolved.approvalNumber === liveReceipts()[0].approvalNumber,
      "다시 누르면 같은 번호로 결과를 확인해 기록 — 두 번 발급되지 않음",
    );

    console.log("\n19. 취소한 청구서 삭제 — 돈이 오간 적 없는 건만");
    const invDel = await core.issueInvoice(
      { studentId: f.id, periodStart: "2027-01-01", months: 1, monthlyFee: 690_000, dueDate: "2027-01-05", notify: false },
      actor,
    );
    await core.sendTuitionNotices([invDel.invoiceId], "REQUEST", actor);
    const openDel = await Promise.allSettled([core.deleteCanceledInvoice(invDel.invoiceId, actor)]);
    check(codeOf(openDel[0]) === "INVALID_INPUT", "취소하지 않은 청구서는 삭제할 수 없음");
    await core.cancelInvoice(invDel.invoiceId, "금액 잘못 입력", actor);
    await core.deleteCanceledInvoice(invDel.invoiceId, actor);
    check((await prisma.tuitionInvoice.findUnique({ where: { id: invDel.invoiceId } })) === null, "취소한 청구서 삭제");
    check((await prisma.tuitionNotice.count({ where: { invoiceId: invDel.invoiceId } })) === 0, "안내 기록도 함께 지워짐");
    const delEvent = await prisma.tuitionEvent.findFirst({ where: { invoiceId: invDel.invoiceId, type: "INVOICE_DELETED" } });
    check(!!delEvent?.detail?.includes("금액 잘못 입력"), "삭제 기록은 남음 (취소 사유 포함)");
    await prisma.tuitionEvent.deleteMany({ where: { invoiceId: invDel.invoiceId } });
    const withMoney = await Promise.allSettled([core.deleteCanceledInvoice(invE.invoiceId, actor)]);
    check(
      codeOf(withMoney[0]) === "INVALID_INPUT" && (await prisma.tuitionInvoice.findUnique({ where: { id: invE.invoiceId } })) !== null,
      "결제·환불 기록이 있는 취소 건은 삭제할 수 없음",
    );

    console.log(`\n통과 ${passed}건`);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

// 수강료 코어의 단일 진입점 — 서버 액션·모바일 API·웹훅·cron 은 여기서만 가져다 쓴다.
//
// 공통 규칙:
//  · 호출 측이 권한(직원·학부모↔자녀)을 먼저 검증한다. 코어는 권한을 보지 않는다.
//  · 업무 오류는 TuitionError 로 던진다 (code + 사용자에게 보여도 되는 한국어 message).
//  · revalidatePath 는 호출 측 책임 (스크립트·cron·테스트에서도 코어를 부른다).
//  · 푸시·Slack·결제사 정리 같은 커밋 뒤 작업은 코어가 응답 뒤(after)로 넘겨 실행한다.

export { issueInvoice, cancelInvoice, MAX_PARENT_MESSAGE_LEN, type IssueInvoiceInput } from "@/lib/tuition/invoice";
export {
  startCheckout,
  sendInvoiceTalk,
  requestOnsitePayment,
  withdrawOnsiteRequest,
  confirmOnsitePayment,
  dismissOnsiteRequest,
} from "@/lib/tuition/payment";
export {
  applyProviderOrder,
  handleProviderWebhook,
  syncInvoice,
  type ApplyOutcome,
} from "@/lib/tuition/settle";
export {
  requestRefund,
  processRefund,
  refundMethodFor,
  type RefundOutcome,
  type RequestRefundInput,
} from "@/lib/tuition/refund";
export {
  getTuitionProviderBalance,
  getTuitionProviderInfo,
  type TuitionProviderInfo,
} from "@/lib/tuition/provider-info";
export { runTuitionReconcile, runTuitionDailyNotices, runTuitionAutoIssue } from "@/lib/tuition/reconcile";
export {
  sendTuitionNotice,
  sendTuitionNotices,
  buildNoticeMessage,
  buildNoticeShareText,
  type NoticeMessageInput,
} from "@/lib/tuition/notices";
export {
  BILL_APP_MISSING_PARAM,
  billUrl,
  ensureBillToken,
  findInvoiceByToken,
  getBillByToken,
  type BillView,
} from "@/lib/tuition/bill-link";
export {
  cancelCashReceipt,
  issueCashReceiptWithProvider,
  markCashReceiptIssued,
  requestCashReceipt,
} from "@/lib/tuition/cash-receipt";
export { getTuitionExport } from "@/lib/tuition/export";
export {
  assertTuitionDailyAttempts,
  CHECKOUT_DAILY_LIMIT,
  ONSITE_DAILY_LIMIT,
} from "@/lib/tuition/limits";
export {
  getTuitionSetting,
  isOnlinePaymentAvailable,
  TUITION_SETTING_DEFAULTS,
  type TuitionSettingValues,
} from "@/lib/tuition/settings";

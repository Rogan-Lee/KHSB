"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BranchWaitStatus, WaitGender, WaitGradeType } from "@/generated/prisma/enums";
import { issuePhoneCode, confirmPhoneVerification, submitWaitlist } from "@/actions/waitlist";

type Branch = {
  id: string;
  name: string;
  waitStatus: BranchWaitStatus;
  notice: string | null;
  programs: { id: string; name: string }[];
};

const WAIT_BADGE: Record<BranchWaitStatus, { label: string; cls: string }> = {
  WAITLIST_OPEN: { label: "대기 등록", cls: "bg-blue-50 text-blue-600" },
  ALMOST_FULL: { label: "마감 임박", cls: "bg-amber-50 text-amber-600" },
  IMMEDIATE: { label: "바로 등원", cls: "bg-green-50 text-green-600" },
  CLOSED: { label: "마감", cls: "bg-red-50 text-red-500" },
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 border-b border-gray-200 pb-2 text-base font-bold text-gray-900">
      {children}
    </h2>
  );
}

function Toggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-lg border py-3 text-sm font-semibold transition ${
            value === o.value
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-gray-200 bg-white text-gray-400"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ApplyForm({ branches }: { branches: Branch[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [branchId, setBranchId] = useState<string | null>(null);
  const [gender, setGender] = useState<WaitGender | null>(null);
  const [gradeType, setGradeType] = useState<WaitGradeType | null>(null);
  const [programId, setProgramId] = useState<string>("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);

  const [issued, setIssued] = useState<{ code: string; receiver: string; qrCode: string | null } | null>(
    null
  );
  const [issuing, setIssuing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedBranch = branches.find((b) => b.id === branchId) ?? null;

  // sms: 딥링크 (탭 → 문자앱에 수신번호·본문 자동 채움). iOS/Android 모두 동작하는 ?&body 형태.
  const smsLink = issued
    ? `sms:${issued.receiver.replace(/\D/g, "")}?&body=${encodeURIComponent(issued.code)}`
    : "";

  // 번호가 바뀌면 발급/인증 상태 초기화 (다른 번호로 제출 방지)
  function handlePhoneChange(value: string) {
    setPhone(value);
    if (issued || verified) {
      setIssued(null);
      setVerified(false);
    }
  }

  async function handleIssue() {
    setError(null);
    if (!phone.trim()) return setError("휴대폰 번호를 먼저 입력해주세요");
    setIssuing(true);
    const res = await issuePhoneCode(phone);
    setIssuing(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setVerified(false);
    setIssued({ code: res.code, receiver: res.receiver, qrCode: res.qrCode });
  }

  async function handleConfirm() {
    setError(null);
    setConfirming(true);
    const res = await confirmPhoneVerification(phone);
    setConfirming(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setVerified(true);
  }

  function handleSubmit() {
    setError(null);
    if (!branchId) return setError("지점을 선택해주세요");
    if (!gender) return setError("성별을 선택해주세요");
    if (!gradeType) return setError("학년을 선택해주세요");
    if (!name.trim()) return setError("이름을 입력해주세요");
    if (!verified) return setError("휴대폰 본인인증을 먼저 완료해주세요");

    startTransition(async () => {
      const res = await submitWaitlist({
        branchId,
        programId: programId || null,
        name,
        phone,
        gender,
        gradeType,
        note,
        consentMarketing: consent,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/apply/${res.data!.token}`);
    });
  }

  return (
    <div className="mt-8 space-y-10">
      {/* 지점 선택 */}
      <section>
        <SectionTitle>어떤 지점 신청 원하시나요?</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          {branches.map((b) => {
            const badge = WAIT_BADGE[b.waitStatus];
            const closed = b.waitStatus === "CLOSED";
            const active = branchId === b.id;
            return (
              <button
                key={b.id}
                type="button"
                disabled={closed}
                onClick={() => {
                  setBranchId(b.id);
                  setProgramId("");
                }}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm transition ${
                  active
                    ? "border-blue-600 bg-blue-600 text-white"
                    : closed
                      ? "border-gray-100 bg-gray-50 text-gray-300"
                      : "border-gray-200 bg-white text-gray-500"
                }`}
              >
                <span className="font-semibold">{b.name}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                    active ? "bg-white/20 text-white" : badge.cls
                  }`}
                >
                  {badge.label}
                </span>
              </button>
            );
          })}
        </div>
        {selectedBranch?.notice && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-500">
            • {selectedBranch.notice}
          </p>
        )}
      </section>

      {/* 성별 */}
      <section>
        <SectionTitle>학생분의 성별은 어떻게 되시나요?</SectionTitle>
        <Toggle
          value={gender}
          onChange={setGender}
          options={[
            { value: "MALE", label: "남학생" },
            { value: "FEMALE", label: "여학생" },
          ]}
        />
      </section>

      {/* 학년 */}
      <section>
        <SectionTitle>현재 학년</SectionTitle>
        <Toggle
          value={gradeType}
          onChange={setGradeType}
          options={[
            { value: "REPEAT", label: "N수생" },
            { value: "ENROLLED", label: "재학생" },
          ]}
        />
      </section>

      {/* 프로그램 (지점에 프로그램이 있을 때만) */}
      {selectedBranch && selectedBranch.programs.length > 0 && (
        <section>
          <SectionTitle>프로그램을 선택해주세요</SectionTitle>
          <select
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-700"
          >
            <option value="">선택 안 함</option>
            {selectedBranch.programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </section>
      )}

      {/* 정보 입력 */}
      <section>
        <SectionTitle>간단한 정보만 적어주세요</SectionTitle>
        <div className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름을 적어주세요"
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm"
          />
          <div className="flex gap-2">
            <input
              value={phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              inputMode="numeric"
              placeholder="핸드폰번호를 적어주세요"
              className="flex-1 rounded-lg border border-gray-200 px-4 py-3 text-sm"
            />
            <button
              type="button"
              onClick={handleIssue}
              disabled={issuing || !phone}
              className="shrink-0 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              {issuing ? "발급 중" : issued ? "재발급" : "인증번호 발급"}
            </button>
          </div>

          {issued && !verified && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center">
              <p className="text-xs text-gray-600">아래 인증번호를 문자로 보낸 뒤 “문자를 보냈어요”를 눌러주세요</p>
              <p className="my-2 text-3xl font-extrabold tracking-widest text-blue-600">
                {issued.code}
              </p>
              <p className="text-xs text-gray-500">
                수신번호 <span className="font-semibold">{issued.receiver}</span>
              </p>

              <a
                href={smsLink}
                className="mt-3 block w-full rounded-lg bg-blue-600 py-3 text-sm font-bold text-white"
              >
                ① 문자 앱으로 인증번호 보내기
              </a>

              {issued.qrCode && (
                <div className="mt-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={issued.qrCode} alt="SMS QR" width={140} height={140} className="mx-auto" />
                  <p className="mt-1 text-[11px] text-gray-400">PC라면 휴대폰 카메라로 QR을 스캔하세요</p>
                </div>
              )}

              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirming}
                className="mt-3 w-full rounded-lg border border-blue-600 bg-white py-3 text-sm font-bold text-blue-600 disabled:opacity-60"
              >
                {confirming ? "확인 중..." : "② 문자를 보냈어요 (인증 확인)"}
              </button>
            </div>
          )}

          {verified && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-center text-sm font-semibold text-green-700">
              ✓ 본인인증이 완료되었어요
            </div>
          )}
        </div>
      </section>

      {/* 기타 요청 */}
      <section>
        <SectionTitle>기타 요청사항이 있으신가요?</SectionTitle>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-lg border border-gray-200 px-4 py-3 text-sm"
        />
      </section>

      {error && <p className="text-center text-sm text-red-500">{error}</p>}

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-xs text-gray-500">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="h-4 w-4"
          />
          다양한 소식을 전달받으실 수 있습니다.
        </label>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending || !verified}
          className="w-full rounded-lg bg-gray-800 py-4 text-sm font-bold text-white disabled:opacity-60"
        >
          {pending ? "제출 중..." : "신청서 제출"}
        </button>
        {!verified && (
          <p className="text-center text-[11px] text-gray-400">
            휴대폰 본인인증을 완료하면 신청할 수 있어요
          </p>
        )}
      </div>
    </div>
  );
}

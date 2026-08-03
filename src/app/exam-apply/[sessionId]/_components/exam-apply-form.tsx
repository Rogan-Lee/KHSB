"use client";

import { useState } from "react";
import { issuePhoneCode, confirmPhoneVerification } from "@/actions/waitlist";
import {
  findStudentsByVerifiedPhone,
  submitExamApplicationPublic,
  cancelExamApplicationPublic,
} from "@/actions/exam-application";
import type { ExamApplicationStatus } from "@/generated/prisma";

type Student = { id: string; name: string; grade: string; status: ExamApplicationStatus | null };

const APPLIED_LABEL: Record<ExamApplicationStatus, string> = {
  PENDING: "신청됨 (확정 대기)",
  CONFIRMED: "확정됨",
  CANCELLED: "반려됨 — 재신청 가능",
};

export function ExamApplyForm({ sessionId }: { sessionId: string }) {
  const [phone, setPhone] = useState("");
  const [issued, setIssued] = useState<{ code: string; receiver: string; qrCode: string | null } | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [verified, setVerified] = useState(false);
  const [students, setStudents] = useState<Student[] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [doneName, setDoneName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const smsLink = issued
    ? `sms:${issued.receiver.replace(/\D/g, "")}?&body=${encodeURIComponent(issued.code)}`
    : "";

  function handlePhoneChange(v: string) {
    setPhone(v);
    if (issued || verified) {
      setIssued(null);
      setVerified(false);
      setStudents(null);
      setSelectedId("");
    }
  }

  async function handleIssue() {
    setError(null);
    if (!phone.trim()) return setError("휴대폰 번호를 먼저 입력해주세요");
    setIssuing(true);
    const res = await issuePhoneCode(phone);
    setIssuing(false);
    if (!res.ok) return setError(res.error);
    setVerified(false);
    setIssued({ code: res.code, receiver: res.receiver, qrCode: res.qrCode });
  }

  async function handleConfirm() {
    setError(null);
    setConfirming(true);
    const res = await confirmPhoneVerification(phone);
    if (!res.ok) {
      setConfirming(false);
      return setError(res.error);
    }
    setVerified(true);
    const list = await findStudentsByVerifiedPhone(sessionId, phone);
    setConfirming(false);
    if (!list.ok) return setError(list.error);
    setStudents(list.data!.students);
    if (list.data!.students.length === 1) setSelectedId(list.data!.students[0].id);
  }

  async function reloadStudents() {
    const list = await findStudentsByVerifiedPhone(sessionId, phone);
    if (list.ok) setStudents(list.data!.students);
  }

  async function handleSubmit() {
    setError(null);
    if (!selectedId) return setError("신청할 학생을 선택해주세요");
    setBusy(true);
    const res = await submitExamApplicationPublic(sessionId, phone, selectedId, memo);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setDoneName(res.data!.studentName);
  }

  async function handleCancel() {
    setError(null);
    if (!selectedId) return;
    setBusy(true);
    const res = await cancelExamApplicationPublic(sessionId, phone, selectedId);
    if (res.ok) await reloadStudents();
    setBusy(false);
    if (!res.ok) return setError(res.error);
  }

  const selected = students?.find((s) => s.id === selectedId) ?? null;
  const canCancel = selected?.status === "PENDING" || selected?.status === "CONFIRMED";

  if (doneName !== null) {
    return (
      <div className="mt-8 rounded-lg border border-green-200 bg-green-50 px-4 py-10 text-center">
        <p className="text-lg font-bold text-green-700">신청 완료</p>
        <p className="mt-1 text-sm text-green-600">
          <b>{doneName}</b> 학생 모의고사 신청이 접수되었어요.
        </p>
        <p className="mt-2 text-xs text-gray-500">확정 여부는 운영진 검토 후 안내됩니다.</p>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-5">
      {/* 전화 본인인증 */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-gray-900">휴대폰 본인인증</p>
        <div className="flex gap-2">
          <input
            value={phone}
            onChange={(e) => handlePhoneChange(e.target.value)}
            inputMode="numeric"
            placeholder="학생 또는 학부모 휴대폰번호"
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
            <p className="my-2 text-3xl font-extrabold tracking-widest text-blue-600">{issued.code}</p>
            <p className="text-xs text-gray-500">
              수신번호 <span className="font-semibold">{issued.receiver}</span>
            </p>
            <a href={smsLink} className="mt-3 block w-full rounded-lg bg-blue-600 py-3 text-sm font-bold text-white">
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

      {/* 학생 선택 (인증 후) */}
      {verified && students && (
        students.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-700">
            본인인증한 번호로 등록된 학생 정보가 없습니다.
            <br />
            학원에 등록된 연락처인지 확인 후 다시 시도하거나 문의해주세요.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-900">신청할 학생을 선택해주세요</p>
              {students.map((s) => {
                const active = selectedId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition ${
                      active ? "border-blue-600 bg-blue-50" : "border-gray-200 bg-white"
                    }`}
                  >
                    <span className="text-sm font-semibold text-gray-900">
                      {s.name}
                      <span className="ml-1.5 text-xs font-normal text-gray-400">{s.grade}</span>
                    </span>
                    {s.status && (
                      <span className="text-[11px] font-medium text-blue-600">{APPLIED_LABEL[s.status]}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-900">요청사항 (선택)</p>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={3}
                placeholder="응시 관련 요청이 있으면 적어주세요"
                className="w-full resize-none rounded-lg border border-gray-200 px-4 py-3 text-sm"
              />
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={busy || !selectedId}
              className="w-full rounded-lg bg-gray-800 py-4 text-sm font-bold text-white disabled:opacity-60"
            >
              {busy ? "처리 중..." : canCancel ? "다시 신청 (내용 갱신)" : "모의고사 신청"}
            </button>

            {canCancel && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={busy}
                className="w-full rounded-lg border border-red-200 py-3 text-sm font-semibold text-red-500 disabled:opacity-60"
              >
                신청 취소
              </button>
            )}
          </>
        )
      )}

      {error && <p className="text-center text-sm text-red-500">{error}</p>}
    </div>
  );
}

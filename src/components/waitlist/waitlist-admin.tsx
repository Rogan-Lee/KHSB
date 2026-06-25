"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  BranchWaitStatus,
  WaitGender,
  WaitGradeType,
  WaitlistStatus,
} from "@/generated/prisma/enums";
import { toast } from "sonner";
import {
  setWaitlistStatus,
  cancelWaitlist,
  updateWaitlistEntry,
  saveWaitlistGuide,
  createBranch,
  updateBranch,
  createProgram,
  toggleProgram,
  updateProgram,
} from "@/actions/waitlist";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { formatDateTime } from "@/lib/utils";

type Program = {
  id: string;
  name: string;
  isActive: boolean;
  capacity: number | null;
  enrolled: number;
  waiting: number;
};
type Branch = {
  id: string;
  name: string;
  slug: string;
  waitStatus: BranchWaitStatus;
  notice: string | null;
  isActive: boolean;
  capacity: number | null;
  enrolled: number;
  waiting: number;
  programs: Program[];
};
type Entry = {
  id: string;
  name: string;
  phone: string;
  branchId: string;
  branchName: string;
  programId: string | null;
  programName: string | null;
  gender: WaitGender;
  gradeType: WaitGradeType;
  status: WaitlistStatus;
  note: string | null;
  cancelReason: string | null;
  guideToken: string | null;
  guideContent: string | null;
  createdAt: string;
};

const WAIT_STATUS_LABEL: Record<BranchWaitStatus, string> = {
  WAITLIST_OPEN: "대기 등록",
  ALMOST_FULL: "마감 임박",
  IMMEDIATE: "바로 등원",
  CLOSED: "마감",
};
const STATUS_LABEL: Record<WaitlistStatus, string> = {
  WAITING: "대기",
  INVITED: "초대됨",
  ENROLLED: "등원",
  CANCELLED: "취소",
};
const STATUS_TONE: Record<WaitlistStatus, string> = {
  WAITING: "bg-blue-50 text-blue-600",
  INVITED: "bg-amber-50 text-amber-600",
  ENROLLED: "bg-green-50 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

const btn = "rounded-md px-2.5 py-1 text-xs font-medium transition disabled:opacity-50";
const input = "rounded-md border border-border bg-background px-3 py-2 text-sm";

export function WaitlistAdmin({ branches, entries }: { branches: Branch[]; entries: Entry[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"entries" | "branches">("entries");
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) setError(res.error ?? "처리에 실패했습니다");
      router.refresh();
    });
  }

  // 대기 순번: 같은 지점+학년의 WAITING 중 등록순
  const positionOf = (entry: Entry): number => {
    if (entry.status !== "WAITING") return 0;
    const group = entries
      .filter(
        (e) => e.branchId === entry.branchId && e.gradeType === entry.gradeType && e.status === "WAITING"
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return group.findIndex((e) => e.id === entry.id) + 1;
  };

  return (
    <div>
      <ShareApply />

      <div className="mb-4 flex gap-2 border-b border-border">
        {(["entries", "branches"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t ? "border-brand text-brand" : "border-transparent text-muted-foreground"
            }`}
          >
            {t === "entries" ? `대기자 (${entries.length})` : `지점·프로그램 (${branches.length})`}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {tab === "entries" ? (
        <EntriesTab entries={entries} branches={branches} positionOf={positionOf} run={run} pending={pending} />
      ) : (
        <BranchesTab branches={branches} run={run} pending={pending} />
      )}
    </div>
  );
}

/** 대기 신청 유도 메시지 + /apply 링크 공유 (저장 없음, 작성→복사). */
function ShareApply() {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const link = `${origin}/apply`;
  const [msg, setMsg] = useState(
    "안녕하세요! 대기 신청 안내드립니다.\n현재 정원이 가득 차 대기 신청만 받고 있어요. 아래 링크에서 1분이면 신청하실 수 있습니다 👇"
  );

  async function copy(text: string, ok: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(ok);
    } catch {
      toast.error("복사 실패 — 브라우저 권한을 확인하세요");
    }
  }

  return (
    <div className="mb-5 rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-sm font-semibold">대기 신청 링크 공유</p>
      <p className="mb-3 text-xs text-muted-foreground">
        유도 안내 메시지와 함께 카톡·문자로 보내세요. (예비 신청자에게 발송)
      </p>
      <div className="mb-2 flex items-center gap-2">
        <input readOnly value={link} className={`${input} flex-1 text-xs`} />
        <button
          onClick={() => copy(link, "신청 링크가 복사되었습니다")}
          className={`${btn} bg-gray-100 text-gray-700`}
        >
          링크만 복사
        </button>
      </div>
      <textarea
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        rows={3}
        className={`${input} w-full resize-none text-sm`}
        placeholder="유도 안내 메시지"
      />
      <div className="mt-2 flex justify-end">
        <button
          onClick={() => copy(`${msg}\n${link}`, "안내 메시지 + 링크가 복사되었습니다")}
          className={`${btn} bg-brand text-white`}
        >
          메시지 + 링크 복사
        </button>
      </div>
    </div>
  );
}

const ENTRY_FILTERS: { key: WaitlistStatus | "ALL"; label: string }[] = [
  { key: "WAITING", label: "대기" },
  { key: "INVITED", label: "초대됨" },
  { key: "ENROLLED", label: "등원" },
  { key: "CANCELLED", label: "취소" },
  { key: "ALL", label: "전체" },
];

function EntriesTab({
  entries,
  branches,
  positionOf,
  run,
  pending,
}: {
  entries: Entry[];
  branches: Branch[];
  positionOf: (e: Entry) => number;
  run: (a: () => Promise<{ ok: boolean; error?: string }>) => void;
  pending: boolean;
}) {
  const [filter, setFilter] = useState<WaitlistStatus | "ALL">("WAITING");
  const [editing, setEditing] = useState<Entry | null>(null);
  const [guiding, setGuiding] = useState<Entry | null>(null);

  const shown = entries.filter((e) => filter === "ALL" || e.status === filter);
  const countOf = (k: WaitlistStatus | "ALL") =>
    k === "ALL" ? entries.length : entries.filter((e) => e.status === k).length;

  function handleCancel(e: Entry) {
    // ponytail: 취소 사유는 prompt로 수집 — 별도 모달 없이 한 줄. 풍부한 UX 필요해지면 교체.
    const reason = window.prompt(`${e.name} 대기 취소 사유를 입력하세요`, "");
    if (reason === null) return; // 취소 안 함
    run(() => cancelWaitlist(e.id, reason));
  }

  async function copyGuideLink(e: Entry) {
    if (!e.guideToken) return;
    const url = `${window.location.origin}/apply/guide/${e.guideToken}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("안내 링크가 복사되었습니다");
    } catch {
      toast.error("복사 실패 — 브라우저 권한을 확인하세요");
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {ENTRY_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === f.key ? "bg-brand text-white" : "bg-muted text-muted-foreground"
            }`}
          >
            {f.label} {countOf(f.key)}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">해당 상태의 대기자가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">순번</th>
                <th className="px-3 py-2">이름</th>
                <th className="px-3 py-2">연락처</th>
                <th className="px-3 py-2">지점</th>
                <th className="px-3 py-2">학년/성별</th>
                <th className="px-3 py-2">프로그램</th>
                <th className="px-3 py-2">등록일시</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2">처리</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id} className="border-t border-border align-top">
                  <td className="px-3 py-2 font-semibold text-brand">
                    {e.status === "WAITING" ? positionOf(e) : "-"}
                  </td>
                  <td className="px-3 py-2 font-medium">{e.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{e.phone}</td>
                  <td className="px-3 py-2">{e.branchName}</td>
                  <td className="px-3 py-2">
                    {e.gradeType === "REPEAT" ? "N수생" : "재학생"} · {e.gender === "MALE" ? "남" : "여"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{e.programName ?? "-"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_TONE[e.status]}`}>
                      {STATUS_LABEL[e.status]}
                    </span>
                    {e.status === "CANCELLED" && e.cancelReason && (
                      <p className="mt-1 max-w-[160px] text-[11px] text-gray-400">사유: {e.cancelReason}</p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <button
                        disabled={pending}
                        onClick={() => setEditing(e)}
                        className={`${btn} bg-gray-100 text-gray-700`}
                      >
                        수정
                      </button>
                      <button
                        disabled={pending}
                        onClick={() => setGuiding(e)}
                        className={`${btn} bg-amber-100 text-amber-700`}
                      >
                        {e.guideToken ? "안내 수정" : "안내 작성"}
                      </button>
                      {e.guideToken && (
                        <button
                          disabled={pending}
                          onClick={() => copyGuideLink(e)}
                          className={`${btn} bg-amber-50 text-amber-600`}
                        >
                          링크 복사
                        </button>
                      )}
                      {e.status !== "ENROLLED" && (
                        <button
                          disabled={pending}
                          onClick={() => run(() => setWaitlistStatus(e.id, "ENROLLED"))}
                          className={`${btn} bg-green-100 text-green-700`}
                        >
                          등원확정
                        </button>
                      )}
                      {e.status === "CANCELLED" ? (
                        <button
                          disabled={pending}
                          onClick={() => run(() => setWaitlistStatus(e.id, "WAITING"))}
                          className={`${btn} bg-blue-100 text-blue-700`}
                        >
                          대기복귀
                        </button>
                      ) : (
                        <button
                          disabled={pending}
                          onClick={() => handleCancel(e)}
                          className={`${btn} bg-red-100 text-red-600`}
                        >
                          취소
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <EditEntryModal
          entry={editing}
          branch={branches.find((b) => b.id === editing.branchId) ?? null}
          onClose={() => setEditing(null)}
          onSave={(data) => {
            run(() => updateWaitlistEntry(editing.id, data));
            setEditing(null);
          }}
        />
      )}

      {guiding && <GuideEditorModal entry={guiding} onClose={() => setGuiding(null)} />}
    </div>
  );
}

function GuideEditorModal({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const router = useRouter();
  const template =
    entry.guideContent ||
    `## 등록 안내\n안녕하세요, ${entry.name}님. 대기 순번이 도래하여 등록 안내드립니다.\n\n## 정보 입력\n아래 정보를 회신 부탁드립니다.\n- 학생 이름:\n- 생년월일:\n- 비상 연락처:\n\n## 입금 안내\n- 금액:\n- 입금 계좌:\n- 입금 기한:`;
  const [md, setMd] = useState(template);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await saveWaitlistGuide(entry.id, md);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const url = `${window.location.origin}/apply/guide/${res.data!.token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("안내 저장 + 링크 복사 완료");
    } catch {
      toast.success("안내가 저장되었습니다");
    }
    router.refresh();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-background p-5 shadow-lg">
        <h3 className="mb-1 text-base font-bold">등록 안내 작성 — {entry.name}</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          저장하면 공개 링크가 발급되고 자동 복사됩니다. 카톡·문자로 직접 전달하세요. (대기 상태면 “초대됨”으로 변경)
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border p-2">
          <MarkdownEditor value={md} onChange={setMd} placeholder="등록 안내 / 정보 입력 / 입금 안내 등" />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className={`${btn} bg-muted text-muted-foreground`}>
            닫기
          </button>
          <button onClick={save} disabled={saving} className={`${btn} bg-brand text-white`}>
            {saving ? "저장 중..." : "저장 + 링크 복사"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditEntryModal({
  entry,
  branch,
  onClose,
  onSave,
}: {
  entry: Entry;
  branch: Branch | null;
  onClose: () => void;
  onSave: (data: {
    name: string;
    phone: string;
    programId: string | null;
    gender: WaitGender;
    gradeType: WaitGradeType;
    note: string | null;
  }) => void;
}) {
  const [name, setName] = useState(entry.name);
  const [phone, setPhone] = useState(entry.phone);
  const [programId, setProgramId] = useState(entry.programId ?? "");
  const [gender, setGender] = useState<WaitGender>(entry.gender);
  const [gradeType, setGradeType] = useState<WaitGradeType>(entry.gradeType);
  const [note, setNote] = useState(entry.note ?? "");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-xl bg-background p-5 shadow-lg">
        <h3 className="mb-4 text-base font-bold">대기자 정보 수정 — {entry.branchName}</h3>
        <div className="space-y-3">
          <label className="block text-xs text-muted-foreground">
            이름
            <input className={`${input} mt-1 w-full`} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block text-xs text-muted-foreground">
            연락처
            <input
              className={`${input} mt-1 w-full`}
              value={phone}
              inputMode="numeric"
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            프로그램
            <select
              className={`${input} mt-1 w-full`}
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
            >
              <option value="">선택 안 함</option>
              {branch?.programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-3">
            <label className="flex-1 text-xs text-muted-foreground">
              학년
              <select
                className={`${input} mt-1 w-full`}
                value={gradeType}
                onChange={(e) => setGradeType(e.target.value as WaitGradeType)}
              >
                <option value="REPEAT">N수생</option>
                <option value="ENROLLED">재학생</option>
              </select>
            </label>
            <label className="flex-1 text-xs text-muted-foreground">
              성별
              <select
                className={`${input} mt-1 w-full`}
                value={gender}
                onChange={(e) => setGender(e.target.value as WaitGender)}
              >
                <option value="MALE">남</option>
                <option value="FEMALE">여</option>
              </select>
            </label>
          </div>
          <label className="block text-xs text-muted-foreground">
            메모/요청
            <textarea
              className={`${input} mt-1 w-full resize-none`}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className={`${btn} bg-muted text-muted-foreground`}>
            닫기
          </button>
          <button
            onClick={() => onSave({ name, phone, programId: programId || null, gender, gradeType, note: note || null })}
            className={`${btn} bg-brand text-white`}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

function CapacityBadge({
  capacity,
  enrolled,
  waiting,
}: {
  capacity: number | null;
  enrolled: number;
  waiting: number;
}) {
  const remaining = capacity != null ? capacity - enrolled : null;
  const full = remaining != null && remaining <= 0;
  return (
    <span className="text-xs text-muted-foreground">
      등원 <span className={`font-semibold ${full ? "text-red-500" : "text-gray-700"}`}>{enrolled}</span>
      {capacity != null && <span> / 정원 {capacity}</span>}
      {remaining != null && (
        <span className={full ? "text-red-500" : "text-green-600"}> (잔여 {Math.max(0, remaining)})</span>
      )}
      <span className="text-gray-300"> · </span>대기 {waiting}
    </span>
  );
}

function BranchesTab({
  branches,
  run,
  pending,
}: {
  branches: Branch[];
  run: (a: () => Promise<{ ok: boolean; error?: string }>) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [programInputs, setProgramInputs] = useState<Record<string, string>>({});

  const capOrNull = (v: string): number | null => {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-4">
        <input className={input} placeholder="지점명 (예: 동탄점)" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={input} placeholder="slug (예: dongtan)" value={slug} onChange={(e) => setSlug(e.target.value)} />
        <button
          disabled={pending}
          onClick={() => {
            run(() => createBranch({ name, slug }));
            setName("");
            setSlug("");
          }}
          className={`${btn} bg-brand text-white`}
        >
          지점 추가
        </button>
      </div>

      {branches.map((b) => (
        <div key={b.id} className="rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{b.name}</span>
              <span className="text-xs text-muted-foreground">/{b.slug}</span>
              {!b.isActive && (
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">비활성</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                className={input}
                value={b.waitStatus}
                onChange={(ev) => run(() => updateBranch(b.id, { waitStatus: ev.target.value as BranchWaitStatus }))}
              >
                {Object.entries(WAIT_STATUS_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                disabled={pending}
                onClick={() => run(() => updateBranch(b.id, { isActive: !b.isActive }))}
                className={`${btn} bg-gray-100 text-gray-700`}
              >
                {b.isActive ? "비활성화" : "활성화"}
              </button>
            </div>
          </div>

          {/* 지점 총정원 + 집계 */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="text-xs text-muted-foreground">
              지점 총정원{" "}
              <input
                type="number"
                min={0}
                className={`${input} w-24`}
                defaultValue={b.capacity ?? ""}
                placeholder="미설정"
                onBlur={(ev) => {
                  const next = capOrNull(ev.target.value);
                  if (next !== b.capacity) run(() => updateBranch(b.id, { capacity: next }));
                }}
              />
            </label>
            <CapacityBadge capacity={b.capacity} enrolled={b.enrolled} waiting={b.waiting} />
          </div>

          {/* 안내문 */}
          <textarea
            className={`${input} mt-3 w-full resize-none`}
            rows={2}
            defaultValue={b.notice ?? ""}
            placeholder="공개 안내문 (예: 현재 정원이 차서 대기 등록만 가능해요.)"
            onBlur={(ev) => {
              if (ev.target.value !== (b.notice ?? "")) run(() => updateBranch(b.id, { notice: ev.target.value }));
            }}
          />

          {/* 프로그램 */}
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">프로그램 · 정원</p>
            {b.programs.length === 0 && <p className="text-xs text-muted-foreground">등록된 프로그램 없음</p>}
            {b.programs.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-3 py-2">
                <button
                  disabled={pending}
                  onClick={() => run(() => toggleProgram(p.id, !p.isActive))}
                  className={`${btn} ${p.isActive ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-400 line-through"}`}
                  title={p.isActive ? "클릭하여 비활성화" : "클릭하여 활성화"}
                >
                  {p.name}
                </button>
                <label className="text-xs text-muted-foreground">
                  정원{" "}
                  <input
                    type="number"
                    min={0}
                    className={`${input} w-20`}
                    defaultValue={p.capacity ?? ""}
                    placeholder="미설정"
                    onBlur={(ev) => {
                      const next = capOrNull(ev.target.value);
                      if (next !== p.capacity) run(() => updateProgram(p.id, { capacity: next }));
                    }}
                  />
                </label>
                <CapacityBadge capacity={p.capacity} enrolled={p.enrolled} waiting={p.waiting} />
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <input
                className={`${input} flex-1`}
                placeholder="프로그램명 추가"
                value={programInputs[b.id] ?? ""}
                onChange={(e) => setProgramInputs((prev) => ({ ...prev, [b.id]: e.target.value }))}
              />
              <button
                disabled={pending}
                onClick={() => {
                  const v = programInputs[b.id] ?? "";
                  if (!v.trim()) return;
                  run(() => createProgram(b.id, v));
                  setProgramInputs((prev) => ({ ...prev, [b.id]: "" }));
                }}
                className={`${btn} bg-brand text-white`}
              >
                추가
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

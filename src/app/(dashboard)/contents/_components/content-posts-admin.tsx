"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  ImagePlus,
  Loader2,
  Newspaper,
  X,
} from "lucide-react";
import { Switch } from "seed-design/ui/switch";
import { cn } from "@/lib/utils";
import {
  EmptyState,
  FormField,
  PageHeader,
  StatusBadge,
  TableCard,
  Toolbar,
  type Tone,
} from "@/components/backoffice/ui";
import {
  createContentPost,
  updateContentPost,
  deleteContentPost,
  toggleContentPostVisible,
  type ContentPostInput,
} from "@/actions/content-posts";
import {
  AUTHOR_PRESETS,
  CONTENT_POST_TYPES,
  CONTENT_TYPE_META,
  findAuthorPreset,
  isInternalType,
  type AuthorPreset,
  type ContentPostType,
} from "@/lib/content-posts-meta";

export type ContentPostRow = {
  id: string;
  type: ContentPostType;
  title: string;
  summary: string | null;
  url: string | null;
  body: string | null;
  authorName: string | null;
  authorRole: string | null;
  authorKey: string | null;
  coverImageUrl: string | null;
  publishedAt: string; // ISO
  visible: boolean;
};

type Filter = "all" | ContentPostType;
/** 작성자 선택 상태 — 프리셋 key | AUTHOR_CUSTOM(직접 입력) | AUTHOR_NONE(선택 안 함) */
type AuthorMode = string;
const AUTHOR_NONE = "__none";
const AUTHOR_CUSTOM = "__custom";

const AUTHOR_GROUPS: AuthorPreset["group"][] = ["운영진", "선배 멘토", "관리팀"];

// 유형 배지 색 — CONTENT_TYPE_META.tone(레거시 클래스) 대신 SEED 역할색으로
const TYPE_TONE: Record<ContentPostType, Tone> = {
  review: "warn",
  mentor: "violet",
  director: "brand",
  podcast: "info",
  article: "ok",
};
// kit StatusBadge 는 violet 을 informative(파랑)로 그려 팟캐스트와 겹친다 → SEED 보라 팔레트로 구분
const VIOLET_BADGE = "bg-palette-purple-100 text-palette-purple-700";

function toKSTDateInput(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

const EMPTY: ContentPostInput = {
  type: "review",
  title: "",
  summary: "",
  url: "",
  body: "",
  authorName: "",
  authorRole: "",
  authorKey: "",
  coverImageUrl: "",
  publishedAt: "",
  visible: true,
};

function authorModeOf(p: { authorKey: string | null; authorName: string | null }): AuthorMode {
  if (findAuthorPreset(p.authorKey)) return p.authorKey!;
  if (p.authorName) return AUTHOR_CUSTOM;
  return AUTHOR_NONE;
}

export function ContentPostsAdmin({ posts }: { posts: ContentPostRow[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ContentPostInput>(EMPTY);
  const [authorMode, setAuthorMode] = useState<AuthorMode>(AUTHOR_NONE);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ContentPostRow | null>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);

  const counts = CONTENT_POST_TYPES.reduce(
    (acc, t) => ({ ...acc, [t]: posts.filter((p) => p.type === t).length }),
    {} as Record<ContentPostType, number>
  );
  const visiblePosts = filter === "all" ? posts : posts.filter((p) => p.type === filter);
  const internal = isInternalType(form.type);

  function applyAuthorMode(mode: AuthorMode) {
    setAuthorMode(mode);
    const preset = findAuthorPreset(mode);
    if (preset) {
      setForm((f) => ({
        ...f,
        authorKey: preset.key,
        authorName: preset.name,
        authorRole: preset.role,
      }));
    } else if (mode === AUTHOR_CUSTOM) {
      // 프리셋에서 직접 입력으로 전환하면 이름·직함은 이어서 수정할 수 있게 유지, key 만 해제
      setForm((f) => ({ ...f, authorKey: "" }));
    } else {
      setForm((f) => ({ ...f, authorKey: "", authorName: "", authorRole: "" }));
    }
  }

  function changeType(type: ContentPostType) {
    setForm((f) => ({ ...f, type }));
    // 원장 칼럼은 작성자가 정해져 있으므로 비어 있으면 대표원장으로 채움
    if (type === "director" && authorMode === AUTHOR_NONE) applyAuthorMode("director");
  }

  function openCreate() {
    const type: ContentPostType = filter === "all" ? "review" : filter;
    const preset = type === "director" ? findAuthorPreset("director") : undefined;
    setEditingId(null);
    setForm({
      ...EMPTY,
      type,
      publishedAt: toKSTDateInput(new Date().toISOString()),
      ...(preset
        ? { authorKey: preset.key, authorName: preset.name, authorRole: preset.role }
        : {}),
    });
    setAuthorMode(preset ? preset.key : AUTHOR_NONE);
    setOpen(true);
  }

  function openEdit(p: ContentPostRow) {
    setEditingId(p.id);
    setForm({
      type: p.type,
      title: p.title,
      summary: p.summary ?? "",
      url: p.url ?? "",
      body: p.body ?? "",
      authorName: p.authorName ?? "",
      authorRole: p.authorRole ?? "",
      authorKey: findAuthorPreset(p.authorKey) ? p.authorKey! : "",
      coverImageUrl: p.coverImageUrl ?? "",
      publishedAt: toKSTDateInput(p.publishedAt),
      visible: p.visible,
    });
    setAuthorMode(authorModeOf(p));
    setOpen(true);
  }

  function run(fn: () => Promise<unknown>, ok: string, closeDialog = false) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(ok);
        if (closeDialog) setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "처리 실패");
      }
    });
  }

  function submit() {
    if (editingId) {
      run(() => updateContentPost(editingId, form), "콘텐츠를 수정했습니다", true);
    } else {
      run(() => createContentPost(form), "콘텐츠를 추가했습니다", true);
    }
  }

  async function uploadCover(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "업로드 실패");
      setForm((f) => ({ ...f, coverImageUrl: json.url }));
      toast.success("커버 이미지를 업로드했습니다");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  }

  const coverPreview = /^https?:\/\//i.test(form.coverImageUrl?.trim() ?? "")
    ? form.coverImageUrl!.trim()
    : null;
  const selectedPreset = findAuthorPreset(authorMode);

  return (
    <div>
      <PageHeader
        title="콘텐츠"
        description="후기·선배 아티클·원장 칼럼을 쓰거나 팟캐스트·외부 링크를 올리면 랜딩 페이지와 학생 포털에 보여요."
        actions={
          <Button onClick={openCreate}>
            <Plus />
            콘텐츠 추가
          </Button>
        }
      />

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          <TabsTrigger value="all">
            전체
            <span className="t4-bold tabular-nums text-fg-placeholder">{posts.length}</span>
          </TabsTrigger>
          {CONTENT_POST_TYPES.map((t) => (
            <TabsTrigger key={t} value={t}>
              {CONTENT_TYPE_META[t].label}
              <span className="t4-bold tabular-nums text-fg-placeholder">{counts[t]}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mt-x5">
        <Toolbar>
          <p className="t4-regular tabular-nums text-fg-neutral-subtle">
            <span className="t4-bold text-fg-neutral">{visiblePosts.length}</span>건 · 공개{" "}
            <span className="t4-bold text-fg-neutral">{visiblePosts.filter((p) => p.visible).length}</span>건
          </p>
        </Toolbar>

        <TableCard>
          {visiblePosts.length === 0 ? (
            <EmptyState
              icon={Newspaper}
              title={posts.length === 0 ? "아직 등록된 콘텐츠가 없어요" : "이 유형의 콘텐츠가 없어요"}
              description={
                posts.length === 0
                  ? "첫 콘텐츠를 추가하면 랜딩 페이지와 학생 포털에 바로 보여요."
                  : "다른 유형을 보거나 새 콘텐츠를 추가해 보세요."
              }
              action={
                <Button variant="outline" onClick={openCreate}>
                  <Plus />
                  콘텐츠 추가
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">유형</TableHead>
                  <TableHead>제목</TableHead>
                  <TableHead className="w-40">작성자</TableHead>
                  <TableHead className="w-28">발행일</TableHead>
                  <TableHead className="w-24">공개</TableHead>
                  <TableHead className="w-28 text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiblePosts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <StatusBadge
                        tone={TYPE_TONE[p.type]}
                        className={TYPE_TONE[p.type] === "violet" ? VIOLET_BADGE : undefined}
                      >
                        {CONTENT_TYPE_META[p.type].label}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="min-w-[240px]">
                      {p.url && !isInternalType(p.type) ? (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener"
                          className={cn(
                            "inline-flex max-w-[360px] items-center gap-x1 t4-medium hover:underline",
                            p.visible ? "text-fg-neutral" : "text-fg-neutral-subtle"
                          )}
                        >
                          <span className="truncate">{p.title}</span>
                          <ExternalLink className="size-3.5 shrink-0 text-fg-neutral-subtle" aria-hidden />
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          className={cn(
                            "inline-flex max-w-[360px] text-left t4-medium hover:underline",
                            p.visible ? "text-fg-neutral" : "text-fg-neutral-subtle"
                          )}
                        >
                          <span className="truncate">{p.title}</span>
                        </button>
                      )}
                      {p.summary && (
                        <p className="mt-x0_5 max-w-[400px] truncate t3-regular text-fg-neutral-subtle">
                          {p.summary}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.authorName ? (
                        <div className="min-w-0">
                          <p className="max-w-[150px] truncate t4-regular text-fg-neutral">{p.authorName}</p>
                          {p.authorRole && (
                            <p className="max-w-[150px] truncate t3-regular text-fg-neutral-subtle">
                              {p.authorRole}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-fg-placeholder">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-fg-neutral-muted">
                      {toKSTDateInput(p.publishedAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-x2" title={p.visible ? "비공개로 전환" : "공개로 전환"}>
                        <Switch
                          size="24"
                          checked={p.visible}
                          disabled={busy}
                          onCheckedChange={() =>
                            run(
                              () => toggleContentPostVisible(p.id, !p.visible),
                              p.visible ? "비공개로 전환했습니다" : "공개로 전환했습니다"
                            )
                          }
                          inputProps={{ "aria-label": `${p.title} 공개` }}
                        />
                        <span className={cn("t3-medium", p.visible ? "text-fg-neutral" : "text-fg-neutral-subtle")}>
                          {p.visible ? "공개" : "숨김"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-x0_5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-x8"
                          disabled={busy}
                          aria-label={`${p.title} 수정`}
                          onClick={() => openEdit(p)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-x8 hover:text-fg-critical"
                          disabled={busy}
                          aria-label={`${p.title} 삭제`}
                          onClick={() => setDeleteTarget(p)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TableCard>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>콘텐츠 삭제</DialogTitle>
            <DialogDescription>
              {deleteTarget ? `"${deleteTarget.title}" 콘텐츠를 삭제할까요? 되돌릴 수 없어요.` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={busy}>
              취소
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (deleteTarget) run(() => deleteContentPost(deleteTarget.id), "삭제했습니다");
                setDeleteTarget(null);
              }}
            >
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "콘텐츠 수정" : "콘텐츠 추가"}</DialogTitle>
          </DialogHeader>
          <div className="flex min-w-0 flex-col gap-x5">
            <div className="grid gap-x4 sm:grid-cols-[180px_1fr]">
              <FormField label="유형">
                <Select value={form.type} onValueChange={(v) => changeType(v as ContentPostType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTENT_POST_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {CONTENT_TYPE_META[t].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="제목" htmlFor="content-title" required>
                <Input
                  id="content-title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder={internal ? "글 제목" : "콘텐츠 제목"}
                />
              </FormField>
            </div>

            <FormField label="요약 · 리드 (선택)" htmlFor="content-summary">
              <Textarea
                id="content-summary"
                value={form.summary ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                placeholder="목록 카드와 글 상단에 노출되는 한두 문장"
                rows={2}
              />
            </FormField>

            <FormField
              label={`작성자${internal ? "" : " (선택)"}`}
              hint={selectedPreset ? `랜딩에서 ${selectedPreset.name} 프로필과 연결돼요.` : undefined}
            >
              <Select value={authorMode} onValueChange={applyAuthorMode}>
                <SelectTrigger>
                  <SelectValue placeholder="작성자 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTHOR_NONE}>선택 안 함</SelectItem>
                  {AUTHOR_GROUPS.map((g) => (
                    <SelectGroup key={g}>
                      <SelectSeparator />
                      <SelectLabel>{g}</SelectLabel>
                      {AUTHOR_PRESETS.filter((a) => a.group === g).map((a) => (
                        <SelectItem key={a.key} value={a.key}>
                          {a.name} · {a.role}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                  <SelectSeparator />
                  <SelectItem value={AUTHOR_CUSTOM}>직접 입력</SelectItem>
                </SelectContent>
              </Select>
              {authorMode === AUTHOR_CUSTOM && (
                <div className="grid gap-x2 sm:grid-cols-2">
                  <Input
                    value={form.authorName ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, authorName: e.target.value }))}
                    placeholder="이름 (예: 홍길동 학부모)"
                    aria-label="작성자 이름"
                  />
                  <Input
                    value={form.authorRole ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, authorRole: e.target.value }))}
                    placeholder="소개 (예: 2026학년도 서울대 합격)"
                    aria-label="작성자 소개"
                  />
                </div>
              )}
            </FormField>

            {internal && (
              <FormField label="본문">
                <MarkdownEditor
                  value={form.body ?? ""}
                  onChange={(v) => setForm((f) => ({ ...f, body: v }))}
                  placeholder="본문을 작성하세요... (# 소제목, **굵게**, - 목록, > 인용, 이미지 붙여넣기)"
                />
              </FormField>
            )}

            <FormField label={internal ? "외부 링크 (선택)" : "URL"} htmlFor="content-url" required={!internal}>
              <Input
                id="content-url"
                value={form.url ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder={
                  internal ? "https:// 원문·영상 링크가 있으면 입력" : "https:// 유튜브·블로그 링크"
                }
              />
            </FormField>

            <FormField label="커버 이미지 (선택)">
              <div className="flex items-start gap-x3">
                {coverPreview ? (
                  <div className="relative shrink-0">
                    {/* 외부/Blob 이미지 URL 미리보기 — next/image 도메인 설정 불필요하도록 img 사용 */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={coverPreview}
                      alt=""
                      className="h-20 w-32 rounded-r2 border border-stroke-neutral-muted object-cover"
                    />
                    <button
                      type="button"
                      aria-label="커버 이미지 제거"
                      title="커버 이미지 제거"
                      onClick={() => setForm((f) => ({ ...f, coverImageUrl: "" }))}
                      className="absolute -right-2 -top-2 grid size-x6 place-items-center rounded-full bg-bg-neutral-inverted text-fg-neutral-inverted transition-opacity hover:opacity-80"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex h-20 w-32 shrink-0 items-center justify-center rounded-r2 border border-dashed border-stroke-neutral-weak t2-regular text-fg-neutral-subtle">
                    미리보기 없음
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-x2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="self-start"
                    disabled={uploading}
                    onClick={() => coverFileRef.current?.click()}
                  >
                    {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
                    {uploading ? "업로드 중…" : "이미지 업로드"}
                  </Button>
                  <input
                    ref={coverFileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) uploadCover(file);
                    }}
                  />
                  <Input
                    value={form.coverImageUrl ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, coverImageUrl: e.target.value }))}
                    placeholder="또는 https:// 이미지 주소 직접 입력"
                    aria-label="커버 이미지 주소"
                  />
                </div>
              </div>
            </FormField>

            <div className="grid gap-x4 sm:grid-cols-2 sm:items-end">
              <FormField label="발행일" htmlFor="content-published-at">
                <Input
                  id="content-published-at"
                  type="date"
                  value={form.publishedAt}
                  onChange={(e) => setForm((f) => ({ ...f, publishedAt: e.target.value }))}
                  className="tabular-nums"
                />
              </FormField>
              <label className="flex h-10 cursor-pointer items-center gap-x2 t4-regular text-fg-neutral">
                <Checkbox
                  checked={form.visible ?? true}
                  onCheckedChange={(c) => setForm((f) => ({ ...f, visible: c === true }))}
                />
                공개
                <span className="t3-regular text-fg-neutral-subtle">랜딩 페이지·학생 포털에 노출</span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              취소
            </Button>
            <Button onClick={submit} disabled={busy || uploading}>
              {busy ? "저장 중…" : editingId ? "저장" : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

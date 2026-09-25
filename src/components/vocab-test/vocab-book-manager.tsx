"use client";

import { useState, useTransition, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  EmptyState, FilterChip, FormField, Section, Segmented, Skeleton, StatusBadge,
} from "@/components/backoffice/ui";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BookOpen, Plus, Upload, Archive, ArchiveRestore, Trash2, Pencil, FileDown, Languages } from "lucide-react";
import { useConfirmDialog } from "@/components/suggestions/use-confirm-dialog";
import {
  createVocabBook, setVocabBookArchived, deleteVocabBook,
  getVocabBookEntries, importVocabEntriesCsv, addVocabEntry, updateVocabEntry, deleteVocabEntry,
} from "@/actions/vocab-online";
import { parseVocabCsv, type VocabCsvRow } from "@/lib/csv";

export type VocabBookSummary = {
  id: string;
  name: string;
  description: string | null;
  isArchived: boolean;
  entryCount: number;
  units: { unit: string; count: number }[];
};

type Entry = {
  id: string;
  word: string;
  meanings: string[];
  unit: string | null;
  partOfSpeech: string | null;
  example: string | null;
  order: number;
};

/** 구분자 등 짧은 기호 표시 */
function Sym({ children }: { children: React.ReactNode }) {
  return <span className="mx-x0_5 inline-block rounded-r1 bg-bg-neutral-weak px-x1 t3-medium text-fg-neutral">{children}</span>;
}

const CSV_TEMPLATE = `word,meaning,unit\nabandon,버리다; 포기하다,Day 1\nability,능력,Day 1\nabsolute,절대적인,Day 1`;

export function VocabBookManager({ books }: { books: VocabBookSummary[] }) {
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const selectedBook = books.find((b) => b.id === selectedId) ?? null;

  const loadEntries = (bookId: string) => {
    setSelectedId(bookId);
    setEntries(null);
    setLoadingEntries(true);
    getVocabBookEntries(bookId)
      .then((rows) => setEntries(rows as Entry[]))
      .catch((e) => toast.error(e instanceof Error ? e.message : "단어 목록 로드 실패"))
      .finally(() => setLoadingEntries(false));
  };

  // ── 단어장 생성 ──
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const onCreate = () => {
    if (!newName.trim()) return toast.error("단어장 이름을 입력하세요");
    startTransition(async () => {
      try {
        await createVocabBook(newName, newDesc);
        toast.success("단어장을 만들었습니다");
        setCreateOpen(false);
        setNewName("");
        setNewDesc("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "생성 실패");
      }
    });
  };

  const downloadTemplate = () => {
    const blob = new Blob(["﻿" + CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vocab-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-x5">
      <div className="flex flex-col gap-x3 sm:flex-row sm:items-center sm:justify-between">
        <p className="t4-regular text-fg-neutral-subtle">
          단어장을 만들고 CSV 업로드나 직접 입력으로 단어를 채워요. 한 셀에 뜻이 여럿이면 <Sym>;</Sym> 또는 <Sym>/</Sym> 로 구분해요.
        </p>
        <div className="flex shrink-0 gap-x2">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <FileDown /> CSV 양식
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus /> 단어장 만들기
          </Button>
        </div>
      </div>

      {books.length === 0 ? (
        <Section>
          <EmptyState
            icon={BookOpen}
            title="아직 단어장이 없어요"
            description="단어장을 만들고 CSV로 단어를 한 번에 올려 보세요."
            action={
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus /> 단어장 만들기
              </Button>
            }
          />
        </Section>
      ) : (
        <div className="grid grid-cols-1 gap-x3 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((b) => {
            const active = selectedId === b.id;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => loadEntries(b.id)}
                aria-pressed={active}
                className={cn(
                  "flex flex-col items-start gap-x1 rounded-r4 border bg-bg-layer-default p-x5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus-ring",
                  active
                    ? "border-stroke-neutral-contrast shadow-[inset_0_0_0_1px_var(--seed-color-stroke-neutral-contrast)]"
                    : "border-stroke-neutral-muted hover:bg-bg-layer-default-pressed",
                )}
              >
                <span className="flex w-full items-center gap-x2">
                  <span className={cn("min-w-0 truncate t5-bold", b.isArchived ? "text-fg-neutral-subtle" : "text-fg-neutral")}>{b.name}</span>
                  {b.isArchived && <StatusBadge tone="gray" className="shrink-0">보관</StatusBadge>}
                </span>
                {b.description && <span className="line-clamp-2 t4-regular text-fg-neutral-subtle">{b.description}</span>}
                <span className="mt-x2 t3-regular tabular-nums text-fg-neutral-muted">
                  단어 <span className="t3-bold text-fg-neutral">{b.entryCount}</span>개
                  {b.units.length > 0 ? ` · 단원 ${b.units.length}개` : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selectedBook && (
        <BookDetail
          key={selectedBook.id}
          book={selectedBook}
          entries={entries}
          loading={loadingEntries}
          isPending={isPending}
          reload={() => loadEntries(selectedBook.id)}
          startTransition={startTransition}
        />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>단어장 만들기</DialogTitle>
            <DialogDescription>예: 워드마스터 수능2000</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-x4"
            onSubmit={(e) => {
              e.preventDefault();
              onCreate();
            }}
          >
            <FormField label="이름" htmlFor="vocab-book-name" required>
              <Input id="vocab-book-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="단어장 이름" />
            </FormField>
            <FormField label="설명" htmlFor="vocab-book-desc">
              <Input id="vocab-book-desc" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="선택 사항" />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>취소</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "만드는 중…" : "만들기"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BookDetail({
  book, entries, loading, isPending, reload, startTransition,
}: {
  book: VocabBookSummary;
  entries: Entry[] | null;
  loading: boolean;
  isPending: boolean;
  reload: () => void;
  startTransition: (cb: () => void) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<{ rows: VocabCsvRow[]; errors: { line: number; message: string }[] } | null>(null);
  const [importMode, setImportMode] = useState<"append" | "replace">("append");

  const [unitFilter, setUnitFilter] = useState<string>("");

  // 새 단어 추가 폼
  const [addWord, setAddWord] = useState("");
  const [addMeanings, setAddMeanings] = useState("");
  const [addUnit, setAddUnit] = useState("");

  // 단어 수정 다이얼로그
  const [editEntry, setEditEntry] = useState<Entry | null>(null);
  const { confirm, dialog } = useConfirmDialog();

  const onFile = (f: File | null) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "").replace(/^﻿/, "");
      setCsvText(text);
      setPreview(parseVocabCsv(text));
    };
    reader.readAsText(f);
  };

  const doImport = () => {
    if (!preview || preview.rows.length === 0) return toast.error("가져올 단어가 없습니다");
    startTransition(async () => {
      try {
        const res = await importVocabEntriesCsv(book.id, csvText, importMode);
        toast.success(`${res.added}개 단어를 가져왔습니다${res.errors.length ? ` (오류 ${res.errors.length}건 건너뜀)` : ""}`);
        setCsvText("");
        setPreview(null);
        reload();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "가져오기 실패");
      }
    });
  };

  const onAdd = () => {
    if (!addWord.trim() || !addMeanings.trim()) return toast.error("단어와 뜻을 입력하세요");
    startTransition(async () => {
      try {
        await addVocabEntry(book.id, { word: addWord, meaningsRaw: addMeanings, unit: addUnit });
        setAddWord(""); setAddMeanings("");
        reload();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "추가 실패");
      }
    });
  };

  const onDeleteEntry = async (id: string) => {
    const ok = await confirm({ title: "이 단어를 삭제할까요?", confirmLabel: "삭제", destructive: true });
    if (!ok) return;
    startTransition(async () => {
      try { await deleteVocabEntry(id); reload(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "삭제 실패"); }
    });
  };

  const filtered = (entries ?? []).filter((e) => !unitFilter || e.unit === unitFilter);

  const onDeleteBook = async () => {
    const ok = await confirm({
      title: `"${book.name}" 단어장을 삭제할까요?`,
      description: "출제 이력이 있는 단어장은 삭제할 수 없어요. 대신 보관해 주세요.",
      confirmLabel: "삭제",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      try { await deleteVocabBook(book.id); toast.success("삭제했습니다"); }
      catch (e) { toast.error(e instanceof Error ? e.message : "삭제 실패"); }
    });
  };

  return (
    <Section
      title={book.name}
      description={`단어 ${book.entryCount}개${book.units.length > 0 ? ` · 단원 ${book.units.length}개` : ""}`}
      actions={
        <>
          <Button
            variant="secondary" size="sm"
            onClick={() => startTransition(async () => {
              try { await setVocabBookArchived(book.id, !book.isArchived); toast.success(book.isArchived ? "보관 해제" : "보관 처리"); }
              catch (e) { toast.error(e instanceof Error ? e.message : "실패"); }
            })}
          >
            {book.isArchived ? <><ArchiveRestore /> 보관 해제</> : <><Archive /> 보관</>}
          </Button>
          <Button variant="ghost" size="sm" className="text-fg-critical" onClick={onDeleteBook}>
            <Trash2 /> 삭제
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-x6">
        {/* CSV 업로드 */}
        <div className="flex flex-col gap-x3 rounded-r3 bg-bg-layer-fill p-x4">
          <div>
            <p className="flex items-center gap-x1_5 t4-bold text-fg-neutral">
              <Upload className="size-4" aria-hidden /> CSV 업로드 · 붙여넣기
            </p>
            <p className="mt-x1 t3-regular text-fg-neutral-subtle">
              열 순서: word, meaning, unit(선택), pos(선택), example(선택) · 헤더 행은 자동으로 알아봐요. 한 셀에 뜻이 여럿이면 <Sym>;</Sym>·<Sym>/</Sym> 로 구분해요.
            </p>
          </div>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
          <div>
            <Button variant="outline" size="sm" className="bg-bg-layer-default" onClick={() => fileRef.current?.click()}>
              <Upload /> CSV 파일 선택
            </Button>
          </div>
          <Textarea
            rows={5}
            placeholder={"여기에 표를 붙여넣어도 돼요 (CSV 형식)\n예) apple,사과,Day 1"}
            value={csvText}
            onChange={(e) => { setCsvText(e.target.value); setPreview(e.target.value.trim() ? parseVocabCsv(e.target.value) : null); }}
            className="t3-regular"
            aria-label="CSV 붙여넣기"
          />
          {preview && (
            <div className="flex flex-col gap-x2">
              <p className={cn("t3-medium", preview.rows.length ? "text-fg-positive" : "text-fg-critical")}>
                인식된 단어 {preview.rows.length}개{preview.errors.length ? ` · 오류 ${preview.errors.length}건` : ""}
              </p>
              {preview.errors.slice(0, 5).map((er, i) => (
                <p key={i} className="t3-regular text-fg-critical">{er.line ? `${er.line}행: ` : ""}{er.message}</p>
              ))}
              {preview.rows.length > 0 && (
                <div className="flex flex-wrap items-center gap-x3 pt-x1">
                  <Segmented
                    aria-label="가져오기 방식"
                    value={importMode}
                    onChange={setImportMode}
                    options={[
                      { value: "append", label: "기존에 추가" },
                      { value: "replace", label: "기존 전체 교체" },
                    ]}
                    className="w-auto"
                  />
                  <Button size="sm" onClick={doImport} disabled={isPending}>
                    {isPending ? "가져오는 중…" : `${preview.rows.length}개 가져오기`}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 단어 직접 추가 */}
        <form
          className="grid grid-cols-1 items-end gap-x3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_120px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            onAdd();
          }}
        >
          <FormField label="영단어" htmlFor={`add-word-${book.id}`}>
            <Input id={`add-word-${book.id}`} value={addWord} onChange={(e) => setAddWord(e.target.value)} placeholder="apple" />
          </FormField>
          <FormField label="뜻" htmlFor={`add-meaning-${book.id}`}>
            <Input id={`add-meaning-${book.id}`} value={addMeanings} onChange={(e) => setAddMeanings(e.target.value)} placeholder="사과; 사과나무" />
          </FormField>
          <FormField label="단원" htmlFor={`add-unit-${book.id}`}>
            <Input id={`add-unit-${book.id}`} value={addUnit} onChange={(e) => setAddUnit(e.target.value)} placeholder="Day 1" />
          </FormField>
          <Button type="submit" variant="ink" disabled={isPending}><Plus /> 추가</Button>
        </form>

        {/* 단어 목록 */}
        <div className="flex flex-col gap-x3">
          {book.units.length > 0 && (
            <div className="flex flex-wrap gap-x1_5">
              <FilterChip selected={unitFilter === ""} onClick={() => setUnitFilter("")}>전체</FilterChip>
              {book.units.map((u) => (
                <FilterChip key={u.unit} selected={unitFilter === u.unit} count={u.count} onClick={() => setUnitFilter(u.unit)}>
                  {u.unit}
                </FilterChip>
              ))}
            </div>
          )}
          {loading ? (
            <div className="flex flex-col gap-x2" aria-label="불러오는 중">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : entries === null ? null : filtered.length === 0 ? (
            <div className="rounded-r3 border border-stroke-neutral-muted">
              <EmptyState compact icon={Languages} title="단어가 없어요" description="CSV로 올리거나 위에서 직접 추가해 보세요." />
            </div>
          ) : (
            <div className="max-h-[480px] overflow-auto rounded-r3 border border-stroke-neutral-muted">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-right">#</TableHead>
                    <TableHead>영단어</TableHead>
                    <TableHead>뜻</TableHead>
                    <TableHead className="w-28">단원</TableHead>
                    <TableHead className="w-24"><span className="sr-only">관리</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((e, idx) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-right t3-regular text-fg-neutral-subtle">{idx + 1}</TableCell>
                      <TableCell className="t4-medium">
                        {e.word}
                        {e.partOfSpeech ? <span className="ml-x1 t3-regular text-fg-neutral-subtle">({e.partOfSpeech})</span> : null}
                      </TableCell>
                      <TableCell>{e.meanings.join(" / ")}</TableCell>
                      <TableCell className="t3-regular text-fg-neutral-muted">{e.unit ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-x1">
                          <Button variant="ghost" size="icon" className="size-8" aria-label={`${e.word} 수정`} onClick={() => setEditEntry(e)}><Pencil /></Button>
                          <Button variant="ghost" size="icon" className="size-8 text-fg-critical" aria-label={`${e.word} 삭제`} onClick={() => onDeleteEntry(e.id)}><Trash2 /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {editEntry && (
        <EditEntryDialog
          entry={editEntry}
          onClose={() => setEditEntry(null)}
          onSaved={() => { setEditEntry(null); reload(); }}
        />
      )}
      {dialog}
    </Section>
  );
}

function EditEntryDialog({ entry, onClose, onSaved }: { entry: Entry; onClose: () => void; onSaved: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [word, setWord] = useState(entry.word);
  const [meanings, setMeanings] = useState(entry.meanings.join("; "));
  const [unit, setUnit] = useState(entry.unit ?? "");
  const [pos, setPos] = useState(entry.partOfSpeech ?? "");
  const [example, setExample] = useState(entry.example ?? "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>단어 수정</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-x4">
          <FormField label="영단어" htmlFor="edit-entry-word" required>
            <Input id="edit-entry-word" value={word} onChange={(e) => setWord(e.target.value)} />
          </FormField>
          <FormField label="뜻" htmlFor="edit-entry-meanings" required hint="여러 개는 ; 또는 / 로 구분해요">
            <Input id="edit-entry-meanings" value={meanings} onChange={(e) => setMeanings(e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-x3">
            <FormField label="단원" htmlFor="edit-entry-unit">
              <Input id="edit-entry-unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
            </FormField>
            <FormField label="품사" htmlFor="edit-entry-pos">
              <Input id="edit-entry-pos" value={pos} onChange={(e) => setPos(e.target.value)} />
            </FormField>
          </div>
          <FormField label="예문" htmlFor="edit-entry-example">
            <Input id="edit-entry-example" value={example} onChange={(e) => setExample(e.target.value)} placeholder="선택 사항" />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button
            disabled={isPending}
            onClick={() => startTransition(async () => {
              try { await updateVocabEntry(entry.id, { word, meaningsRaw: meanings, unit, partOfSpeech: pos, example }); onSaved(); }
              catch (e) { toast.error(e instanceof Error ? e.message : "저장 실패"); }
            })}
          >{isPending ? "저장 중…" : "저장"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

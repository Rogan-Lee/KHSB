"use client";

import { useState, useTransition, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { BookOpen, Plus, Upload, Archive, ArchiveRestore, Trash2, Pencil, FileDown } from "lucide-react";
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          단어장을 만들고 CSV 업로드 또는 직접 입력으로 단어를 채웁니다. (한 셀에 여러 뜻은 <code>;</code> 또는 <code>/</code> 로 구분)
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <FileDown className="h-4 w-4 mr-1" /> CSV 양식
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> 단어장 만들기
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {books.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-full">아직 단어장이 없습니다.</p>
        )}
        {books.map((b) => (
          <Card
            key={b.id}
            className={`cursor-pointer transition-colors ${selectedId === b.id ? "ring-2 ring-primary" : "hover:bg-muted/40"} ${b.isArchived ? "opacity-60" : ""}`}
            onClick={() => loadEntries(b.id)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                {b.name}
                {b.isArchived && <Badge variant="secondary">보관</Badge>}
              </CardTitle>
              {b.description && <CardDescription>{b.description}</CardDescription>}
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              단어 {b.entryCount}개{b.units.length > 0 ? ` · 단원 ${b.units.length}개` : ""}
            </CardContent>
          </Card>
        ))}
      </div>

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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>단어장 만들기</DialogTitle>
            <DialogDescription>예: 워드마스터 수능2000</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>이름</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="단어장 이름" />
            </div>
            <div>
              <Label>설명 (선택)</Label>
              <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="설명" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>취소</Button>
            <Button onClick={onCreate} disabled={isPending}>만들기</Button>
          </DialogFooter>
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

  const onDeleteEntry = (id: string) => {
    if (!confirm("이 단어를 삭제할까요?")) return;
    startTransition(async () => {
      try { await deleteVocabEntry(id); reload(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "삭제 실패"); }
    });
  };

  const filtered = (entries ?? []).filter((e) => !unitFilter || e.unit === unitFilter);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{book.name}</CardTitle>
          <CardDescription>단어 {book.entryCount}개</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => startTransition(async () => {
              try { await setVocabBookArchived(book.id, !book.isArchived); toast.success(book.isArchived ? "보관 해제" : "보관 처리"); }
              catch (e) { toast.error(e instanceof Error ? e.message : "실패"); }
            })}
          >
            {book.isArchived ? <><ArchiveRestore className="h-4 w-4 mr-1" /> 보관 해제</> : <><Archive className="h-4 w-4 mr-1" /> 보관</>}
          </Button>
          <Button
            variant="outline" size="sm" className="text-destructive"
            onClick={() => {
              if (!confirm(`"${book.name}" 단어장을 삭제할까요? (출제 이력이 있으면 삭제 불가)`)) return;
              startTransition(async () => {
                try { await deleteVocabBook(book.id); toast.success("삭제했습니다"); }
                catch (e) { toast.error(e instanceof Error ? e.message : "삭제 실패"); }
              });
            }}
          >
            <Trash2 className="h-4 w-4 mr-1" /> 삭제
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* CSV 업로드 */}
        <div className="rounded-lg border p-3 space-y-2 bg-muted/20">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Upload className="h-4 w-4" /> CSV 업로드 / 붙여넣기
          </div>
          <p className="text-xs text-muted-foreground">
            컬럼: <code>word, meaning, unit?, pos?, example?</code> (헤더 행 자동 인식, 한 셀 여러 뜻은 <code>;</code>·<code>/</code> 구분)
          </p>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>CSV 파일 선택</Button>
          </div>
          <Textarea
            rows={5}
            placeholder={"여기에 표를 붙여넣어도 됩니다 (CSV 형식)\n예) apple,사과,Day 1"}
            value={csvText}
            onChange={(e) => { setCsvText(e.target.value); setPreview(e.target.value.trim() ? parseVocabCsv(e.target.value) : null); }}
            className="font-mono text-xs"
          />
          {preview && (
            <div className="text-xs space-y-1">
              <p className={preview.rows.length ? "text-green-700" : "text-destructive"}>
                인식된 단어: {preview.rows.length}개{preview.errors.length ? ` · 오류 ${preview.errors.length}건` : ""}
              </p>
              {preview.errors.slice(0, 5).map((er, i) => (
                <p key={i} className="text-destructive">{er.line ? `${er.line}행: ` : ""}{er.message}</p>
              ))}
              {preview.rows.length > 0 && (
                <div className="flex items-center gap-3 pt-1">
                  <label className="flex items-center gap-1"><input type="radio" checked={importMode === "append"} onChange={() => setImportMode("append")} /> 기존에 추가</label>
                  <label className="flex items-center gap-1"><input type="radio" checked={importMode === "replace"} onChange={() => setImportMode("replace")} /> 기존 전체 교체</label>
                  <Button size="sm" onClick={doImport} disabled={isPending}>가져오기</Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 단어 직접 추가 */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[120px]"><Label className="text-xs">영단어</Label><Input value={addWord} onChange={(e) => setAddWord(e.target.value)} placeholder="apple" /></div>
          <div className="flex-1 min-w-[160px]"><Label className="text-xs">뜻 (여러 개는 ; / 구분)</Label><Input value={addMeanings} onChange={(e) => setAddMeanings(e.target.value)} placeholder="사과; 사과나무" /></div>
          <div className="w-28"><Label className="text-xs">단원</Label><Input value={addUnit} onChange={(e) => setAddUnit(e.target.value)} placeholder="Day 1" /></div>
          <Button size="sm" onClick={onAdd} disabled={isPending}><Plus className="h-4 w-4 mr-1" /> 추가</Button>
        </div>

        {/* 단어 목록 */}
        {book.units.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <Button variant={unitFilter === "" ? "default" : "outline"} size="sm" onClick={() => setUnitFilter("")}>전체</Button>
            {book.units.map((u) => (
              <Button key={u.unit} variant={unitFilter === u.unit ? "default" : "outline"} size="sm" onClick={() => setUnitFilter(u.unit)}>
                {u.unit} <span className="ml-1 text-xs opacity-70">{u.count}</span>
              </Button>
            ))}
          </div>
        )}
        {loading ? (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        ) : entries === null ? null : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">단어가 없습니다.</p>
        ) : (
          <div className="max-h-[480px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>영단어</TableHead>
                  <TableHead>뜻</TableHead>
                  <TableHead className="w-24">단원</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e, idx) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-medium">{e.word}{e.partOfSpeech ? <span className="ml-1 text-xs text-muted-foreground">({e.partOfSpeech})</span> : null}</TableCell>
                    <TableCell>{e.meanings.join(" / ")}</TableCell>
                    <TableCell className="text-xs">{e.unit ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditEntry(e)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDeleteEntry(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {editEntry && (
        <EditEntryDialog
          entry={editEntry}
          onClose={() => setEditEntry(null)}
          onSaved={() => { setEditEntry(null); reload(); }}
        />
      )}
    </Card>
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
      <DialogContent>
        <DialogHeader><DialogTitle>단어 수정</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>영단어</Label><Input value={word} onChange={(e) => setWord(e.target.value)} /></div>
          <div><Label>뜻 (여러 개는 ; / 구분)</Label><Input value={meanings} onChange={(e) => setMeanings(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>단원</Label><Input value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
            <div><Label>품사</Label><Input value={pos} onChange={(e) => setPos(e.target.value)} /></div>
          </div>
          <div><Label>예문 (선택)</Label><Input value={example} onChange={(e) => setExample(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button
            disabled={isPending}
            onClick={() => startTransition(async () => {
              try { await updateVocabEntry(entry.id, { word, meaningsRaw: meanings, unit, partOfSpeech: pos, example }); onSaved(); }
              catch (e) { toast.error(e instanceof Error ? e.message : "저장 실패"); }
            })}
          >저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

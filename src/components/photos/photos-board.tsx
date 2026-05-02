"use client";

import { useMemo, useState, useTransition, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  FolderTree, FolderPlus, Upload, Search, X, Trash2,
  ImageOff, CheckCircle2, AlertCircle, Calendar, User, MapPin,
  ChevronRight, ChevronDown, Folder, HardDrive, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  createPhotoFolder,
  deletePhotoFolder,
  deletePhoto,
  linkPhotoStudent,
  importPhotosFromDrive,
} from "@/actions/photos";

type FolderNode = {
  id: string;
  name: string;
  parentId: string | null;
  isAuto: boolean;
  photoCount: number;
  childCount: number;
};

type PhotoRow = {
  id: string;
  fileName: string;
  url: string;
  thumbnailUrl: string | null;
  parsedDate: Date | null;
  parsedSeatNumber: number | null;
  parsedName: string | null;
  studentId: string | null;
  student: { id: string; name: string; grade: string; seat: string | null } | null;
  folderId: string | null;
  uploadedAt: Date;
  uploadedByName: string;
  sizeBytes: number;
};

type StudentOpt = { id: string; name: string; grade: string; seat: string | null };

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function PhotosBoard({
  folders,
  photos,
  students,
  activeFolderId,
}: {
  folders: FolderNode[];
  photos: PhotoRow[];
  students: StudentOpt[];
  activeFolderId: string | null;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 업로드 진행 상태
  const [uploading, setUploading] = useState(false);
  const [uploadStats, setUploadStats] = useState<{ ok: number; failed: number; total: number; errors: string[] }>({
    ok: 0, failed: 0, total: 0, errors: [],
  });

  // Drive 가져오기 상태
  const [driveOpen, setDriveOpen] = useState(false);
  const [driveUrl, setDriveUrl] = useState("");
  const [driveImporting, setDriveImporting] = useState(false);

  async function handleDriveImport() {
    if (!driveUrl.trim()) {
      toast.error("Drive URL 을 입력하세요");
      return;
    }
    setDriveImporting(true);
    try {
      const result = await importPhotosFromDrive(driveUrl.trim());
      if (result.imported > 0) {
        toast.success(`${result.imported}건 가져오기 완료${result.failed > 0 ? ` (실패 ${result.failed}건)` : ""}`);
        setDriveOpen(false);
        setDriveUrl("");
        router.refresh();
      } else {
        toast.error(result.failed > 0 ? `모두 실패 (${result.failed}건)` : "가져올 이미지가 없습니다");
      }
      if (result.errors.length > 0) {
        console.warn("[Drive import errors]", result.errors);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "가져오기 실패");
    } finally {
      setDriveImporting(false);
    }
  }

  // 필터
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return photos;
    return photos.filter((p) =>
      p.fileName.toLowerCase().includes(q) ||
      (p.parsedName?.toLowerCase().includes(q) ?? false) ||
      (p.parsedSeatNumber != null && String(p.parsedSeatNumber) === q) ||
      (p.student?.name.toLowerCase().includes(q) ?? false)
    );
  }, [photos, query]);

  // 폴더 트리 빌드
  const rootFolders = folders.filter((f) => !f.parentId);
  const childrenOf = (id: string) => folders.filter((f) => f.parentId === id);

  function navFolder(id: string | null) {
    const params = new URLSearchParams(sp.toString());
    if (id) params.set("folder", id);
    else params.delete("folder");
    router.push(`/photos${params.toString() ? `?${params}` : ""}`);
  }

  function toggleFolderExpand(id: string) {
    setExpandedFolders((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleFiles(files: FileList | File[]) {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;
    setUploading(true);
    setUploadStats({ ok: 0, failed: 0, total: fileArr.length, errors: [] });

    for (const file of fileArr) {
      const fd = new FormData();
      fd.append("file", file);
      try {
        const res = await fetch("/api/photos/upload", { method: "POST", body: fd });
        if (res.ok) {
          setUploadStats((s) => ({ ...s, ok: s.ok + 1 }));
        } else {
          const err = await res.json().catch(() => ({}));
          setUploadStats((s) => ({
            ...s,
            failed: s.failed + 1,
            errors: [...s.errors, `${file.name}: ${err.error ?? "실패"}`],
          }));
        }
      } catch (e) {
        setUploadStats((s) => ({
          ...s,
          failed: s.failed + 1,
          errors: [...s.errors, `${file.name}: 네트워크 오류`],
        }));
      }
    }

    setUploading(false);
    router.refresh();
    toast.success(`업로드 완료: 성공 ${fileArr.length - uploadStats.failed}건`);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  }

  function handleCreateFolder() {
    const name = prompt("새 폴더 이름");
    if (!name?.trim()) return;
    startTransition(async () => {
      try {
        await createPhotoFolder({ name, parentId: activeFolderId });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "폴더 생성 실패");
      }
    });
  }

  function handleDeleteFolder(id: string) {
    if (!confirm("이 폴더를 삭제하시겠습니까?\n(사진/하위 폴더가 있으면 삭제 불가)")) return;
    startTransition(async () => {
      try {
        await deletePhotoFolder(id);
        if (activeFolderId === id) navFolder(null);
        else router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "삭제 실패");
      }
    });
  }

  function handleDeletePhoto(id: string) {
    if (!confirm("이 사진을 삭제하시겠습니까?")) return;
    startTransition(async () => {
      try {
        await deletePhoto(id);
        setSelectedId(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "삭제 실패");
      }
    });
  }

  function handleLinkStudent(photoId: string, studentId: string | null) {
    startTransition(async () => {
      try {
        await linkPhotoStudent(photoId, studentId);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "매칭 실패");
      }
    });
  }

  const selectedPhoto = photos.find((p) => p.id === selectedId);
  const activeFolder = folders.find((f) => f.id === activeFolderId);

  function FolderRow({ folder, depth = 0 }: { folder: FolderNode; depth?: number }) {
    const kids = childrenOf(folder.id);
    const expanded = expandedFolders[folder.id] ?? (folder.isAuto && depth === 0);
    const isActive = activeFolderId === folder.id;
    return (
      <div>
        <div
          className={cn(
            "flex items-center gap-1 px-2 py-1 text-sm rounded-md group",
            isActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/60"
          )}
          style={{ paddingLeft: 8 + depth * 12 }}
        >
          {kids.length > 0 ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleFolderExpand(folder.id); }}
              className="p-0.5 rounded hover:bg-muted"
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          ) : (
            <span className="w-4" />
          )}
          <button
            type="button"
            onClick={() => navFolder(folder.id)}
            className="flex-1 flex items-center gap-1.5 text-left min-w-0"
          >
            <Folder className={cn("h-3.5 w-3.5 shrink-0", folder.isAuto ? "text-blue-500" : "text-amber-500")} />
            <span className="truncate">{folder.name}</span>
            {folder.photoCount > 0 && (
              <span className="text-[10px] text-muted-foreground ml-auto">{folder.photoCount}</span>
            )}
          </button>
          {!folder.isAuto && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-0.5"
              title="폴더 삭제"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
        {expanded && kids.map((c) => <FolderRow key={c.id} folder={c} depth={depth + 1} />)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[240px_1fr_280px] gap-3 min-h-[calc(100vh-180px)]">
      {/* LEFT — 폴더 트리 */}
      <div className="border rounded-lg bg-card overflow-hidden flex flex-col">
        <div className="flex items-center gap-2 px-3 py-2 border-b">
          <FolderTree className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1">폴더</span>
          <button
            type="button"
            onClick={handleCreateFolder}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title="새 폴더"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          <button
            type="button"
            onClick={() => navFolder(null)}
            className={cn(
              "w-full flex items-center gap-1.5 px-2 py-1 text-sm rounded-md mx-1",
              activeFolderId === null ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/60"
            )}
          >
            <Folder className="h-3.5 w-3.5 text-muted-foreground" />
            전체 (최근 100장)
          </button>
          <div className="mt-1">
            {rootFolders.length === 0 ? (
              <p className="text-xs text-muted-foreground px-3 py-4 text-center">
                폴더가 없습니다. 사진을 업로드하면 날짜별 폴더가 자동 생성됩니다.
              </p>
            ) : (
              rootFolders.map((f) => <FolderRow key={f.id} folder={f} />)
            )}
          </div>
        </div>
      </div>

      {/* CENTER — 그리드 + 툴바 */}
      <div className="flex flex-col gap-3 min-w-0">
        {/* 툴바 */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="h-4 w-4 mr-1" />
            {uploading ? `업로드 중 (${uploadStats.ok + uploadStats.failed}/${uploadStats.total})` : "사진 업로드"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDriveOpen(true)}
            disabled={uploading || driveImporting}
          >
            <HardDrive className="h-4 w-4 mr-1" />
            Drive 에서 가져오기
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/jpg,image/png,image/heic,image/heif,image/webp,.heic,.heif"
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          <div className="relative flex-1 min-w-0 max-w-xs">
            <Search className="absolute left-2 top-1.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="파일명/이름/좌석 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 h-8"
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <span className="text-xs text-muted-foreground ml-auto">
            {activeFolder ? `${activeFolder.name} · ` : ""}
            {filtered.length}장
          </span>
        </div>

        {/* 업로드 결과 배너 */}
        {uploadStats.total > 0 && !uploading && uploadStats.failed > 0 && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs">
            <div className="flex items-center gap-1 font-semibold text-red-700 mb-1">
              <AlertCircle className="h-3.5 w-3.5" />
              실패 {uploadStats.failed}건
            </div>
            <ul className="list-disc pl-5 text-red-700/80 space-y-0.5 max-h-32 overflow-y-auto">
              {uploadStats.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
              {uploadStats.errors.length > 10 && (
                <li className="list-none">…외 {uploadStats.errors.length - 10}건</li>
              )}
            </ul>
            <button
              className="mt-1 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setUploadStats({ ok: 0, failed: 0, total: 0, errors: [] })}
            >
              닫기
            </button>
          </div>
        )}

        {/* 드롭존 + 그리드 */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "flex-1 border-2 border-dashed rounded-lg p-3 transition-colors",
            dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/10"
          )}
        >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <ImageOff className="h-10 w-10 mb-2 opacity-30" />
              <p className="text-sm">
                {query ? "검색 결과 없음" : "사진을 드래그하거나 상단의 '사진 업로드'를 사용하세요"}
              </p>
              <p className="text-[11px] mt-1 opacity-80">
                파일명 규칙: <code className="bg-muted px-1 rounded">YYYYMMDD_좌석_이름.jpg</code>
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={cn(
                    "relative aspect-square rounded-md overflow-hidden border bg-muted group transition-all",
                    selectedId === p.id ? "ring-2 ring-primary border-primary" : "hover:ring-1 hover:ring-border"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.thumbnailUrl ?? p.url}
                    alt={p.fileName}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  {p.studentId ? (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent text-white p-1.5 text-[10px] font-medium truncate">
                      <CheckCircle2 className="h-3 w-3 inline mr-0.5" />
                      {p.student?.name}
                    </div>
                  ) : (
                    <div className="absolute top-1 right-1">
                      <span className="bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                        매칭 필요
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — 상세 패널 */}
      <div className="border rounded-lg bg-card overflow-hidden flex flex-col">
        {!selectedPhoto ? (
          <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground p-4 text-center">
            사진을 선택하면 상세 정보가 여기에 표시됩니다
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            <div className="aspect-square bg-muted relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selectedPhoto.url} alt={selectedPhoto.fileName} className="w-full h-full object-contain" />
            </div>
            <div className="p-3 space-y-2 overflow-y-auto">
              <p className="text-xs font-mono break-all">{selectedPhoto.fileName}</p>
              <div className="text-[11px] text-muted-foreground space-y-1">
                <p className="flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" /> 파싱 날짜: {fmtDate(selectedPhoto.parsedDate)}
                </p>
                <p className="flex items-center gap-1.5 flex-wrap">
                  <MapPin className="h-3 w-3" />
                  <span>촬영 당시 좌석: {selectedPhoto.parsedSeatNumber ?? "—"}</span>
                  {selectedPhoto.student && (() => {
                    const currentSeat = selectedPhoto.student.seat;
                    const recorded = selectedPhoto.parsedSeatNumber != null ? String(selectedPhoto.parsedSeatNumber) : null;
                    const moved = currentSeat != null && recorded != null && currentSeat !== recorded;
                    return (
                      <span className={cn(
                        "ml-1 px-1.5 py-0.5 rounded text-[10px] border",
                        moved
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-muted/40 text-muted-foreground border-border"
                      )}>
                        현재 좌석: {currentSeat ?? "미배정"}
                        {moved && " · 이동"}
                      </span>
                    );
                  })()}
                </p>
                <p className="flex items-center gap-1.5">
                  <User className="h-3 w-3" /> 파싱 이름: {selectedPhoto.parsedName ?? "—"}
                </p>
                <p>크기: {formatBytes(selectedPhoto.sizeBytes)}</p>
                <p>업로더: {selectedPhoto.uploadedByName}</p>
              </div>

              <div className="pt-2 border-t">
                <p className="text-xs font-semibold mb-1">학생 매칭</p>
                {selectedPhoto.student ? (
                  <div className="flex items-center justify-between gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded text-xs">
                    <span>
                      <CheckCircle2 className="h-3 w-3 inline mr-1 text-emerald-600" />
                      {selectedPhoto.student.name} ({selectedPhoto.student.grade})
                    </span>
                    <button
                      onClick={() => handleLinkStudent(selectedPhoto.id, null)}
                      className="text-[10px] text-muted-foreground hover:text-destructive"
                    >
                      해제
                    </button>
                  </div>
                ) : (
                  <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-2">
                    자동 매칭 실패 (좌석+이름 불일치)
                  </div>
                )}
                <select
                  className="w-full text-xs border rounded px-2 py-1 bg-background"
                  value={selectedPhoto.studentId ?? ""}
                  onChange={(e) => handleLinkStudent(selectedPhoto.id, e.target.value || null)}
                  disabled={isPending}
                >
                  <option value="">— 수동 선택 —</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.grade}){s.seat ? ` · ${s.seat}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 border-t flex gap-2">
                <a
                  href={selectedPhoto.url}
                  download={selectedPhoto.fileName}
                  className="flex-1 text-center text-xs border rounded py-1.5 hover:bg-muted"
                >
                  원본 다운로드
                </a>
                <button
                  onClick={() => handleDeletePhoto(selectedPhoto.id)}
                  className="flex-1 text-xs border rounded py-1.5 text-destructive hover:bg-red-50 border-red-200"
                >
                  <Trash2 className="h-3 w-3 inline mr-1" />
                  삭제
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Drive 가져오기 모달 */}
      {driveOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !driveImporting && setDriveOpen(false)}
        >
          <div
            className="bg-background rounded-lg shadow-lg w-full max-w-md p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Google Drive 에서 사진 가져오기</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Drive 폴더 또는 파일 URL 을 붙여넣으세요. 폴더면 그 안의 모든 이미지를 한 번에 가져옵니다.
              파일명이 <code className="bg-muted px-1 rounded">YYYYMMDD_좌석_이름.jpg</code> 형식이면 학생 자동 매칭, 아니면 오늘 날짜 폴더로 들어갑니다.
            </p>
            <Input
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              className="text-xs"
              disabled={driveImporting}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDriveOpen(false)}
                disabled={driveImporting}
              >
                취소
              </Button>
              <Button size="sm" onClick={handleDriveImport} disabled={driveImporting || !driveUrl.trim()}>
                {driveImporting ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />가져오는 중…</> : "가져오기"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              ⓘ Google 계정에 Drive 권한이 필요합니다. 미연동 상태면 /students 페이지의 Google 연결 버튼으로 먼저 연동하세요.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Plus,
  MoreHorizontal,
  Search,
  Phone,
  MapPin,
  Calendar,
  Trash2,
} from "lucide-react";
import {
  createLead,
  updateLeadStatus,
  updateLead,
  deleteLead,
} from "@/actions/leads";
import type { LeadStatus } from "@/generated/prisma";

const STATUS_CONFIG: Record<
  LeadStatus,
  { label: string; color: string }
> = {
  NEW: { label: "신규", color: "bg-blue-100 text-blue-700 border-blue-200" },
  CONTACTED: {
    label: "연락 완료",
    color: "bg-cyan-100 text-cyan-700 border-cyan-200",
  },
  DEMO_SCHEDULED: {
    label: "데모 예약",
    color: "bg-purple-100 text-purple-700 border-purple-200",
  },
  DEMO_DONE: {
    label: "데모 완료",
    color: "bg-indigo-100 text-indigo-700 border-indigo-200",
  },
  NEGOTIATING: {
    label: "가격 협의",
    color: "bg-orange-100 text-orange-700 border-orange-200",
  },
  CONVERTED: {
    label: "가입 완료",
    color: "bg-green-100 text-green-700 border-green-200",
  },
  LOST: { label: "이탈", color: "bg-gray-100 text-gray-500 border-gray-200" },
};

const ALL_STATUSES = Object.keys(STATUS_CONFIG) as LeadStatus[];

type Lead = {
  id: string;
  name: string;
  phone: string;
  location: string | null;
  currentMethod: string | null;
  status: LeadStatus;
  source: string | null;
  referredBy: string | null;
  notes: string | null;
  nextFollowUp: Date | null;
  convertedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function LeadsTable({ leads }: { leads: Lead[] }) {
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);

  const filtered = leads.filter((lead) => {
    const matchesSearch =
      !search ||
      lead.name.toLowerCase().includes(search.toLowerCase()) ||
      lead.phone.includes(search) ||
      lead.location?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || lead.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  function handleStatusChange(id: string, status: LeadStatus) {
    startTransition(async () => {
      try {
        await updateLeadStatus(id, status);
        toast.success("상태가 변경되었습니다");
      } catch {
        toast.error("상태 변경에 실패했습니다");
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm("이 리드를 삭제하시겠습니까?")) return;
    startTransition(async () => {
      try {
        await deleteLead(id);
        toast.success("리드가 삭제되었습니다");
      } catch {
        toast.error("삭제에 실패했습니다");
      }
    });
  }

  function openEdit(lead: Lead) {
    setEditLead(lead);
    setEditOpen(true);
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">리드 관리</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            상담 신청 및 잠재 고객을 추적하고 전환율을 관리합니다.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          리드 추가
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="이름, 연락처, 위치로 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="상태 필터" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {ALL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_CONFIG[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              {leads.length === 0
                ? "아직 리드가 없습니다. 랜딩페이지에서 상담 신청이 들어오면 자동으로 추가됩니다."
                : "검색 결과가 없습니다."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">상태</TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead className="hidden md:table-cell">연락처</TableHead>
                  <TableHead className="hidden md:table-cell">위치</TableHead>
                  <TableHead className="hidden lg:table-cell">유입 경로</TableHead>
                  <TableHead className="hidden lg:table-cell">접수일</TableHead>
                  <TableHead className="hidden xl:table-cell">팔로업</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((lead) => (
                  <TableRow
                    key={lead.id}
                    className="cursor-pointer hover:bg-accent/50"
                    onClick={() => openEdit(lead)}
                  >
                    <TableCell>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_CONFIG[lead.status].color}`}
                      >
                        {STATUS_CONFIG[lead.status].label}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{lead.name}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="flex items-center gap-1 text-sm">
                        <Phone className="h-3 w-3" />
                        {lead.phone}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {lead.location && (
                        <span className="flex items-center gap-1 text-sm">
                          <MapPin className="h-3 w-3" />
                          {lead.location}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {lead.source && (
                        <Badge variant="outline" className="text-xs">
                          {lead.source}
                        </Badge>
                      )}
                      {lead.referredBy && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({lead.referredBy} 추천)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {new Date(lead.createdAt).toLocaleDateString("ko-KR")}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-sm">
                      {lead.nextFollowUp && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(lead.nextFollowUp).toLocaleDateString(
                            "ko-KR",
                          )}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          asChild
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {ALL_STATUSES.filter(
                            (s) => s !== lead.status,
                          ).map((s) => (
                            <DropdownMenuItem
                              key={s}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusChange(lead.id, s);
                              }}
                            >
                              <span
                                className={`inline-block w-2 h-2 rounded-full mr-2 ${STATUS_CONFIG[s].color.split(" ")[0]}`}
                              />
                              {STATUS_CONFIG[s].label}로 변경
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(lead.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            삭제
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 리드 생성 다이얼로그 */}
      <CreateLeadDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* 리드 편집 다이얼로그 */}
      {editLead && (
        <EditLeadDialog
          lead={editLead}
          open={editOpen}
          onOpenChange={(open) => {
            setEditOpen(open);
            if (!open) setEditLead(null);
          }}
        />
      )}
    </>
  );
}

function CreateLeadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await createLead({
          name: form.get("name") as string,
          phone: form.get("phone") as string,
          location: (form.get("location") as string) || undefined,
          currentMethod: (form.get("currentMethod") as string) || undefined,
          source: (form.get("source") as string) || undefined,
          referredBy: (form.get("referredBy") as string) || undefined,
          notes: (form.get("notes") as string) || undefined,
        });
        toast.success("리드가 추가되었습니다");
        onOpenChange(false);
      } catch {
        toast.error("리드 추가에 실패했습니다");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>새 리드 추가</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="name">이름 *</Label>
              <Input id="name" name="name" required />
            </div>
            <div>
              <Label htmlFor="phone">연락처 *</Label>
              <Input id="phone" name="phone" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="location">위치/규모</Label>
              <Input id="location" name="location" />
            </div>
            <div>
              <Label htmlFor="source">유입 경로</Label>
              <Select name="source">
                <SelectTrigger>
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="landing">랜딩페이지</SelectItem>
                  <SelectItem value="referral">추천</SelectItem>
                  <SelectItem value="naver">네이버</SelectItem>
                  <SelectItem value="community">커뮤니티</SelectItem>
                  <SelectItem value="direct">직접 문의</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="currentMethod">현재 관리 방법</Label>
            <Input
              id="currentMethod"
              name="currentMethod"
              placeholder="예: 엑셀, 카카오톡, 다른 프로그램 등"
            />
          </div>
          <div>
            <Label htmlFor="referredBy">추천인</Label>
            <Input id="referredBy" name="referredBy" />
          </div>
          <div>
            <Label htmlFor="notes">메모</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "저장 중..." : "추가"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditLeadDialog({
  lead,
  open,
  onOpenChange,
}: {
  lead: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateLead(lead.id, {
          name: form.get("name") as string,
          phone: form.get("phone") as string,
          location: (form.get("location") as string) || undefined,
          currentMethod: (form.get("currentMethod") as string) || undefined,
          referredBy: (form.get("referredBy") as string) || undefined,
          notes: (form.get("notes") as string) || undefined,
          nextFollowUp: (form.get("nextFollowUp") as string) || null,
        });
        toast.success("리드가 수정되었습니다");
        onOpenChange(false);
      } catch {
        toast.error("수정에 실패했습니다");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>리드 상세</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="edit-name">이름</Label>
              <Input id="edit-name" name="name" defaultValue={lead.name} />
            </div>
            <div>
              <Label htmlFor="edit-phone">연락처</Label>
              <Input id="edit-phone" name="phone" defaultValue={lead.phone} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="edit-location">위치/규모</Label>
              <Input
                id="edit-location"
                name="location"
                defaultValue={lead.location ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="edit-currentMethod">현재 관리 방법</Label>
              <Input
                id="edit-currentMethod"
                name="currentMethod"
                defaultValue={lead.currentMethod ?? ""}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="edit-referredBy">추천인</Label>
              <Input
                id="edit-referredBy"
                name="referredBy"
                defaultValue={lead.referredBy ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="edit-nextFollowUp">다음 팔로업</Label>
              <Input
                id="edit-nextFollowUp"
                name="nextFollowUp"
                type="date"
                defaultValue={
                  lead.nextFollowUp
                    ? new Date(lead.nextFollowUp).toISOString().split("T")[0]
                    : ""
                }
              />
            </div>
          </div>
          <div>
            <Label htmlFor="edit-notes">메모</Label>
            <Textarea
              id="edit-notes"
              name="notes"
              rows={3}
              defaultValue={lead.notes ?? ""}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

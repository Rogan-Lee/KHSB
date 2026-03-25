"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { Search, X } from "lucide-react";

const STATUS_MAP = {
  SCHEDULED: { label: "예정", variant: "secondary" as const },
  COMPLETED: { label: "완료", variant: "default" as const },
  CANCELLED: { label: "취소", variant: "destructive" as const },
};

type Consultation = {
  id: string;
  scheduledAt: Date | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  agenda: string | null;
  outcome: string | null;
  followUp: string | null;
  student: { id: string; name: string; grade: string };
};

export function ConsultationsTable({ consultations }: { consultations: Consultation[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const filtered = q
    ? consultations.filter((c) => c.student.name.toLowerCase().includes(q) || c.student.grade.toLowerCase().includes(q))
    : consultations;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="원생 이름 검색..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-8 w-52 text-sm"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {q && <span className="text-xs text-muted-foreground">{filtered.length}건 검색됨</span>}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>예정일</TableHead>
            <TableHead>원생</TableHead>
            <TableHead>상태</TableHead>
            <TableHead>주제</TableHead>
            <TableHead>결과</TableHead>
            <TableHead>사후조치</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                {q ? "검색 결과가 없습니다" : "면담 기록이 없습니다"}
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.scheduledAt ? formatDate(c.scheduledAt) : "-"}</TableCell>
                <TableCell>
                  <span className="font-medium">{c.student.name}</span>
                  <span className="text-xs text-muted-foreground ml-1">{c.student.grade}</span>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_MAP[c.status].variant}>
                    {STATUS_MAP[c.status].label}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm max-w-32 line-clamp-1">{c.agenda || "-"}</TableCell>
                <TableCell className="text-sm max-w-32 line-clamp-1">{c.outcome || "-"}</TableCell>
                <TableCell className="text-sm max-w-32 line-clamp-1">{c.followUp || "-"}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

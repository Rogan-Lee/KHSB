"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { Search, X } from "lucide-react";

type MeritRecord = {
  id: string;
  date: Date;
  type: "MERIT" | "DEMERIT";
  points: number;
  category: string | null;
  reason: string;
  student: { name: string; grade: string };
};

export function MeritHistoryTable({ records }: { records: MeritRecord[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const filtered = q
    ? records.filter(
        (r) =>
          r.student.name.toLowerCase().includes(q) ||
          r.reason.toLowerCase().includes(q) ||
          (r.category ?? "").toLowerCase().includes(q)
      )
    : records;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="이름, 사유, 카테고리 검색..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-8 w-56 text-sm"
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
            <TableHead>날짜</TableHead>
            <TableHead>이름</TableHead>
            <TableHead>구분</TableHead>
            <TableHead>점수</TableHead>
            <TableHead>카테고리</TableHead>
            <TableHead>사유</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                {q ? "검색 결과가 없습니다" : "상벌점 내역이 없습니다"}
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((m) => (
              <TableRow key={m.id}>
                <TableCell>{formatDate(m.date)}</TableCell>
                <TableCell>
                  <span className="font-medium">{m.student.name}</span>
                  <span className="text-xs text-muted-foreground ml-1">{m.student.grade}</span>
                </TableCell>
                <TableCell>
                  <Badge variant={m.type === "MERIT" ? "default" : "destructive"}>
                    {m.type === "MERIT" ? "상점" : "벌점"}
                  </Badge>
                </TableCell>
                <TableCell className={`font-medium ${m.type === "MERIT" ? "text-green-600" : "text-red-600"}`}>
                  {m.type === "MERIT" ? "+" : "-"}{m.points}
                </TableCell>
                <TableCell>{m.category || "-"}</TableCell>
                <TableCell>{m.reason}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

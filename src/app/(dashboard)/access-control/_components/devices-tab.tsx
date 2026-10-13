"use client";

import { useState } from "react";
import { MonitorSmartphone, Trash2 } from "lucide-react";
import { deleteAccessDevice, type AccessDeviceView, type AccessOverview } from "@/actions/access-control";
import type { AccessDeviceStatus } from "@/lib/access-control/types";
import {
  EmptyState,
  FilterChip,
  SearchField,
  StatusBadge,
  TableCard,
  Toolbar,
  type Tone,
} from "@/components/backoffice/ui";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConfirmDialog } from "@/components/suggestions/use-confirm-dialog";
import { DeviceDialog } from "./device-dialog";
import { fmtDateTime, studentText, useAccessAction } from "./shared";

const STATUS: Record<AccessDeviceStatus, { label: string; tone: Tone }> = {
  UNASSIGNED: { label: "미배정", tone: "warn" },
  ASSIGNED: { label: "학생 기기", tone: "info" },
  EXEMPT: { label: "통제 제외", tone: "gray" },
};

type Filter = "ALL" | AccessDeviceStatus | "ONLINE";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "UNASSIGNED", label: "미배정" },
  { value: "ASSIGNED", label: "학생 기기" },
  { value: "EXEMPT", label: "통제 제외" },
  { value: "ONLINE", label: "접속 중" },
];

const inFilter = (d: AccessDeviceView, f: Filter) => f === "ALL" || (f === "ONLINE" ? d.online : d.status === f);

const deviceName = (d: AccessDeviceView) => d.label ?? d.hostname ?? "이름 없는 기기";

const hexOnly = (s: string) => s.toLowerCase().replace(/[^0-9a-f]/g, "");

export function DevicesTab({ overview }: { overview: AccessOverview }) {
  const { devices, students } = overview;
  const { busyKey, run } = useAccessAction();
  const { confirm, dialog } = useConfirmDialog();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  // MAC 은 구분 기호를 빼거나 다르게 쳐도 찾을 수 있게 한다
  const qMac = /^[0-9a-f:.\s-]+$/.test(q) ? hexOnly(q) : "";
  const shown = devices.filter(
    (d) =>
      inFilter(d, filter) &&
      (!q ||
        [d.label, d.hostname, d.mac, d.student?.name].some((t) => t?.toLowerCase().includes(q)) ||
        (qMac !== "" && hexOnly(d.mac).includes(qMac))),
  );
  const editing = devices.find((d) => d.id === editingId) ?? null;

  async function remove(d: AccessDeviceView) {
    const ok = await confirm({
      title: `${deviceName(d)} 기록을 삭제할까요?`,
      description: "기록만 지워져요. 이 기기가 와이파이에 다시 붙으면 미배정으로 새로 나타나요.",
      confirmLabel: "삭제",
      destructive: true,
    });
    if (!ok) return;
    run(() => deleteAccessDevice(d.id), { key: d.id, success: "기기 기록을 삭제했어요" });
  }

  return (
    <div className="flex flex-col gap-x4">
      <p className="max-w-3xl t4-regular text-fg-neutral-subtle">
        시설 와이파이에 붙은 기기가 자동으로 나타나요. 학생에게 배정하면 그 학생 대상 규칙·일시 조치가 이 기기에 적용되고,
        배정하지 않은 기기에는 전체 규칙이 적용돼요.
      </p>

      <div>
        <Toolbar>
          <div className="flex flex-wrap items-center gap-x2" role="group" aria-label="기기 필터">
            {FILTERS.map((f) => (
              <FilterChip
                key={f.value}
                selected={filter === f.value}
                count={devices.filter((d) => inFilter(d, f.value)).length}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </FilterChip>
            ))}
          </div>
          <SearchField
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery("")}
            placeholder="이름·MAC·학생 검색"
            aria-label="기기 검색"
            className="sm:ml-auto"
          />
        </Toolbar>

        <TableCard>
          {shown.length === 0 ? (
            devices.length === 0 ? (
              <EmptyState
                icon={MonitorSmartphone}
                title="아직 보이는 기기가 없어요"
                description="시설 장비를 연결하면 와이파이에 붙은 기기가 여기에 나타나요."
              />
            ) : (
              <EmptyState
                compact
                icon={MonitorSmartphone}
                title="조건에 맞는 기기가 없어요"
                description="필터나 검색어를 바꿔 보세요."
              />
            )
          ) : (
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>상태</TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead>MAC</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>학생</TableHead>
                  <TableHead>마지막 접속</TableHead>
                  <TableHead className="text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <StatusBadge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</StatusBadge>
                    </TableCell>
                    <TableCell>
                      <span className={d.label || d.hostname ? "t4-medium" : "t4-regular text-fg-neutral-subtle"}>
                        {deviceName(d)}
                      </span>
                      {d.label && d.hostname && (
                        <span className="block t3-regular text-fg-neutral-subtle">{d.hostname}</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono t3-regular text-fg-neutral-muted">{d.mac}</TableCell>
                    <TableCell className="whitespace-nowrap t3-regular text-fg-neutral-muted">{d.lastIp ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {d.student ? studentText(d.student) : <span className="text-fg-placeholder">—</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {d.online && (
                        <span className="flex items-center gap-x1 t3-medium text-fg-positive">
                          <span className="size-1.5 rounded-full bg-bg-positive-solid" aria-hidden />
                          접속 중
                        </span>
                      )}
                      <span className="t3-regular text-fg-neutral-subtle">{fmtDateTime(d.lastSeenAt)}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-x2">
                        <Button
                          size="xs"
                          variant="secondary"
                          disabled={busyKey === d.id}
                          onClick={() => setEditingId(d.id)}
                        >
                          배정
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={busyKey === d.id}
                          onClick={() => remove(d)}
                          aria-label={`${deviceName(d)} 삭제`}
                        >
                          <Trash2 /> 삭제
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

      <p className="max-w-3xl t3-regular text-fg-neutral-subtle">
        기기 설정의 ‘비공개 Wi-Fi 주소’가 ‘순환’이면 주소가 바뀌어 다시 미배정으로 잡혀요. 이 와이파이에서는 ‘고정’으로 두게
        안내해 주세요.
      </p>

      {editing && (
        <DeviceDialog key={editing.id} device={editing} students={students} onClose={() => setEditingId(null)} />
      )}
      {dialog}
    </div>
  );
}

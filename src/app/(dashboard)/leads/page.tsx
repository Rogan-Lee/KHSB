import { getLeads, getLeadStats } from "@/actions/leads";
import { Card, CardContent } from "@/components/ui/card";
import { LeadsTable } from "@/components/leads/leads-table";
import { Target, Phone, CheckCircle, XCircle } from "lucide-react";

export default async function LeadsPage() {
  const [leads, stats] = await Promise.all([getLeads(), getLeadStats()]);

  const counts = {
    total: stats.total,
    active:
      stats.total -
      (stats.byStatus["CONVERTED"] ?? 0) -
      (stats.byStatus["LOST"] ?? 0),
    converted: stats.byStatus["CONVERTED"] ?? 0,
    lost: stats.byStatus["LOST"] ?? 0,
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <Target className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">{counts.total}</p>
              <p className="text-sm text-muted-foreground">전체 리드</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <Phone className="h-8 w-8 text-orange-500" />
            <div>
              <p className="text-2xl font-bold">{counts.active}</p>
              <p className="text-sm text-muted-foreground">진행 중</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <CheckCircle className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold">{counts.converted}</p>
              <p className="text-sm text-muted-foreground">가입 완료</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <XCircle className="h-8 w-8 text-gray-400" />
            <div>
              <p className="text-2xl font-bold">{counts.lost}</p>
              <p className="text-sm text-muted-foreground">이탈</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <LeadsTable leads={leads} />
    </div>
  );
}

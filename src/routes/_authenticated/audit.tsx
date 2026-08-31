import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, LoadingRows, EmptyState, StatCard } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ScrollText, Download } from "lucide-react";
import { dateTimeFmt, downloadCsv } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({
    meta: [
      { title: "Audit Log — Ledger ERP" },
      { name: "description", content: "Immutable trail of every create, update and delete across the system." },
      { property: "og:title", content: "Audit Log — Ledger ERP" },
      { property: "og:description", content: "Immutable trail of every create, update and delete across the system." },
    ],
  }),
  component: AuditPage,
});

type Log = {
  id: string;
  created_at: string;
  user_email: string | null;
  module: string;
  action: string;
  record_id: string | null;
  old_value: unknown;
  new_value: unknown;
};

function AuditPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["audit_logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as unknown as Log[];
    },
  });

  const logs = data ?? [];
  const [q, setQ] = useState("");
  const [mod, setMod] = useState("all");
  const [view, setView] = useState<Log | null>(null);

  const modules = useMemo(() => Array.from(new Set(logs.map((l) => l.module))).sort(), [logs]);

  const filtered = logs.filter(
    (l) =>
      (mod === "all" || l.module === mod) &&
      [l.user_email, l.module, l.action, l.record_id].some((v) =>
        (v ?? "").toLowerCase().includes(q.toLowerCase()),
      ),
  );

  return (
    <div>
      <PageHeader title="Audit Log" description="Read-only history — entries cannot be edited or deleted." />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Entries (latest 500)" value={logs.length} icon={ScrollText} />
        <StatCard label="Modules Tracked" value={modules.length} icon={ScrollText} tone="info" />
        <StatCard
          label="Unique Users"
          value={new Set(logs.map((l) => l.user_email).filter(Boolean)).size}
          icon={ScrollText}
          tone="success"
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search user, action…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={mod} onValueChange={setMod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {modules.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                "audit-log.csv",
                filtered.map((l) => ({
                  Time: l.created_at,
                  User: l.user_email ?? "",
                  Module: l.module,
                  Action: l.action,
                  Record: l.record_id ?? "",
                })),
              )
            }
          >
            <Download className="mr-1.5 size-4" /> Export
          </Button>
        </div>

        {isLoading ? (
          <LoadingRows />
        ) : filtered.length === 0 ? (
          <EmptyState title="No audit entries" description="Activity will appear here as users work in the system." />
        ) : (
          <div className="max-h-[600px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-sm whitespace-nowrap">{dateTimeFmt(l.created_at)}</TableCell>
                    <TableCell className="text-sm">{l.user_email ?? "system"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{l.module}</Badge>
                    </TableCell>
                    <TableCell className="text-sm font-medium">{l.action}</TableCell>
                    <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground">
                      {l.record_id ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setView(l)}>
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {view?.module} · {view?.action}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Before</p>
              <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs">
                {JSON.stringify(view?.old_value ?? null, null, 2)}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">After</p>
              <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs">
                {JSON.stringify(view?.new_value ?? null, null, 2)}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

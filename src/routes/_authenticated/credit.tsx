import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  BadgeIndianRupee,
  AlarmClock,
  ShieldCheck,
  Wallet,
  Search,
  Download,
  History,
  Plus,
} from "lucide-react";
import { PageHeader, StatCard, EmptyState, LoadingRows } from "@/components/shared";
import { inr, dateFmt, dateTimeFmt, downloadCsv } from "@/lib/format";
import { AddOldUdharDialog } from "@/components/AddOldUdharDialog";
import { ReceiptActions } from "@/components/ReceiptPrint";
import {
  useCreditTransactions,
  useCollectionEntries,
  useCollectionAudit,
  useVerifyCollection,
  useCanVerifyCollections,
  effectiveStatus,
  daysOverdue,
  agingBucket,
  CREDIT_STATUS_LABEL,
  COLLECTION_STATUS_LABEL,
  type CreditTxn,
  type CollectionEntry,
} from "@/lib/credit";

export const Route = createFileRoute("/_authenticated/credit")({
  head: () => ({
    meta: [
      { title: "Customer Credit (Udhar) — Ledger ERP" },
      {
        name: "description",
        content:
          "Track credit sales, due dates, outstanding balances, ageing and verified collections.",
      },
      { property: "og:title", content: "Customer Credit (Udhar) — Ledger ERP" },
      {
        property: "og:description",
        content: "Credit sales, due tracking, collection verification and credit reports.",
      },
    ],
  }),
  component: CreditPage,
});

function statusTone(s: string) {
  if (s === "overdue") return "destructive" as const;
  if (s === "paid") return "secondary" as const;
  return "outline" as const;
}

function CreditPage() {
  const { data: txns, isLoading } = useCreditTransactions();
  const { data: entries } = useCollectionEntries();
  const { data: canVerify } = useCanVerifyCollections();
  const [oldUdharOpen, setOldUdharOpen] = useState(false);
  const rows = txns ?? [];
  const all = entries ?? [];

  const kpi = useMemo(() => {
    let outstanding = 0;
    let overdue = 0;
    let overdueCount = 0;
    let dueSoon = 0;
    const customers = new Set<string>();
    for (const t of rows) {
      const st = effectiveStatus(t);
      if (st === "cancelled" || st === "paid") continue;
      outstanding += Number(t.outstanding_amount);
      customers.add(t.customer_id);
      if (st === "overdue") {
        overdue += Number(t.outstanding_amount);
        overdueCount += 1;
      } else if (daysOverdue(t.due_date) === 0) {
        dueSoon += Number(t.outstanding_amount);
      }
    }
    const settled = rows.filter((t) => t.settled_at);
    const onTime = settled.filter((t) => t.settled_on_time).length;
    return {
      outstanding,
      overdue,
      overdueCount,
      dueSoon,
      customers: customers.size,
      compliance: settled.length ? Math.round((onTime / settled.length) * 100) : 100,
      pending: all.filter((e) => e.status === "pending_verification").length,
    };
  }, [rows, all]);

  const aging = useMemo(() => {
    const buckets: Record<string, number> = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    for (const t of rows) {
      const st = effectiveStatus(t);
      if (st === "paid" || st === "cancelled") continue;
      buckets[agingBucket(t.due_date)] = (buckets[agingBucket(t.due_date)] ?? 0) + Number(t.outstanding_amount);
    }
    return buckets;
  }, [rows]);

  return (
    <div>
      <PageHeader
        title="Customer Credit (Udhar)"
        description="Credit sales, due dates, outstanding balances and verified collections — per customer."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setOldUdharOpen(true)}>
              <Plus className="mr-1.5 size-4" /> Add Old Udhar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  "credit-outstanding.csv",
                  rows.map((t) => ({
                    Reference: t.reference_no,
                    Customer: t.customers?.name ?? "",
                    CreditDate: t.credit_date,
                    DueDate: t.due_date,
                    Amount: t.original_amount,
                    Paid: t.paid_amount,
                    Outstanding: t.outstanding_amount,
                    DaysOverdue: daysOverdue(t.due_date),
                    Status: CREDIT_STATUS_LABEL[effectiveStatus(t)],
                  })),
                )
              }
            >
              <Download className="mr-1.5 size-4" /> Export
            </Button>
          </div>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Outstanding" value={inr(kpi.outstanding)} icon={BadgeIndianRupee} />
        <StatCard
          label={`Overdue (${kpi.overdueCount})`}
          value={inr(kpi.overdue)}
          icon={AlarmClock}
          tone="warning"
        />
        <StatCard label="Awaiting Verification" value={kpi.pending} icon={ShieldCheck} tone="info" />
        <StatCard label="On-time Settlement" value={`${kpi.compliance}%`} icon={Wallet} tone="success" />
      </div>

      <Tabs defaultValue="outstanding">
        <TabsList>
          <TabsTrigger value="outstanding">Credit sales</TabsTrigger>
          <TabsTrigger value="due">Due & overdue</TabsTrigger>
          <TabsTrigger value="verify">Verification {kpi.pending ? `(${kpi.pending})` : ""}</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="outstanding" className="mt-4">
          <CreditTable rows={rows} loading={isLoading} />
        </TabsContent>

        <TabsContent value="due" className="mt-4">
          <CreditTable
            rows={rows.filter((t) => {
              const st = effectiveStatus(t);
              return st !== "paid" && st !== "cancelled";
            })}
            loading={isLoading}
          />
        </TabsContent>

        <TabsContent value="verify" className="mt-4">
          <VerificationQueue entries={all} canVerify={!!canVerify} />
        </TabsContent>

        <TabsContent value="reports" className="mt-4 space-y-4">
          <Card className="p-4">
            <p className="mb-3 text-sm font-medium">Ageing of outstanding credit</p>
            <div className="grid gap-3 sm:grid-cols-5">
              {Object.entries(aging).map(([k, v]) => (
                <div key={k} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">
                    {k === "current" ? "Not yet due" : `${k} days overdue`}
                  </p>
                  <p className="tabular mt-1 text-lg font-semibold">{inr(v)}</p>
                </div>
              ))}
            </div>
          </Card>
          <CustomerLedger rows={rows} />
          <CollectionHistory entries={all} />
        </TabsContent>
      </Tabs>

      <AddOldUdharDialog open={oldUdharOpen} onOpenChange={setOldUdharOpen} />
    </div>
  );
}

function CreditTable({ rows, loading }: { rows: CreditTxn[]; loading?: boolean }) {
  const [q, setQ] = useState("");
  const filtered = rows.filter((t) =>
    [t.reference_no, t.customers?.name].some((v) => (v ?? "").toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <Card>
      <div className="flex items-center gap-2 border-b p-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search invoice or customer…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      {loading ? (
        <LoadingRows />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No credit sales yet"
          description="Sell on credit from the POS by choosing the Credit / Udhar payment mode."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Credit date</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => {
                const st = effectiveStatus(t);
                const od = daysOverdue(t.due_date);
                const isOldUdhar =
                  !t.sale_id &&
                  (t.reference_no.startsWith("OUD-") ||
                    t.reference_no.startsWith("OLD-") ||
                    t.notes?.includes("Old Udhar"));
                return (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium font-mono">{t.reference_no}</span>
                        {isOldUdhar && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 h-4 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300"
                          >
                            Old Udhar
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {t.customers?.name ?? "—"}
                      {t.customers?.mobile ? (
                        <div className="text-xs text-muted-foreground">{t.customers.mobile}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">{dateFmt(t.credit_date)}</TableCell>
                    <TableCell className="text-sm">
                      {dateFmt(t.due_date)}
                      {od > 0 && Number(t.outstanding_amount) > 0 ? (
                        <div className="text-xs text-destructive">{od} days late</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="tabular text-right">{inr(t.original_amount)}</TableCell>
                    <TableCell className="tabular text-right">{inr(t.paid_amount)}</TableCell>
                    <TableCell className="tabular text-right font-medium">
                      {inr(t.outstanding_amount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusTone(st)}>{CREDIT_STATUS_LABEL[st]}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {t.sale_id ? (
                        <ReceiptActions
                          saleId={t.sale_id}
                          reprint
                          saleDetails={{
                            invoice_no: t.reference_no,
                            invoice_date: t.credit_date,
                            grand_total: Number(t.original_amount),
                            customer_name: t.customers?.name ?? "Customer",
                            customer_id: t.customer_id,
                            customer_mobile: t.customers?.mobile,
                            business_id: t.business_id,
                          }}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function VerificationQueue({
  entries,
  canVerify,
}: {
  entries: CollectionEntry[];
  canVerify: boolean;
}) {
  const pending = entries.filter((e) => e.status === "pending_verification");
  const verify = useVerifyCollection();
  const [target, setTarget] = useState<{ entry: CollectionEntry; action: "approve" | "reject" | "request_correction" } | null>(null);
  const [comments, setComments] = useState("");
  const [reason, setReason] = useState("");

  function act() {
    if (!target) return;
    verify.mutate(
      {
        entryId: target.entry.id,
        action: target.action,
        comments,
        reason,
      },
      {
        onSuccess: () => {
          toast.success(
            target.action === "approve"
              ? "Collection approved and posted to the ledger"
              : target.action === "reject"
                ? "Collection rejected"
                : "Correction requested",
          );
          setTarget(null);
          setComments("");
          setReason("");
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  }

  return (
    <>
      <Card>
        {!canVerify && (
          <p className="border-b p-3 text-sm text-muted-foreground">
            You can review these entries, but only an Admin or a user with verification rights can
            approve or reject them.
          </p>
        )}
        {pending.length === 0 ? (
          <EmptyState
            title="Nothing awaiting verification"
            description="Collections recorded by officers appear here until they are approved."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Collected on</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.customers?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm">{e.credit_transactions?.reference_no ?? e.reference_doc}</TableCell>
                    <TableCell className="text-sm">{dateFmt(e.collection_date)}</TableCell>
                    <TableCell className="tabular text-right font-medium">{inr(e.amount)}</TableCell>
                    <TableCell className="text-sm capitalize">
                      {e.payment_method.replace("_", " ")}
                      {e.reference_number ? (
                        <div className="text-xs text-muted-foreground">{e.reference_number}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">
                      {e.remarks ?? "—"}
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button
                        size="sm"
                        disabled={!canVerify}
                        onClick={() => setTarget({ entry: e, action: "approve" })}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canVerify}
                        onClick={() => setTarget({ entry: e, action: "request_correction" })}
                      >
                        Correction
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!canVerify}
                        onClick={() => setTarget({ entry: e, action: "reject" })}
                      >
                        Reject
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {target?.action === "approve"
                ? "Approve collection"
                : target?.action === "reject"
                  ? "Reject collection"
                  : "Request correction"}
            </DialogTitle>
          </DialogHeader>
          {target && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                {target.entry.customers?.name} · {inr(target.entry.amount)} ·{" "}
                {dateFmt(target.entry.collection_date)}
              </p>
              {target.action === "approve" && (
                <p className="rounded-md border bg-muted/40 p-3 text-xs">
                  Approving posts this amount against the invoice, reduces the customer&apos;s
                  outstanding balance and records an entry in the audit trail.
                </p>
              )}
              <div className="space-y-1.5">
                <Label>Comments</Label>
                <Textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={2} />
              </div>
              {target.action !== "approve" && (
                <div className="space-y-1.5">
                  <Label>{target.action === "reject" ? "Rejection reason *" : "What needs fixing?"}</Label>
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button onClick={act} disabled={verify.isPending}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CustomerLedger({ rows }: { rows: CreditTxn[] }) {
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { name: string; limit: number; outstanding: number; overdue: number; count: number }
    >();
    for (const t of rows) {
      const st = effectiveStatus(t);
      if (st === "paid" || st === "cancelled") continue;
      const cur = map.get(t.customer_id) ?? {
        name: t.customers?.name ?? "—",
        limit: Number(t.customers?.credit_limit ?? 0),
        outstanding: 0,
        overdue: 0,
        count: 0,
      };
      cur.outstanding += Number(t.outstanding_amount);
      if (st === "overdue") cur.overdue += Number(t.outstanding_amount);
      cur.count += 1;
      map.set(t.customer_id, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.outstanding - a.outstanding);
  }, [rows]);

  return (
    <Card>
      <div className="border-b p-3 text-sm font-medium">Customer-wise credit summary</div>
      {grouped.length === 0 ? (
        <EmptyState title="No outstanding credit" />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Open bills</TableHead>
                <TableHead className="text-right">Credit limit</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Overdue</TableHead>
                <TableHead className="text-right">Available</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map((g) => (
                <TableRow key={g.name}>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell className="tabular text-right">{g.count}</TableCell>
                  <TableCell className="tabular text-right">
                    {g.limit > 0 ? inr(g.limit) : "No limit"}
                  </TableCell>
                  <TableCell className="tabular text-right font-medium">{inr(g.outstanding)}</TableCell>
                  <TableCell className="tabular text-right">{inr(g.overdue)}</TableCell>
                  <TableCell className="tabular text-right">
                    {g.limit > 0 ? inr(Math.max(g.limit - g.outstanding, 0)) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function CollectionHistory({ entries }: { entries: CollectionEntry[] }) {
  const [auditFor, setAuditFor] = useState<string | null>(null);
  const { data: audit } = useCollectionAudit(auditFor);

  return (
    <>
      <Card>
        <div className="border-b p-3 text-sm font-medium">Collection history</div>
        {entries.length === 0 ? (
          <EmptyState title="No collections recorded yet" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.customers?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {e.credit_transactions?.reference_no ?? e.reference_doc}
                    </TableCell>
                    <TableCell className="text-sm">{dateFmt(e.collection_date)}</TableCell>
                    <TableCell className="tabular text-right">{inr(e.amount)}</TableCell>
                    <TableCell>
                      <Badge variant={e.status === "approved" ? "secondary" : e.status === "rejected" ? "destructive" : "outline"}>
                        {COLLECTION_STATUS_LABEL[e.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setAuditFor(e.id)}>
                        <History className="mr-1.5 size-4" /> Trail
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Dialog open={!!auditFor} onOpenChange={(o) => !o && setAuditFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Audit trail</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {(audit ?? []).map((a) => (
              <div key={a.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">{a.action.replace("_", " ")}</span>
                  <span className="text-xs text-muted-foreground">{dateTimeFmt(a.created_at)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {a.actor_email ?? "system"}
                  {a.amount ? ` · ${inr(a.amount)}` : ""}
                  {a.new_status ? ` · → ${a.new_status.replace("_", " ")}` : ""}
                </p>
                {(a.comments || a.remarks) && (
                  <p className="mt-1 text-xs">{a.comments || a.remarks}</p>
                )}
              </div>
            ))}
            {(audit ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No entries.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { HandCoins, AlarmClock, Search, CheckCircle2, Clock } from "lucide-react";
import { PageHeader, StatCard, EmptyState, LoadingRows } from "@/components/shared";
import { inr, dateFmt } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import {
  useCreditTransactions,
  useCollectionEntries,
  useRecordCollection,
  useResubmitCollection,
  effectiveStatus,
  daysOverdue,
  daysUntilDue,
  COLLECTION_STATUS_LABEL,
  type CreditTxn,
  type CollectionEntry,
} from "@/lib/credit";

export const Route = createFileRoute("/_authenticated/collections")({
  head: () => ({
    meta: [
      { title: "Credit Collections — Ledger ERP" },
      {
        name: "description",
        content: "Record udhar collections from customers and track verification status.",
      },
      { property: "og:title", content: "Credit Collections — Ledger ERP" },
      {
        property: "og:description",
        content: "Field collection entries for customer credit, pending admin verification.",
      },
    ],
  }),
  component: CollectionsPage,
});

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
];

const today = () => new Date().toISOString().slice(0, 10);

function CollectionsPage() {
  const { user } = useAuth();
  const { data: txns, isLoading } = useCreditTransactions();
  const { data: entries } = useCollectionEntries();
  const rows = txns ?? [];
  const all = entries ?? [];
  const mine = all.filter((e) => e.collection_officer_id === user?.id);

  const open = useMemo(
    () =>
      rows
        .filter((t) => {
          const st = effectiveStatus(t);
          return st !== "paid" && st !== "cancelled";
        })
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [rows],
  );

  const pendingByTxn = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of all) {
      if (e.status === "pending_verification" || e.status === "correction_requested") {
        m.set(e.credit_transaction_id, (m.get(e.credit_transaction_id) ?? 0) + Number(e.amount));
      }
    }
    return m;
  }, [all]);

  const collectedToday = mine
    .filter((e) => e.collection_date === today())
    .reduce((s, e) => s + Number(e.amount), 0);
  const awaiting = mine.filter((e) => e.status === "pending_verification").length;
  const approved = mine.filter((e) => e.status === "approved").reduce((s, e) => s + Number(e.amount), 0);

  const [collect, setCollect] = useState<CreditTxn | null>(null);
  const [correct, setCorrect] = useState<CollectionEntry | null>(null);

  return (
    <div>
      <PageHeader
        title="Credit Collections"
        description="Record money collected against customer credit. Every entry is verified by an admin before it reduces the official balance."
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open credit bills" value={open.length} icon={HandCoins} />
        <StatCard
          label="Overdue bills"
          value={open.filter((t) => daysOverdue(t.due_date) > 0).length}
          icon={AlarmClock}
          tone="warning"
        />
        <StatCard label="Collected today (mine)" value={inr(collectedToday)} icon={Clock} tone="info" />
        <StatCard label="Verified (mine)" value={inr(approved)} icon={CheckCircle2} tone="success" />
      </div>

      <Tabs defaultValue="due">
        <TabsList>
          <TabsTrigger value="due">Due customers</TabsTrigger>
          <TabsTrigger value="mine">My collections {awaiting ? `(${awaiting})` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="due" className="mt-4">
          <DueList rows={open} loading={isLoading} pendingByTxn={pendingByTxn} onCollect={setCollect} />
        </TabsContent>

        <TabsContent value="mine" className="mt-4">
          <MyCollections entries={mine} onCorrect={setCorrect} />
        </TabsContent>
      </Tabs>

      <CollectDialog
        txn={collect}
        pending={collect ? (pendingByTxn.get(collect.id) ?? 0) : 0}
        onClose={() => setCollect(null)}
      />
      <CorrectDialog entry={correct} onClose={() => setCorrect(null)} />
    </div>
  );
}

function DueList({
  rows,
  loading,
  pendingByTxn,
  onCollect,
}: {
  rows: CreditTxn[];
  loading?: boolean;
  pendingByTxn: Map<string, number>;
  onCollect: (t: CreditTxn) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = rows.filter((t) =>
    [t.reference_no, t.customers?.name, t.customers?.mobile].some((v) =>
      (v ?? "").toLowerCase().includes(q.toLowerCase()),
    ),
  );

  return (
    <Card>
      <div className="flex items-center gap-2 border-b p-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search customer, mobile or bill…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      {loading ? (
        <LoadingRows />
      ) : filtered.length === 0 ? (
        <EmptyState title="Nothing to collect" description="All credit bills are settled." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Bill</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Awaiting verification</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => {
                const od = daysOverdue(t.due_date);
                const pend = pendingByTxn.get(t.id) ?? 0;
                const collectable = Number(t.outstanding_amount) - pend;
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      {t.customers?.name ?? "—"}
                      {t.customers?.mobile ? (
                        <div className="text-xs text-muted-foreground">{t.customers.mobile}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">{t.reference_no}</TableCell>
                    <TableCell className="text-sm">
                      {dateFmt(t.due_date)}
                      <div className={od > 0 ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                        {od > 0 ? `${od} days late` : `in ${daysUntilDue(t.due_date)} days`}
                      </div>
                    </TableCell>
                    <TableCell className="tabular text-right font-medium">
                      {inr(t.outstanding_amount)}
                    </TableCell>
                    <TableCell className="tabular text-right text-muted-foreground">
                      {pend > 0 ? inr(pend) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" disabled={collectable <= 0} onClick={() => onCollect(t)}>
                        Collect
                      </Button>
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

function MyCollections({
  entries,
  onCorrect,
}: {
  entries: CollectionEntry[];
  onCorrect: (e: CollectionEntry) => void;
}) {
  if (entries.length === 0)
    return <EmptyState title="No collections yet" description="Entries you record will appear here." />;
  return (
    <Card>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Bill</TableHead>
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
                  <Badge
                    variant={
                      e.status === "approved"
                        ? "secondary"
                        : e.status === "rejected"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {COLLECTION_STATUS_LABEL[e.status]}
                  </Badge>
                  {e.rejection_reason ? (
                    <div className="mt-1 max-w-[240px] text-xs text-muted-foreground">
                      {e.rejection_reason}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="text-right">
                  {e.status === "correction_requested" && (
                    <Button size="sm" variant="outline" onClick={() => onCorrect(e)}>
                      Correct & resubmit
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function CollectDialog({
  txn,
  pending,
  onClose,
}: {
  txn: CreditTxn | null;
  pending: number;
  onClose: () => void;
}) {
  const record = useRecordCollection();
  const max = txn ? Number(txn.outstanding_amount) - pending : 0;
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");

  function submit() {
    if (!txn) return;
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error("Enter the amount collected");
      return;
    }
    if (value > max) {
      toast.error(`Amount cannot exceed the outstanding balance of ${inr(max)}`);
      return;
    }
    record.mutate(
      {
        creditTransactionId: txn.id,
        amount: value,
        collectionDate: date,
        method,
        reference,
        remarks,
      },
      {
        onSuccess: () => {
          toast.success("Collection recorded — awaiting admin verification");
          setAmount("");
          setReference("");
          setRemarks("");
          onClose();
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  }

  return (
    <Dialog open={!!txn} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record collection</DialogTitle>
        </DialogHeader>
        {txn && (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">{txn.customers?.name}</p>
              <p className="text-xs text-muted-foreground">
                {txn.reference_no} · due {dateFmt(txn.due_date)} · collectable {inr(max)}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Amount collected *</Label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={String(max)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Collection date</Label>
                <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Mode</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Reference no.</Label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Remarks</Label>
              <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              This entry stays unverified until an admin approves it. The customer&apos;s official
              balance changes only after approval.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={record.isPending}>
            Submit for verification
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CorrectDialog({ entry, onClose }: { entry: CollectionEntry | null; onClose: () => void }) {
  const resubmit = useResubmitCollection();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");

  function submit() {
    if (!entry) return;
    const value = Number(amount || entry.amount);
    resubmit.mutate(
      { entryId: entry.id, amount: value, method, reference, remarks },
      {
        onSuccess: () => {
          toast.success("Corrected entry resubmitted");
          onClose();
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  }

  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Correct collection entry</DialogTitle>
        </DialogHeader>
        {entry && (
          <div className="space-y-3">
            {entry.rejection_reason && (
              <p className="rounded-md border bg-muted/40 p-3 text-xs">
                Verifier note: {entry.rejection_reason}
              </p>
            )}
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input
                type="number"
                value={amount}
                placeholder={String(entry.amount)}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mode</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reference no.</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Remarks</Label>
              <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={resubmit.isPending}>
            Resubmit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

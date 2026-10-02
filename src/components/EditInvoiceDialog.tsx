import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCustomers, useProducts, useSettings, logAudit } from "@/lib/queries";
import { useAuth } from "@/hooks/useAuth";
import { inr, PAYMENT_METHODS } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { LocationSelector } from "@/components/LocationSelector";
import {
  Pencil,
  Trash2,
  Plus,
  Minus,
  AlertCircle,
  Save,
  Search,
  ShieldCheck,
  ShoppingBag,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { QuickAddCustomerDialog } from "@/components/QuickAddCustomerDialog";
import { DeleteInvoiceDialog } from "@/components/DeleteInvoiceDialog";

export interface EditInvoiceLine {
  id?: string | undefined;
  product_id: string;
  product_name: string;
  sku?: string | null | undefined;
  barcode?: string | null | undefined;
  rate: number;
  quantity: number;
  discount: number;
  gst_rate: number;
  returned_qty: number;
  unit?: string | undefined;
  purchase_price: number;
  hsn_code?: string | null | undefined;
}

interface EditInvoiceDialogProps {
  saleId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function toLocalDatetimeString(isoString?: string | null) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function EditInvoiceDialog({
  saleId,
  open,
  onOpenChange,
  onSuccess,
}: EditInvoiceDialogProps) {
  const qc = useQueryClient();
  const { user, roles, isSuperAdmin } = useAuth();
  const isAdmin = isSuperAdmin || roles.includes("admin");

  const { data: customers } = useCustomers();
  const { data: products } = useProducts();
  const { data: settings } = useSettings();

  const [loading, setLoading] = useState(false);
  const [saleNumber, setSaleNumber] = useState("");
  const [customerId, setCustomerId] = useState("walkin");
  const [customerName, setCustomerName] = useState("Walk-in Customer");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [status, setStatus] = useState("completed");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [invoiceDiscount, setInvoiceDiscount] = useState("0");
  const [method, setMethod] = useState("cash");
  const [paid, setPaid] = useState("0");
  const [dueDate, setDueDate] = useState("");
  const [isCreditSale, setIsCreditSale] = useState(false);
  const [lines, setLines] = useState<EditInvoiceLine[]>([]);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Product search state for adding items
  const [productSearch, setProductSearch] = useState("");

  // Load sale data when saleId changes
  useEffect(() => {
    if (!saleId || !open) return;

    let isMounted = true;
    setLoading(true);

    async function loadSale() {
      try {
        const { data: sale, error } = await supabase
          .from("sales")
          .select(`
            *,
            customers (id, name, mobile, balance),
            sale_items (
              id,
              sale_id,
              product_id,
              product_name,
              hsn_code,
              quantity,
              rate,
              discount,
              gst_rate,
              tax_amount,
              taxable_amount,
              total,
              cost_price,
              returned_qty,
              products (id, name, sku, barcode, current_stock, purchase_price, unit)
            ),
            customer_payments (id, amount, method, payment_date, reference_no, remarks)
          `)
          .eq("id", saleId!)
          .single();

        if (error) throw error;
        if (!isMounted) return;

        // Check for credit transaction
        const { data: creditTxn } = await supabase
          .from("credit_transactions")
          .select("*")
          .eq("sale_id", saleId!)
          .maybeSingle();

        setSaleNumber(sale.invoice_no);
        setCustomerId(sale.customer_id ?? "walkin");
        setCustomerName(sale.customer_name ?? "Walk-in Customer");
        setInvoiceDate(toLocalDatetimeString(sale.invoice_date));
        setWarehouseId(sale.warehouse_id);
        setStatus(sale.status ?? "completed");
        setNotes(sale.notes ?? "");
        setReason("");

        // Invoice-level discount: sales table discount_amount minus line item discounts
        const totalItemsDiscount = (sale.sale_items ?? []).reduce(
          (sum, it) => sum + (Number(it.discount) || 0),
          0,
        );
        const invDisc = Math.max(0, (Number(sale.discount_amount) || 0) - totalItemsDiscount);
        setInvoiceDiscount(invDisc.toString());

        // Payments
        const initialPayment = sale.customer_payments?.[0];
        setMethod(initialPayment?.method ? String(initialPayment.method) : "cash");
        setPaid(String(sale.paid_amount ?? 0));

        if (creditTxn) {
          setIsCreditSale(true);
          setDueDate(creditTxn.due_date ?? "");
        } else {
          setIsCreditSale(false);
          setDueDate("");
        }

        // Lines
        const initialLines: EditInvoiceLine[] = (sale.sale_items ?? []).map((it) => {
          const prod = it.products as {
            sku?: string;
            barcode?: string;
            purchase_price?: number;
            unit?: string;
          } | null;
          return {
            id: it.id,
            product_id: it.product_id,
            product_name: it.product_name,
            sku: prod?.sku ?? null,
            barcode: prod?.barcode ?? null,
            rate: Number(it.rate),
            quantity: Number(it.quantity),
            discount: Number(it.discount ?? 0),
            gst_rate: Number(it.gst_rate ?? 0),
            returned_qty: Number(it.returned_qty ?? 0),
            unit: prod?.unit ?? "pcs",
            purchase_price: Number(it.cost_price ?? prod?.purchase_price ?? 0),
            hsn_code: it.hsn_code ?? null,
          };
        });

        setLines(initialLines);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to load invoice details");
        onOpenChange(false);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void loadSale();

    return () => {
      isMounted = false;
    };
  }, [saleId, open, onOpenChange]);

  // Calculations
  const calculations = useMemo(() => {
    let subtotal = 0;
    let itemDiscounts = 0;
    let netTaxable = 0;
    let totalTax = 0;
    let totalCogs = 0;

    const lineCalculations = lines.map((l) => {
      const lineBase = Math.max(0, l.quantity * l.rate - l.discount);
      const tax = Math.round(((lineBase * l.gst_rate) / 100) * 100) / 100;
      const total = lineBase + tax;

      subtotal += l.quantity * l.rate;
      itemDiscounts += l.discount;
      netTaxable += lineBase;
      totalTax += tax;
      totalCogs += l.quantity * (l.purchase_price || 0);

      return { lineBase, tax, total };
    });

    const parsedInvoiceDiscount = Math.max(0, Number(invoiceDiscount) || 0);
    const finalTaxable = Math.max(0, netTaxable - parsedInvoiceDiscount);
    const grandTotal = Math.round(finalTaxable + totalTax);
    const roundOff = Math.round((grandTotal - (finalTaxable + totalTax)) * 100) / 100;
    const cgst = Math.round((totalTax / 2) * 100) / 100;
    const sgst = Math.round((totalTax - cgst) * 100) / 100;
    const totalDiscount = itemDiscounts + parsedInvoiceDiscount;
    const currentPaid = Number(paid) || 0;
    const balanceDue = Math.max(0, grandTotal - currentPaid);

    return {
      lineCalculations,
      subtotal,
      itemDiscounts,
      invoiceDiscount: parsedInvoiceDiscount,
      totalDiscount,
      netTaxable: finalTaxable,
      totalTax,
      cgst,
      sgst,
      grandTotal,
      roundOff,
      totalCogs,
      currentPaid,
      balanceDue,
    };
  }, [lines, invoiceDiscount, paid]);

  // Line item manipulation
  function updateLine(index: number, patch: Partial<EditInvoiceLine>) {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l;
        const updated = { ...l, ...patch };
        // Ensure quantity not below returned_qty
        if (updated.returned_qty > 0 && updated.quantity < updated.returned_qty) {
          toast.warning(`Cannot reduce quantity below returned quantity (${updated.returned_qty})`);
          updated.quantity = updated.returned_qty;
        }
        return updated;
      }),
    );
  }

  function removeLine(index: number) {
    const target = lines[index];
    if (!target) return;
    if (target.returned_qty > 0) {
      toast.error(
        `Cannot remove item "${target.product_name}" because ${target.returned_qty} units were already returned.`,
      );
      return;
    }
    if (lines.length <= 1) {
      toast.error("An invoice must contain at least one item.");
      return;
    }
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  // Adding product to invoice
  const availableProducts = useMemo(() => {
    if (!products) return [];
    return (products as any[]).filter(
      (p) =>
        p.status === "active" &&
        [p.name, p.sku, p.barcode].some((v) =>
          (v ?? "").toLowerCase().includes(productSearch.toLowerCase()),
        ),
    );
  }, [products, productSearch]);

  function handleAddProduct(p: any) {
    // Check if product already exists in lines
    const existingIndex = lines.findIndex((l) => l.product_id === p.id);
    if (existingIndex >= 0) {
      const existing = lines[existingIndex];
      if (existing) {
        updateLine(existingIndex, {
          quantity: existing.quantity + 1,
        });
        toast.info(`Increased quantity of ${p.name}`);
      }
    } else {
      const newLine: EditInvoiceLine = {
        product_id: p.id,
        product_name: p.name,
        sku: p.sku ?? null,
        barcode: p.barcode ?? null,
        rate: Number(p.selling_price) || 0,
        quantity: 1,
        discount: 0,
        gst_rate: Number(p.gst_rate) || 0,
        returned_qty: 0,
        unit: p.unit || "pcs",
        purchase_price: Number(p.purchase_price) || 0,
        hsn_code: p.hsn_code ?? null,
      };
      setLines((prev) => [...prev, newLine]);
      toast.success(`Added ${p.name} to invoice`);
    }
    setProductSearch("");
  }

  // Save invoice mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!isAdmin) {
        throw new Error("Unauthorized: Only administrators can modify created invoices.");
      }
      if (!saleId) throw new Error("No sale selected.");
      if (lines.length === 0) throw new Error("Invoice must have at least one line item.");

      // Check stock availability if negative stock is disallowed
      if (settings?.allow_negative_stock === false) {
        for (const l of lines) {
          const prod = (products as any[])?.find((p) => p.id === l.product_id);
          if (prod) {
            const oldLine = lines.find((it) => it.id && it.product_id === l.product_id);
            const oldQty = oldLine ? oldLine.quantity : 0;
            const maxAllowed = Number(prod.current_stock) + oldQty;
            if (l.quantity > maxAllowed) {
              throw new Error(
                `Insufficient stock for "${l.product_name}". Maximum available is ${maxAllowed} ${l.unit ?? ""}.`,
              );
            }
          }
        }
      }

      // 1. Fetch current sale before updating for safety & audit log diff
      const { data: currentSale, error: currErr } = await supabase
        .from("sales")
        .select("*, sale_items(*)")
        .eq("id", saleId)
        .single();

      if (currErr || !currentSale) throw new Error("Could not retrieve current sale record.");

      // 2. Identify items to update, insert, and delete
      const currentItemIds = (currentSale.sale_items ?? []).map((it) => it.id);
      const submittedItemIds = lines.filter((l) => l.id).map((l) => l.id as string);
      const itemIdsToDelete = currentItemIds.filter((id) => !submittedItemIds.includes(id));

      // Verify no item with returns is deleted
      for (const delId of itemIdsToDelete) {
        const existing = currentSale.sale_items?.find((it) => it.id === delId);
        if (existing && Number(existing.returned_qty) > 0) {
          throw new Error(
            `Cannot remove "${existing.product_name}" because ${existing.returned_qty} units have already been returned.`,
          );
        }
      }

      // Verify no item's quantity is reduced below returned_qty
      for (const line of lines) {
        if (line.id) {
          const existing = currentSale.sale_items?.find((it) => it.id === line.id);
          if (
            existing &&
            Number(existing.returned_qty) > 0 &&
            line.quantity < Number(existing.returned_qty)
          ) {
            throw new Error(
              `Quantity for "${line.product_name}" cannot be less than returned quantity (${existing.returned_qty}).`,
            );
          }
        }
      }

      // 3. Delete removed sale_items
      if (itemIdsToDelete.length > 0) {
        const { error: delErr } = await supabase
          .from("sale_items")
          .delete()
          .in("id", itemIdsToDelete);
        if (delErr) throw delErr;
      }

      // 4. Update existing sale_items
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lt = calculations.lineCalculations[i];
        if (!line || !lt) continue;
        if (line.id) {
          const { error: updErr } = await supabase
            .from("sale_items")
            .update({
              quantity: line.quantity,
              rate: line.rate,
              discount: line.discount,
              gst_rate: line.gst_rate,
              taxable_amount: lt.lineBase,
              tax_amount: lt.tax,
              total: lt.total,
              cost_price: line.purchase_price,
            })
            .eq("id", line.id);
          if (updErr) throw updErr;
        }
      }

      // 5. Insert new sale_items
      const newLines = lines.filter((l) => !l.id);
      if (newLines.length > 0) {
        const insertPayload = newLines.map((line) => {
          const base = Math.max(0, line.quantity * line.rate - line.discount);
          const tax = Math.round(((base * line.gst_rate) / 100) * 100) / 100;
          return {
            business_id: currentSale.business_id,
            sale_id: currentSale.id,
            product_id: line.product_id,
            product_name: line.product_name,
            hsn_code: line.hsn_code ?? null,
            quantity: line.quantity,
            rate: line.rate,
            discount: line.discount,
            gst_rate: line.gst_rate,
            taxable_amount: base,
            tax_amount: tax,
            total: base + tax,
            cost_price: line.purchase_price,
          };
        });
        const { error: insErr } = await supabase.from("sale_items").insert(insertPayload);
        if (insErr) throw insErr;
      }

      // 6. Refresh inventory transactions for this sale
      const { error: invDelErr } = await supabase
        .from("inventory_transactions")
        .delete()
        .eq("reference_type", "sale")
        .eq("reference_id", currentSale.id);
      if (invDelErr) throw invDelErr;

      // Insert fresh transactions for all updated lines
      const invTxnRows = lines.map((l) => ({
        business_id: currentSale.business_id,
        warehouse_id: warehouseId ?? currentSale.warehouse_id,
        product_id: l.product_id,
        txn_type: "sale" as const,
        reference_type: "sale",
        reference_id: currentSale.id,
        reference_no: currentSale.invoice_no,
        qty_out: l.quantity,
        unit_cost: l.purchase_price,
        created_by: user?.id ?? null,
        txn_date: invoiceDate ? new Date(invoiceDate).toISOString() : new Date().toISOString(),
      }));

      const { error: invInsErr } = await supabase.from("inventory_transactions").insert(invTxnRows);
      if (invInsErr) throw invInsErr;

      // 7. Update the sales record
      const resolvedCustomerName =
        customerId === "walkin"
          ? "Walk-in Customer"
          : (customers as any[])?.find((c) => c.id === customerId)?.name ??
            customerName ??
            "Walk-in Customer";

      const finalPaidAmount = Number(paid) || 0;

      const { error: saleUpdErr } = await supabase
        .from("sales")
        .update({
          customer_id: customerId === "walkin" ? null : customerId,
          customer_name: resolvedCustomerName,
          invoice_date: invoiceDate ? new Date(invoiceDate).toISOString() : currentSale.invoice_date,
          warehouse_id: warehouseId,
          subtotal: calculations.subtotal,
          discount_amount: calculations.totalDiscount,
          taxable_amount: calculations.netTaxable,
          cgst: calculations.cgst,
          sgst: calculations.sgst,
          round_off: calculations.roundOff,
          grand_total: calculations.grandTotal,
          paid_amount: finalPaidAmount,
          cogs: calculations.totalCogs,
          notes: notes || null,
          status: status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentSale.id);
      if (saleUpdErr) throw saleUpdErr;

      // 8. Update customer balance (if unpaid / credit involved)
      const prevUnpaid = currentSale.customer_id
        ? Math.max(0, Number(currentSale.grand_total) - Number(currentSale.paid_amount))
        : 0;
      const newCustId = customerId === "walkin" ? null : customerId;
      const newUnpaid = newCustId ? Math.max(0, calculations.grandTotal - finalPaidAmount) : 0;

      if (currentSale.customer_id === newCustId) {
        const diff = newUnpaid - prevUnpaid;
        if (diff !== 0 && newCustId) {
          const { data: c } = await supabase
            .from("customers")
            .select("balance")
            .eq("id", newCustId)
            .single();
          if (c) {
            await supabase
              .from("customers")
              .update({ balance: (Number(c.balance) || 0) + diff })
              .eq("id", newCustId);
          }
        }
      } else {
        // Revert from old customer
        if (currentSale.customer_id && prevUnpaid > 0) {
          const { data: c } = await supabase
            .from("customers")
            .select("balance")
            .eq("id", currentSale.customer_id)
            .single();
          if (c) {
            await supabase
              .from("customers")
              .update({ balance: (Number(c.balance) || 0) - prevUnpaid })
              .eq("id", currentSale.customer_id);
          }
        }
        // Apply to new customer
        if (newCustId && newUnpaid > 0) {
          const { data: c } = await supabase
            .from("customers")
            .select("balance")
            .eq("id", newCustId)
            .single();
          if (c) {
            await supabase
              .from("customers")
              .update({ balance: (Number(c.balance) || 0) + newUnpaid })
              .eq("id", newCustId);
          }
        }
      }

      // 9. Customer Payments adjustment
      const { data: existingPayments } = await supabase
        .from("customer_payments")
        .select("*")
        .eq("sale_id", currentSale.id);

      if (existingPayments && existingPayments.length > 0) {
        const payId = existingPayments[0]?.id;
        if (payId) {
          await supabase
            .from("customer_payments")
            .update({
              amount: finalPaidAmount,
              method: method as any,
              customer_id: newCustId,
              remarks: reason ? `Admin Edit: ${reason}` : "Updated via Admin Invoice Edit",
            })
            .eq("id", payId);
        }
      } else if (finalPaidAmount > 0) {
        await supabase.from("customer_payments").insert({
          business_id: currentSale.business_id,
          customer_id: newCustId,
          sale_id: currentSale.id,
          amount: finalPaidAmount,
          method: method as any,
          remarks: reason ? `Admin Edit: ${reason}` : "Created via Admin Invoice Edit",
        });
      }

      // 10. Credit Transaction update if applicable
      const { data: existingCredit } = await supabase
        .from("credit_transactions")
        .select("*")
        .eq("sale_id", currentSale.id)
        .maybeSingle();

      if (existingCredit) {
        const outstanding = Math.max(0, calculations.grandTotal - finalPaidAmount);
        await supabase
          .from("credit_transactions")
          .update({
            customer_id: newCustId ?? existingCredit.customer_id,
            original_amount: calculations.grandTotal,
            paid_amount: finalPaidAmount,
            outstanding_amount: outstanding,
            due_date: dueDate ? dueDate : existingCredit.due_date,
            status: outstanding <= 0 ? "paid" : "active",
            settled_at: outstanding <= 0 ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingCredit.id);
      }

      // 11. Comprehensive Audit Log
      await logAudit(
        "Sales",
        "Invoice Modified by Admin",
        currentSale.invoice_no,
        {
          grand_total: currentSale.grand_total,
          paid_amount: currentSale.paid_amount,
          customer_name: currentSale.customer_name,
          items_count: currentSale.sale_items?.length ?? 0,
          notes: currentSale.notes,
        },
        {
          grand_total: calculations.grandTotal,
          paid_amount: finalPaidAmount,
          customer_name: resolvedCustomerName,
          items_count: lines.length,
          notes: notes || undefined,
          reason: reason || "Invoice modified by admin",
          admin_email: user?.email,
        },
      );

      return currentSale.invoice_no;
    },
    onSuccess: (invNo) => {
      toast.success(`Invoice ${invNo} updated successfully!`);
      void qc.invalidateQueries({ queryKey: ["sales"] });
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["inventory_txns"] });
      void qc.invalidateQueries({ queryKey: ["customers"] });
      void qc.invalidateQueries({ queryKey: ["reports"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["credit_transactions"] });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to update invoice.");
    },
  });

  if (!isAdmin) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-5" />
              Admin Permission Required
            </DialogTitle>
            <DialogDescription>
              Only Business Administrators or Super Admins are permitted to modify created invoices.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Pencil className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  Edit Invoice: {saleNumber || "Loading..."}
                  <Badge variant="outline" className="gap-1 bg-amber-500/10 text-amber-600 border-amber-300">
                    <ShieldCheck className="size-3" />
                    Admin Mode
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  Modify line items, quantities, rates, customer details, and payment settlement.
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground animate-pulse">
            Loading invoice details and transaction ledger...
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* 1. Header Information */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 rounded-lg border bg-muted/20 p-3.5">
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground">Customer</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-4 p-0 text-[11px] text-primary hover:text-primary/80 gap-0.5"
                    onClick={() => setNewCustomerOpen(true)}
                  >
                    <UserPlus className="size-3" />
                    New
                  </Button>
                </div>
                <Select
                  value={customerId}
                  onValueChange={(val) => {
                    if (val === "__new__") {
                      setNewCustomerOpen(true);
                      return;
                    }
                    setCustomerId(val);
                    const found = ((customers ?? []) as any[]).find((c) => c.id === val);
                    if (found) setCustomerName(found.name);
                    else if (val === "walkin") setCustomerName("Walk-in Customer");
                  }}
                >
                  <SelectTrigger className="mt-1 bg-background">
                    <SelectValue placeholder="Select Customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      value="__new__"
                      className="text-primary font-semibold border-b py-2 focus:bg-primary/10 focus:text-primary cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <UserPlus className="size-3.5" />
                        + Add New Customer
                      </span>
                    </SelectItem>
                    <SelectItem value="walkin">Walk-in Customer</SelectItem>
                    {((customers ?? []) as any[]).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {c.mobile ? `(${c.mobile})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-medium text-muted-foreground">Invoice Date & Time</Label>
                <Input
                  type="datetime-local"
                  className="mt-1 bg-background text-xs"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>

              <div>
                <LocationSelector
                  value={warehouseId}
                  onChange={setWarehouseId}
                  label="Dispatch Warehouse / Location"
                  className="mt-0"
                />
              </div>

              <div>
                <Label className="text-xs font-medium text-muted-foreground">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="mt-1 bg-background capitalize">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completed">Completed / Paid</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 2. Line Items Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <ShoppingBag className="size-4 text-primary" />
                  Invoice Items ({lines.length})
                </h3>
                <span className="text-xs text-muted-foreground">
                  Changes automatically recalculate tax and adjust inventory stock.
                </span>
              </div>

              <div className="rounded-lg border bg-card overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow className="text-xs">
                      <TableHead className="w-10 text-center">#</TableHead>
                      <TableHead className="min-w-[200px]">Product</TableHead>
                      <TableHead className="w-32 text-center">Qty</TableHead>
                      <TableHead className="w-28 text-right">Rate (₹)</TableHead>
                      <TableHead className="w-24 text-center">GST %</TableHead>
                      <TableHead className="w-28 text-right">Disc. (₹)</TableHead>
                      <TableHead className="w-28 text-right">Total (₹)</TableHead>
                      <TableHead className="w-12 text-center" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, idx) => {
                      const lt = calculations.lineCalculations[idx] ?? { lineBase: 0, tax: 0, total: 0 };
                      const hasReturns = line.returned_qty > 0;

                      return (
                        <TableRow key={line.id ?? `new-${idx}`} className="text-xs">
                          <TableCell className="text-center text-muted-foreground font-mono">
                            {idx + 1}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-semibold text-sm leading-tight">{line.product_name}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {line.sku && (
                                  <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                                    {line.sku}
                                  </Badge>
                                )}
                                {hasReturns && (
                                  <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">
                                    {line.returned_qty} returned
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="size-6 h-6 w-6"
                                onClick={() =>
                                  updateLine(idx, {
                                    quantity: Math.max(
                                      line.returned_qty > 0 ? line.returned_qty : 1,
                                      line.quantity - 1,
                                    ),
                                  })
                                }
                                disabled={hasReturns && line.quantity <= line.returned_qty}
                              >
                                <Minus className="size-3" />
                              </Button>
                              <Input
                                type="number"
                                className="h-7 w-14 text-center text-xs p-1"
                                min={line.returned_qty > 0 ? line.returned_qty : 1}
                                value={line.quantity}
                                onChange={(e) =>
                                  updateLine(idx, {
                                    quantity: Math.max(1, Number(e.target.value) || 1),
                                  })
                                }
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="size-6 h-6 w-6"
                                onClick={() => updateLine(idx, { quantity: line.quantity + 1 })}
                              >
                                <Plus className="size-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              className="h-7 w-24 text-right text-xs p-1 ml-auto"
                              step="0.01"
                              min="0"
                              value={line.rate}
                              onChange={(e) =>
                                updateLine(idx, { rate: Math.max(0, Number(e.target.value) || 0) })
                              }
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Select
                              value={String(line.gst_rate)}
                              onValueChange={(val) => updateLine(idx, { gst_rate: Number(val) })}
                            >
                              <SelectTrigger className="h-7 w-20 text-xs mx-auto">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {[0, 5, 12, 18, 28].map((g) => (
                                  <SelectItem key={g} value={String(g)}>
                                    {g}%
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              className="h-7 w-20 text-right text-xs p-1 ml-auto"
                              min="0"
                              value={line.discount}
                              onChange={(e) =>
                                updateLine(idx, {
                                  discount: Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                            />
                          </TableCell>
                          <TableCell className="text-right font-medium tabular text-sm">
                            {inr(lt.total)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground hover:text-destructive"
                              onClick={() => removeLine(idx)}
                              disabled={hasReturns}
                              title={hasReturns ? "Cannot delete item with returns" : "Remove item"}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Add item bar */}
              <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg border border-dashed bg-muted/10">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="absolute top-2 left-2.5 size-3.5 text-muted-foreground" />
                  <Input
                    className="h-8 pl-8 text-xs bg-background"
                    placeholder="Search product by name, SKU or barcode to add..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                </div>
                {productSearch.trim().length > 0 && (
                  <div className="w-full max-h-48 overflow-y-auto rounded-md border bg-popover p-1 shadow-md z-10">
                    {availableProducts.length === 0 ? (
                      <p className="p-2 text-xs text-muted-foreground text-center">
                        No active product found matching "{productSearch}"
                      </p>
                    ) : (
                      availableProducts.slice(0, 8).map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between p-2 rounded cursor-pointer hover:bg-accent text-xs"
                          onClick={() => handleAddProduct(p)}
                        >
                          <div>
                            <span className="font-medium">{p.name}</span>
                            <span className="text-muted-foreground ml-2">SKU: {p.sku}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-muted-foreground">
                              Stock: {p.current_stock} {p.unit}
                            </span>
                            <span className="font-semibold text-primary">{inr(p.selling_price)}</span>
                            <Button size="sm" className="h-6 text-[10px] px-2">
                              Add
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 3. Bottom Controls & Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* Left Column: Settlement & Notes */}
              <div className="space-y-3.5">
                <Card className="p-3.5 space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Payment & Settlement
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Payment Method</Label>
                      <Select value={method} onValueChange={setMethod}>
                        <SelectTrigger className="mt-1 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHODS.map((m) => (
                            <SelectItem key={m.value} value={m.value}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs">Amount Paid (₹)</Label>
                      <Input
                        type="number"
                        className="mt-1 h-8 text-xs"
                        min="0"
                        value={paid}
                        onChange={(e) => setPaid(e.target.value)}
                      />
                    </div>
                  </div>

                  {isCreditSale && (
                    <div>
                      <Label className="text-xs">Credit Due Date</Label>
                      <Input
                        type="date"
                        className="mt-1 h-8 text-xs"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                      />
                    </div>
                  )}

                  <div>
                    <Label className="text-xs">Invoice Notes</Label>
                    <Input
                      className="mt-1 h-8 text-xs"
                      placeholder="Optional notes or remarks"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                      Reason for Admin Edit (Recorded in Audit Log)
                    </Label>
                    <Input
                      className="mt-1 h-8 text-xs border-amber-300 focus:ring-amber-500"
                      placeholder="e.g., Customer requested quantity correction, rate discount adjustment"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>
                </Card>
              </div>

              {/* Right Column: Financial Totals */}
              <div>
                <Card className="p-3.5 space-y-2 bg-muted/10">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Summary & Taxes
                  </h4>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="tabular font-medium">{inr(calculations.subtotal)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Item Discounts</span>
                      <span className="tabular text-muted-foreground">
                        - {inr(calculations.itemDiscounts)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Extra Invoice Discount</span>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">-</span>
                        <Input
                          type="number"
                          className="h-6 w-20 text-right text-xs p-1"
                          min="0"
                          value={invoiceDiscount}
                          onChange={(e) => setInvoiceDiscount(e.target.value)}
                        />
                      </div>
                    </div>

                    <Separator className="my-1" />

                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Taxable Value</span>
                      <span className="tabular font-medium">{inr(calculations.netTaxable)}</span>
                    </div>

                    <div className="flex justify-between text-muted-foreground">
                      <span>CGST</span>
                      <span className="tabular">{inr(calculations.cgst)}</span>
                    </div>

                    <div className="flex justify-between text-muted-foreground">
                      <span>SGST</span>
                      <span className="tabular">{inr(calculations.sgst)}</span>
                    </div>

                    {calculations.roundOff !== 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Round off</span>
                        <span className="tabular">{inr(calculations.roundOff)}</span>
                      </div>
                    )}

                    <Separator className="my-1.5" />

                    <div className="flex justify-between text-base font-bold text-foreground">
                      <span>Grand Total</span>
                      <span className="tabular text-primary">{inr(calculations.grandTotal)}</span>
                    </div>

                    <div className="flex justify-between text-xs pt-1">
                      <span className="text-muted-foreground">Settled / Paid:</span>
                      <span className="tabular font-medium">{inr(calculations.currentPaid)}</span>
                    </div>

                    <div className="flex justify-between text-xs font-semibold">
                      <span>Balance Due:</span>
                      <span
                        className={
                          calculations.balanceDue > 0
                            ? "tabular text-destructive"
                            : "tabular text-emerald-600"
                        }
                      >
                        {calculations.balanceDue > 0
                          ? inr(calculations.balanceDue)
                          : "Fully Settled"}
                      </span>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="mt-4 flex flex-row items-center justify-between border-t pt-3 w-full">
          {isAdmin && saleId ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saveMutation.isPending}
              className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
              onClick={() => setConfirmDeleteOpen(true)}
            >
              <Trash2 className="size-4" />
              Delete Invoice
            </Button>
          ) : (
            <div />
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saveMutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saveMutation.isPending || loading || lines.length === 0}
              onClick={() => saveMutation.mutate()}
              className="gap-1.5"
            >
              <Save className="size-4" />
              {saveMutation.isPending ? "Saving Modifications..." : "Save Invoice Changes"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <QuickAddCustomerDialog
        open={newCustomerOpen}
        onOpenChange={setNewCustomerOpen}
        onCustomerCreated={(c) => {
          setCustomerId(c.id);
          setCustomerName(c.name);
        }}
      />

      <DeleteInvoiceDialog
        sale={
          saleId && saleNumber
            ? {
                id: saleId,
                invoice_no: saleNumber,
                invoice_date: invoiceDate,
                customer_name: customerName,
                customer_id: customerId === "walkin" ? null : customerId,
                grand_total: calculations.grandTotal,
                paid_amount: Number(paid) || 0,
                business_id: null,
              }
            : null
        }
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        onSuccess={() => {
          setConfirmDeleteOpen(false);
          onOpenChange(false);
          onSuccess?.();
        }}
      />
    </Dialog>
  );
}

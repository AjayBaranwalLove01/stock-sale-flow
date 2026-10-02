import { useState, useEffect, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  MessageCircle,
  History,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Phone,
  Clock,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  sendInvoiceViaWhatsApp,
  normalizeWhatsAppNumber,
  formatWhatsAppMessage,
  fetchSaleSendHistory,
  type WhatsAppInvoicePayload,
  type SendHistoryRecord,
} from "@/lib/whatsapp";
import { dateTimeFmt } from "@/lib/format";

export interface SendWhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string;
  invoiceNo: string;
  invoiceDate: string;
  grandTotal: number;
  customerName: string;
  customerId?: string | null | undefined;
  initialPhone?: string | null | undefined;
  businessName: string;
  businessId: string;
  accessToken?: string | null | undefined;
  onSuccess?: (() => void) | undefined;
}

export function SendWhatsAppDialog({
  open,
  onOpenChange,
  saleId,
  invoiceNo,
  invoiceDate,
  grandTotal,
  customerName,
  customerId,
  initialPhone,
  businessName,
  businessId,
  accessToken,
  onSuccess,
}: SendWhatsAppDialogProps) {
  const { user } = useAuth();
  const [phone, setPhone] = useState(initialPhone || "");
  const [saveToCustomer, setSaveToCustomer] = useState(false);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<SendHistoryRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Sync phone if initialPhone changes
  useEffect(() => {
    if (initialPhone) {
      setPhone(initialPhone);
    }
  }, [initialPhone]);

  // Load sending history
  useEffect(() => {
    if (open && saleId) {
      void fetchSaleSendHistory(saleId).then(setHistory);
    }
  }, [open, saleId]);

  const payload: WhatsAppInvoicePayload = useMemo(
    () => ({
      saleId,
      invoiceNo,
      invoiceDate,
      grandTotal,
      customerName,
      customerId,
      customerPhone: phone,
      businessName,
      businessId,
      accessToken,
      senderUserId: user?.id,
      senderUserEmail: user?.email,
    }),
    [
      saleId,
      invoiceNo,
      invoiceDate,
      grandTotal,
      customerName,
      customerId,
      phone,
      businessName,
      businessId,
      accessToken,
      user,
    ],
  );

  const previewMessage = useMemo(() => formatWhatsAppMessage(payload), [payload]);
  const phoneValidation = useMemo(() => normalizeWhatsAppNumber(phone), [phone]);

  const handleSend = async () => {
    if (!phoneValidation.isValid) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }

    setSending(true);
    try {
      // 1. Optionally save phone to customer record
      if (saveToCustomer && customerId) {
        await supabase
          .from("customers")
          .update({ mobile: phone.trim() })
          .eq("id", customerId);
      }

      // 2. Dispatch WhatsApp
      const result = await sendInvoiceViaWhatsApp(payload, phone);

      if (result.success) {
        toast.success(`WhatsApp opened for invoice ${invoiceNo}`);
        onSuccess?.();
        onOpenChange(false);
      } else {
        toast.error(result.error || "Failed to open WhatsApp");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error sending WhatsApp");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-full bg-[#25D366]/15 text-[#25D366] flex items-center justify-center shrink-0">
              <MessageCircle className="size-5 fill-current" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">Send Invoice on WhatsApp</DialogTitle>
              <DialogDescription className="text-xs">
                Share a secure, professional invoice link directly with your customer.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Invoice Summary Pill */}
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-2.5 text-xs">
            <div>
              <span className="text-muted-foreground">Invoice: </span>
              <span className="font-semibold text-foreground font-mono">{invoiceNo}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Customer: </span>
              <span className="font-semibold text-foreground">{customerName}</span>
            </div>
          </div>

          {/* Mobile Number Input */}
          <div className="space-y-1.5">
            <Label htmlFor="whatsapp-phone" className="text-xs font-semibold flex items-center gap-1.5">
              <Phone className="size-3.5 text-muted-foreground" />
              Customer Mobile / WhatsApp Number *
            </Label>
            <div className="relative">
              <Input
                id="whatsapp-phone"
                type="tel"
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`text-sm ${
                  phone && !phoneValidation.isValid ? "border-destructive focus-visible:ring-destructive" : ""
                }`}
              />
              {phoneValidation.isValid && (
                <CheckCircle2 className="size-4 text-success absolute right-3 top-2.5 pointer-events-none" />
              )}
            </div>

            {/* Validation / Missing number hint */}
            {!phone.trim() ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1">
                <AlertCircle className="size-3.5 shrink-0" />
                Customer does not have a mobile number saved. Please enter one above.
              </p>
            ) : !phoneValidation.isValid ? (
              <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                <AlertCircle className="size-3.5 shrink-0" />
                Please enter a valid 10-digit mobile number.
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Formatted for WhatsApp: <span className="font-mono font-medium">+{phoneValidation.clean}</span>
              </p>
            )}

            {/* Save to customer checkbox if customerId exists */}
            {customerId && (
              <div className="flex items-center gap-2 pt-1.5">
                <Checkbox
                  id="save-customer-phone"
                  checked={saveToCustomer}
                  onCheckedChange={(c) => setSaveToCustomer(!!c)}
                />
                <label
                  htmlFor="save-customer-phone"
                  className="text-xs text-muted-foreground cursor-pointer select-none"
                >
                  Save this phone number to {customerName}&apos;s profile
                </label>
              </div>
            )}
          </div>

          {/* Message Preview Accordion */}
          <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">Message Preview</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-muted-foreground/30">
                Auto-generated
              </Badge>
            </div>
            <pre className="text-xs whitespace-pre-wrap font-sans bg-background/80 p-2.5 rounded-md border text-foreground/90 leading-relaxed max-h-36 overflow-y-auto">
              {previewMessage}
            </pre>
          </div>

          {/* Previous Send History (if any) */}
          {history.length > 0 && (
            <div className="border-t pt-2">
              <button
                type="button"
                onClick={() => setShowHistory((h) => !h)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
              >
                <History className="size-3.5" />
                <span>Previous Sends ({history.length})</span>
                <Clock className="size-3 ml-auto opacity-70" />
              </button>

              {showHistory && (
                <div className="mt-2 space-y-1.5 max-h-28 overflow-y-auto pr-1">
                  {history.map((h) => (
                    <div
                      key={h.id}
                      className="flex items-center justify-between text-[11px] bg-muted/30 px-2 py-1 rounded border border-border/50"
                    >
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="secondary"
                          className={
                            h.status === "sent"
                              ? "bg-success/15 text-success text-[10px] px-1 py-0"
                              : "bg-destructive/15 text-destructive text-[10px] px-1 py-0"
                          }
                        >
                          {h.status}
                        </Badge>
                        <span className="font-mono">+{h.recipient_phone}</span>
                      </div>
                      <span className="text-muted-foreground">{dateTimeFmt(h.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-row items-center justify-between w-full pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSend}
            disabled={!phoneValidation.isValid || sending}
            className="bg-[#25D366] hover:bg-[#20BD5A] text-white gap-1.5 shadow-sm font-semibold"
          >
            <MessageCircle className="size-4 fill-current" />
            <span>Send on WhatsApp</span>
            <ExternalLink className="size-3.5 opacity-80" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

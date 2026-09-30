import JsBarcode from "jsbarcode";
import { inr } from "@/lib/format";
import type { PrinterType, ReceiptSale, ReceiptSettings } from "@/lib/receipt";

export interface PrintContext {
  business_name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  website?: string | null;
  logo_url?: string | null;
  storefront?: string | null;
  terms?: string | null;
  cashier?: string | null;
  settings: ReceiptSettings;
}

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const money = (n: number) => inr(n).replace(/\u20b9\s?/, "₹");

/* ------------ codes ------------ */

function barcodeSvg(value: string): string {
  try {
    const doc = document.implementation.createDocument("http://www.w3.org/2000/svg", "svg", null);
    const el = doc.documentElement;
    JsBarcode(el, value, {
      format: "CODE128",
      displayValue: true,
      fontSize: 12,
      height: 40,
      margin: 0,
      width: 1.4,
    });
    return new XMLSerializer().serializeToString(el);
  } catch {
    return "";
  }
}

async function qrDataUrl(value: string): Promise<string> {
  try {
    const { default: QRCode } = await import("qrcode");
    return await QRCode.toDataURL(value, { margin: 0, width: 140 });
  } catch {
    return "";
  }
}

/* ------------ printing ------------ */

/** Renders HTML in a hidden iframe and asks the browser to print it. */
export function printHtml(html: string, copies = 1): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("Printing is only available in the browser"));
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
    document.body.appendChild(frame);

    const cleanup = () => {
      window.setTimeout(() => frame.remove(), 1000);
    };

    frame.onload = () => {
      try {
        const win = frame.contentWindow;
        if (!win) throw new Error("Print window unavailable");
        for (let i = 0; i < Math.max(1, copies); i++) {
          win.focus();
          win.print();
        }
        cleanup();
        resolve();
      } catch (e) {
        cleanup();
        reject(e instanceof Error ? e : new Error("Printing failed"));
      }
    };
    frame.onerror = () => {
      cleanup();
      reject(new Error("Printing failed"));
    };

    const doc = frame.contentDocument;
    if (!doc) {
      cleanup();
      return reject(new Error("Printing is blocked by the browser"));
    }
    doc.open();
    doc.write(html);
    doc.close();
  });
}

/* ------------ documents ------------ */

function pageCss(kind: PrinterType) {
  if (kind === "thermal58" || kind === "thermal80") {
    const w = kind === "thermal58" ? "58mm" : "80mm";
    return `@page{size:${w} auto;margin:2mm}
body{width:${kind === "thermal58" ? "54mm" : "76mm"};font:11px/1.35 "Courier New",monospace;margin:0;color:#000}
h1{font-size:13px;margin:0 0 2px;text-align:center}
.c{text-align:center}.r{text-align:right}.b{font-weight:700}
.sep{border-top:1px dashed #000;margin:4px 0}
table{width:100%;border-collapse:collapse}
td{padding:0;vertical-align:top;font-size:11px}
.small{font-size:10px}
.tot td{padding:1px 0}
img.logo{max-width:${kind === "thermal58" ? "40mm" : "50mm"};max-height:18mm}
svg{max-width:100%}`;
  }
  const size = kind === "a5" ? "A5" : "A4";
  return `@page{size:${size};margin:12mm}
body{font:12px/1.5 Helvetica,Arial,sans-serif;color:#111;margin:0}
h1{font-size:20px;margin:0 0 2px}
.muted{color:#555}
.row{display:flex;justify-content:space-between;gap:24px}
table.items{width:100%;border-collapse:collapse;margin-top:14px}
table.items th{background:#f2f2f2;text-align:left;padding:6px;border-bottom:1px solid #ccc;font-size:11px}
table.items td{padding:6px;border-bottom:1px solid #eee;font-size:11px}
.r{text-align:right}.b{font-weight:700}
.totals{margin-top:12px;margin-left:auto;width:260px}
.totals div{display:flex;justify-content:space-between;padding:2px 0}
.grand{border-top:1px solid #333;margin-top:4px;padding-top:6px;font-weight:700;font-size:14px}
img.logo{max-height:56px}
footer{margin-top:24px;font-size:11px;color:#555;white-space:pre-line}`;
}

function shell(title: string, kind: PrinterType, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${pageCss(kind)}</style></head><body>${body}</body></html>`;
}

function footerText(s: ReceiptSettings) {
  return [s.receipt_footer, s.receipt_return_policy, s.receipt_support_info]
    .filter((x) => x && String(x).trim())
    .join("\n\n");
}

export async function buildReceiptHtml(
  sale: ReceiptSale,
  ctx: PrintContext,
  kind: PrinterType = "thermal80",
): Promise<string> {
  const s = ctx.settings;
  const d = new Date(sale.invoice_date);
  const codes: string[] = [];
  if (s.receipt_show_barcode) {
    const svg = barcodeSvg(sale.invoice_no);
    if (svg) codes.push(`<div class="c">${svg}</div>`);
  }
  if (s.receipt_show_qr) {
    const url = await qrDataUrl(`${sale.invoice_no}|${sale.grand_total}`);
    if (url) codes.push(`<div class="c"><img src="${url}" width="110" height="110" alt="Invoice QR"/></div>`);
  }

  const items = sale.items
    .map((it) => {
      const ref = [it.sku, it.barcode].filter(Boolean).join(" · ");
      return `<tr><td colspan="2" class="b">${esc(it.product_name)}</td></tr>
${ref ? `<tr><td colspan="2" class="small">${esc(ref)}</td></tr>` : ""}
<tr><td>Qty: ${it.quantity} x ${money(it.rate)}</td><td class="r">${money(it.total)}</td></tr>
${it.discount ? `<tr><td class="small">Discount</td><td class="r small">-${money(it.discount)}</td></tr>` : ""}
${s.receipt_show_tax && it.tax_amount ? `<tr><td class="small">GST ${it.gst_rate}%</td><td class="r small">${money(it.tax_amount)}</td></tr>` : ""}`;
    })
    .join("");

  const tot = (label: string, value: number, cls = "") =>
    `<tr class="${cls}"><td>${esc(label)}</td><td class="r">${money(value)}</td></tr>`;

  const change = Math.max(0, sale.paid_amount - sale.grand_total);
  const due = Math.max(0, sale.grand_total - sale.paid_amount);
  const foot = footerText(s);

  const body = `
<div class="c">
  ${s.receipt_show_logo && ctx.logo_url ? `<img class="logo" src="${esc(ctx.logo_url)}" alt=""/>` : ""}
  <h1>${esc(ctx.business_name)}</h1>
  ${ctx.address ? `<div class="small">${esc(ctx.address)}</div>` : ""}
  ${ctx.phone ? `<div class="small">Ph: ${esc(ctx.phone)}</div>` : ""}
  ${ctx.email ? `<div class="small">${esc(ctx.email)}</div>` : ""}
  ${ctx.gstin ? `<div class="small">GSTIN: ${esc(ctx.gstin)}</div>` : ""}
  ${ctx.website ? `<div class="small">${esc(ctx.website)}</div>` : ""}
  ${ctx.storefront ? `<div class="small">Store: ${esc(ctx.storefront)}</div>` : ""}
</div>
<div class="sep"></div>
<table>
  <tr><td>Invoice</td><td class="r b">${esc(sale.invoice_no)}</td></tr>
  <tr><td>Date</td><td class="r">${d.toLocaleDateString("en-IN")}</td></tr>
  <tr><td>Time</td><td class="r">${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</td></tr>
  ${s.receipt_show_cashier && ctx.cashier ? `<tr><td>Cashier</td><td class="r">${esc(ctx.cashier)}</td></tr>` : ""}
  ${s.receipt_show_customer ? `<tr><td>Customer</td><td class="r">${esc(sale.customer_name)}</td></tr>` : ""}
  ${s.receipt_show_customer && sale.customer_mobile ? `<tr><td>Mobile</td><td class="r">${esc(sale.customer_mobile)}</td></tr>` : ""}
</table>
<div class="sep"></div>
<table>${items}</table>
<div class="sep"></div>
<table class="tot">
  ${tot("Subtotal", sale.subtotal)}
  ${sale.discount_amount ? tot("Discount", -sale.discount_amount) : ""}
  ${s.receipt_show_tax ? tot("Taxable", sale.taxable_amount) : ""}
  ${s.receipt_show_tax && sale.cgst ? tot("CGST", sale.cgst) : ""}
  ${s.receipt_show_tax && sale.sgst ? tot("SGST", sale.sgst) : ""}
  ${s.receipt_show_tax && sale.igst ? tot("IGST", sale.igst) : ""}
  ${sale.round_off ? tot("Round off", sale.round_off) : ""}
  ${tot("GRAND TOTAL", sale.grand_total, "b")}
  ${tot("Paid", sale.paid_amount)}
  ${change ? tot("Change", change) : ""}
  ${due ? tot("Balance due", due) : ""}
</table>
${
  sale.payments.length
    ? `<div class="sep"></div><table>${sale.payments
        .map(
          (p) =>
            `<tr><td>${esc(p.method.replace("_", " ").toUpperCase())}</td><td class="r">${money(p.amount)}</td></tr>`,
        )
        .join("")}</table>`
    : ""
}
${codes.length ? `<div class="sep"></div>${codes.join("")}` : ""}
${foot ? `<div class="sep"></div><div class="c small" style="white-space:pre-line">${esc(foot)}</div>` : ""}
<div class="c small" style="margin-top:6px">*** Thank you ***</div>`;

  return shell(`Receipt ${sale.invoice_no}`, kind, body);
}

export async function buildInvoiceHtml(
  sale: ReceiptSale,
  ctx: PrintContext,
  kind: PrinterType = "a4",
): Promise<string> {
  const s = ctx.settings;
  const d = new Date(sale.invoice_date);
  const hasHsn = sale.items.some((i) => i.hsn_code);
  const qr = s.receipt_show_qr ? await qrDataUrl(`${sale.invoice_no}|${sale.grand_total}`) : "";

  const rows = sale.items
    .map(
      (it, i) => `<tr>
<td>${i + 1}</td>
<td>${esc(it.product_name)}<div class="muted">${esc(it.sku ?? "")}</div></td>
${hasHsn ? `<td>${esc(it.hsn_code ?? "")}</td>` : ""}
<td class="r">${it.quantity}</td>
<td class="r">${money(it.rate)}</td>
<td class="r">${money(it.discount ?? 0)}</td>
<td class="r">${it.gst_rate}% (${money(it.tax_amount ?? 0)})</td>
<td class="r">${money(it.total)}</td></tr>`,
    )
    .join("");

  const line = (l: string, v: number) => `<div><span>${esc(l)}</span><span>${money(v)}</span></div>`;
  const foot = [footerText(s), ctx.terms].filter(Boolean).join("\n\n");

  const body = `
<div class="row">
  <div>
    ${s.receipt_show_logo && ctx.logo_url ? `<img class="logo" src="${esc(ctx.logo_url)}" alt=""/>` : ""}
    <h1>${esc(ctx.business_name)}</h1>
    <div class="muted">${esc(ctx.address ?? "")}</div>
    <div class="muted">${[ctx.phone, ctx.email].filter(Boolean).map(esc).join(" · ")}</div>
    ${ctx.gstin ? `<div class="muted">GSTIN: ${esc(ctx.gstin)}</div>` : ""}
    ${ctx.website ? `<div class="muted">${esc(ctx.website)}</div>` : ""}
  </div>
  <div class="r">
    <div class="b" style="font-size:16px">TAX INVOICE</div>
    <div>${esc(sale.invoice_no)}</div>
    <div class="muted">${d.toLocaleString("en-IN")}</div>
    ${qr ? `<img src="${qr}" width="90" height="90" alt="Invoice QR"/>` : ""}
  </div>
</div>
<div class="row" style="margin-top:16px">
  <div>
    <div class="b">Bill To</div>
    <div>${esc(sale.customer_name)}</div>
    ${sale.customer_address ? `<div class="muted">${esc(sale.customer_address)}</div>` : ""}
    ${sale.customer_mobile ? `<div class="muted">${esc(sale.customer_mobile)}</div>` : ""}
    ${sale.customer_gstin ? `<div class="muted">GSTIN: ${esc(sale.customer_gstin)}</div>` : ""}
  </div>
  ${s.receipt_show_cashier && ctx.cashier ? `<div class="r muted">Billed by<br/>${esc(ctx.cashier)}</div>` : ""}
</div>
<table class="items">
  <thead><tr><th>#</th><th>Item</th>${hasHsn ? "<th>HSN</th>" : ""}<th class="r">Qty</th><th class="r">Rate</th><th class="r">Disc</th><th class="r">Tax</th><th class="r">Amount</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="totals">
  ${line("Subtotal", sale.subtotal)}
  ${sale.discount_amount ? line("Discount", -sale.discount_amount) : ""}
  ${line("Taxable value", sale.taxable_amount)}
  ${sale.cgst ? line("CGST", sale.cgst) : ""}
  ${sale.sgst ? line("SGST", sale.sgst) : ""}
  ${sale.igst ? line("IGST", sale.igst) : ""}
  ${sale.round_off ? line("Round off", sale.round_off) : ""}
  <div class="grand"><span>Grand Total</span><span>${money(sale.grand_total)}</span></div>
  ${line("Paid", sale.paid_amount)}
  ${sale.grand_total - sale.paid_amount > 0 ? line("Balance due", sale.grand_total - sale.paid_amount) : ""}
</div>
${
  sale.payments.length
    ? `<div style="margin-top:12px"><span class="b">Payments: </span>${sale.payments
        .map((p) => `${esc(p.method.replace("_", " "))} ${money(p.amount)}`)
        .join(", ")}</div>`
    : ""
}
${foot ? `<footer>${esc(foot)}</footer>` : ""}`;

  return shell(`Invoice ${sale.invoice_no}`, kind, body);
}

export function buildTestPrintHtml(ctx: PrintContext, kind: PrinterType): string {
  const now = new Date();
  const paper = kind === "thermal58" ? "58mm" : kind === "thermal80" ? "80mm" : kind.toUpperCase();
  const body = `
<div class="c b">TEST PRINT</div>
<div class="sep"></div>
<div class="c">
  <div class="b">${esc(ctx.business_name)}</div>
  <div>Receipt Printer Test</div>
</div>
<div class="sep"></div>
<table>
  <tr><td>Printer</td><td class="r">${esc(ctx.settings.printer_name || "System printer")}</td></tr>
  <tr><td>Paper</td><td class="r">${esc(paper)}</td></tr>
  <tr><td>Connection</td><td class="r">${esc(ctx.settings.printer_connection)}</td></tr>
  <tr><td>Date/Time</td><td class="r">${now.toLocaleString("en-IN")}</td></tr>
</table>
<div class="sep"></div>
<div class="c">************************<br/>Printer working correctly<br/>************************</div>`;
  return shell("Test print", kind, body);
}

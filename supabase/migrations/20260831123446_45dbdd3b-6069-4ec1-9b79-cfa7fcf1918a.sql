INSERT INTO public.features (key, name, description, category, depends_on, enabled_globally) VALUES
  ('sales_pos','Sales / POS','Point of sale billing and invoice generation.','Operations',NULL,true),
  ('invoice_printing','Invoice Printing','Generate printable invoices from completed sales.','Operations','sales_pos',true),
  ('receipt_printing','Receipt Printing','Print POS receipts for completed sales.','Operations','invoice_printing',true),
  ('thermal_printer','Thermal Printer','58mm / 80mm thermal receipt formats.','Operations','receipt_printing',true),
  ('a4_invoice','A4 Invoice','Full-page A4/A5 tax invoice and PDF download.','Operations','invoice_printing',true),
  ('receipt_reprint','Receipt Reprint','Reprint receipts for past invoices.','Operations','receipt_printing',true)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS receipt_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_printer_type text NOT NULL DEFAULT 'thermal80',
  ADD COLUMN IF NOT EXISTS receipt_auto_print boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS receipt_copies integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS receipt_show_logo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_show_barcode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS receipt_show_qr boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS receipt_show_customer boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_show_tax boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_show_cashier boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS printer_name text,
  ADD COLUMN IF NOT EXISTS printer_connection text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS printer_host text,
  ADD COLUMN IF NOT EXISTS printer_port integer,
  ADD COLUMN IF NOT EXISTS receipt_footer text,
  ADD COLUMN IF NOT EXISTS receipt_return_policy text,
  ADD COLUMN IF NOT EXISTS receipt_support_info text;
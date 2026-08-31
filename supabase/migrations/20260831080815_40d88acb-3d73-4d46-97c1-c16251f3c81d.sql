-- Business settings
INSERT INTO public.business_settings (singleton, business_name, address, phone, email, gstin, state, invoice_prefix, invoice_start_number, terms_conditions, allow_negative_stock, low_stock_threshold, default_unit, financial_year_start, currency, default_gst)
VALUES (true, 'Ajay Traders', '14 MG Road, Bengaluru, Karnataka 560001', '+91 98450 12345', 'billing@ajaytraders.in', '29ABCDE1234F1Z5', 'Karnataka', 'INV', 1, E'1. Goods once sold will not be taken back.\n2. Payment due within 15 days.\n3. Subject to Bengaluru jurisdiction.', false, 10, 'pcs', DATE '2026-04-01', 'INR', 18)
ON CONFLICT DO NOTHING;

-- Categories
INSERT INTO public.categories (id, code, name, description) VALUES
 ('11111111-1111-4111-8111-000000000001','CAT-001','Grocery','Staples, pulses and cooking essentials'),
 ('11111111-1111-4111-8111-000000000002','CAT-002','Beverages','Tea, coffee, soft drinks and juices'),
 ('11111111-1111-4111-8111-000000000003','CAT-003','Personal Care','Soaps, shampoos and hygiene products'),
 ('11111111-1111-4111-8111-000000000004','CAT-004','Household','Cleaning and home utility items');

-- Suppliers
INSERT INTO public.suppliers (id, name, company_name, mobile, email, gstin, address, city, state, pincode, opening_balance, balance, credit_limit, payment_terms) VALUES
 ('22222222-2222-4222-8222-000000000001','Ravi Kumar','Shree Distributors','+91 98800 11223','ravi@shreedist.in','29AAACS1234K1Z1','Plot 22, Peenya Industrial Area','Bengaluru','Karnataka','560058',0,0,200000,'Net 30'),
 ('22222222-2222-4222-8222-000000000002','Meena Iyer','Sunrise FMCG Agencies','+91 99000 44556','meena@sunrisefmcg.in','29AAECS5678L1Z2','9 Avenue Road','Bengaluru','Karnataka','560002',0,0,150000,'Net 15'),
 ('22222222-2222-4222-8222-000000000003','Imran Shaikh','Nova Home Supplies','+91 97400 77889','imran@novahome.in','29AAFCN9012M1Z3','56 Hosur Road','Bengaluru','Karnataka','560068',0,0,100000,'Net 30');

-- Customers
INSERT INTO public.customers (id, name, mobile, email, gstin, address, city, state, pincode, opening_balance, balance, credit_limit) VALUES
 ('33333333-3333-4333-8333-000000000001','Walk-in Customer',NULL,NULL,NULL,NULL,'Bengaluru','Karnataka',NULL,0,0,0),
 ('33333333-3333-4333-8333-000000000002','Anitha Rao','+91 98456 33221','anitha.rao@example.com',NULL,'42 Jayanagar 4th Block','Bengaluru','Karnataka','560011',0,0,20000),
 ('33333333-3333-4333-8333-000000000003','Green Leaf Cafe','+91 90080 55667','orders@greenleafcafe.in','29AAGCG3456N1Z4','7 Indiranagar 100ft Road','Bengaluru','Karnataka','560038',0,0,75000),
 ('33333333-3333-4333-8333-000000000004','Suresh Babu','+91 99860 88990',NULL,NULL,'12 Rajajinagar','Bengaluru','Karnataka','560010',0,0,15000);

-- Products
INSERT INTO public.products (id, sku, barcode, name, category_id, brand, description, purchase_price, mrp, selling_price, discount, gst_rate, tax_inclusive, hsn_code, opening_stock, current_stock, min_stock, max_stock, reorder_level, unit, supplier_id, rack, shelf) VALUES
 ('44444444-4444-4444-8444-000000000001','SKU-1001','8901234500011','Basmati Rice 5kg','11111111-1111-4111-8111-000000000001','Royal Harvest','Long grain aged basmati rice',420,650,599,0,5,true,'1006',40,0,10,200,15,'bag','22222222-2222-4222-8222-000000000001','A1','S1'),
 ('44444444-4444-4444-8444-000000000002','SKU-1002','8901234500028','Toor Dal 1kg','11111111-1111-4111-8111-000000000001','Royal Harvest','Premium unpolished toor dal',118,165,149,0,5,true,'0713',60,0,15,300,25,'kg','22222222-2222-4222-8222-000000000001','A1','S2'),
 ('44444444-4444-4444-8444-000000000003','SKU-1003','8901234500035','Sunflower Oil 1L','11111111-1111-4111-8111-000000000001','GoldDrop','Refined sunflower cooking oil',132,175,159,0,5,true,'1512',80,0,20,300,30,'ltr','22222222-2222-4222-8222-000000000001','A2','S1'),
 ('44444444-4444-4444-8444-000000000004','SKU-1004','8901234500042','Wheat Atta 10kg','11111111-1111-4111-8111-000000000001','Chakki Fresh','Whole wheat chakki atta',380,520,479,0,5,true,'1101',30,0,8,120,12,'bag','22222222-2222-4222-8222-000000000001','A2','S2'),
 ('44444444-4444-4444-8444-000000000005','SKU-2001','8901234500059','Assam Tea 500g','11111111-1111-4111-8111-000000000002','Hilltop','Strong CTC Assam tea leaves',185,260,239,0,5,true,'0902',50,0,12,200,20,'pcs','22222222-2222-4222-8222-000000000002','B1','S1'),
 ('44444444-4444-4444-8444-000000000006','SKU-2002','8901234500066','Instant Coffee 100g','11111111-1111-4111-8111-000000000002','Bean Co','Freeze dried instant coffee',215,320,299,0,18,true,'2101',35,0,10,150,15,'pcs','22222222-2222-4222-8222-000000000002','B1','S2'),
 ('44444444-4444-4444-8444-000000000007','SKU-2003','8901234500073','Orange Juice 1L','11111111-1111-4111-8111-000000000002','Fruvia','No added sugar orange juice',78,120,109,0,12,true,'2009',48,0,12,150,18,'pcs','22222222-2222-4222-8222-000000000002','B2','S1'),
 ('44444444-4444-4444-8444-000000000008','SKU-3001','8901234500080','Herbal Shampoo 340ml','11111111-1111-4111-8111-000000000003','Vanaa','Sulphate free herbal shampoo',148,245,219,0,18,true,'3305',42,0,10,150,15,'pcs','22222222-2222-4222-8222-000000000002','C1','S1'),
 ('44444444-4444-4444-8444-000000000009','SKU-3002','8901234500097','Sandal Soap 125g','11111111-1111-4111-8111-000000000003','Vanaa','Sandalwood bathing bar',32,55,49,0,18,true,'3401',120,0,30,400,50,'pcs','22222222-2222-4222-8222-000000000002','C1','S2'),
 ('44444444-4444-4444-8444-000000000010','SKU-3003','8901234500103','Toothpaste 150g','11111111-1111-4111-8111-000000000003','DentaMax','Fluoride cavity protection',62,99,89,0,18,true,'3306',70,0,20,250,30,'pcs','22222222-2222-4222-8222-000000000002','C2','S1'),
 ('44444444-4444-4444-8444-000000000011','SKU-4001','8901234500110','Floor Cleaner 1L','11111111-1111-4111-8111-000000000004','SparkleHome','Disinfectant floor cleaner',96,175,159,0,18,true,'3402',36,0,10,150,15,'pcs','22222222-2222-4222-8222-000000000003','D1','S1'),
 ('44444444-4444-4444-8444-000000000012','SKU-4002','8901234500127','Garbage Bags 30pcs','11111111-1111-4111-8111-000000000004','SparkleHome','Biodegradable medium garbage bags',58,110,99,0,18,true,'3923',54,0,15,200,20,'pack','22222222-2222-4222-8222-000000000003','D1','S2');

-- Opening stock
INSERT INTO public.inventory_transactions (product_id, txn_type, reference_type, reference_no, qty_in, qty_out, unit_cost, notes, txn_date)
SELECT id, 'opening', 'opening', 'OPEN-'||sku, opening_stock, 0, purchase_price, 'Opening stock', now() - interval '30 days'
FROM public.products;

-- Sample purchase
INSERT INTO public.purchases (id, purchase_no, supplier_id, purchase_date, due_date, subtotal, discount_amount, tax_amount, round_off, grand_total, paid_amount, notes)
VALUES ('55555555-5555-4555-8555-000000000001','PUR-000001','22222222-2222-4222-8222-000000000001', CURRENT_DATE - 7, CURRENT_DATE + 23, 20240, 240, 1000, 0, 21000, 15000, 'Monthly staples restock');

INSERT INTO public.purchase_items (purchase_id, product_id, quantity, rate, discount, gst_rate, tax_amount, total) VALUES
 ('55555555-5555-4555-8555-000000000001','44444444-4444-4444-8444-000000000001',20,420,140,5,634,13134),
 ('55555555-5555-4555-8555-000000000001','44444444-4444-4444-8444-000000000002',40,118,100,5,231,4851),
 ('55555555-5555-4555-8555-000000000001','44444444-4444-4444-8444-000000000003',50,132,0,5,330,6930);

INSERT INTO public.inventory_transactions (product_id, txn_type, reference_type, reference_id, reference_no, qty_in, qty_out, unit_cost, txn_date) VALUES
 ('44444444-4444-4444-8444-000000000001','purchase','purchase','55555555-5555-4555-8555-000000000001','PUR-000001',20,0,420, now() - interval '7 days'),
 ('44444444-4444-4444-8444-000000000002','purchase','purchase','55555555-5555-4555-8555-000000000001','PUR-000001',40,0,118, now() - interval '7 days'),
 ('44444444-4444-4444-8444-000000000003','purchase','purchase','55555555-5555-4555-8555-000000000001','PUR-000001',50,0,132, now() - interval '7 days');

INSERT INTO public.supplier_payments (supplier_id, purchase_id, amount, method, remarks)
VALUES ('22222222-2222-4222-8222-000000000001','55555555-5555-4555-8555-000000000001',15000,'bank_transfer','Part payment against PUR-000001');

UPDATE public.suppliers SET balance = 6000 WHERE id = '22222222-2222-4222-8222-000000000001';

-- Sample sale 1 (paid in full, walk-in)
INSERT INTO public.sales (id, invoice_no, customer_id, customer_name, invoice_date, subtotal, discount_amount, taxable_amount, cgst, sgst, igst, round_off, grand_total, paid_amount, cogs, status)
VALUES ('66666666-6666-4666-8666-000000000001','INV-2026-000001','33333333-3333-4333-8333-000000000002','Anitha Rao', now() - interval '3 days', 1495, 0, 1424.76, 35.62, 35.62, 0, 0.00, 1495, 1495, 1050, 'completed');

INSERT INTO public.sale_items (sale_id, product_id, product_name, hsn_code, quantity, rate, discount, gst_rate, tax_amount, taxable_amount, total, cost_price) VALUES
 ('66666666-6666-4666-8666-000000000001','44444444-4444-4444-8444-000000000001','Basmati Rice 5kg','1006',1,599,0,5,28.52,570.48,599,420),
 ('66666666-6666-4666-8666-000000000001','44444444-4444-4444-8444-000000000002','Toor Dal 1kg','0713',2,149,0,5,14.19,283.81,298,118),
 ('66666666-6666-4666-8666-000000000001','44444444-4444-4444-8444-000000000003','Sunflower Oil 1L','1512',2,159,0,5,15.14,302.86,318,132),
 ('66666666-6666-4666-8666-000000000001','44444444-4444-4444-8444-000000000005','Assam Tea 500g','0902',1,239,0,5,11.38,227.62,239,185),
 ('66666666-6666-4666-8666-000000000001','44444444-4444-4444-8444-000000000009','Sandal Soap 125g','3401',1,49,0,18,7.47,41.53,49,32);

INSERT INTO public.inventory_transactions (product_id, txn_type, reference_type, reference_id, reference_no, qty_in, qty_out, unit_cost, txn_date) VALUES
 ('44444444-4444-4444-8444-000000000001','sale','sale','66666666-6666-4666-8666-000000000001','INV-2026-000001',0,1,420, now() - interval '3 days'),
 ('44444444-4444-4444-8444-000000000002','sale','sale','66666666-6666-4666-8666-000000000001','INV-2026-000001',0,2,118, now() - interval '3 days'),
 ('44444444-4444-4444-8444-000000000003','sale','sale','66666666-6666-4666-8666-000000000001','INV-2026-000001',0,2,132, now() - interval '3 days'),
 ('44444444-4444-4444-8444-000000000005','sale','sale','66666666-6666-4666-8666-000000000001','INV-2026-000001',0,1,185, now() - interval '3 days'),
 ('44444444-4444-4444-8444-000000000009','sale','sale','66666666-6666-4666-8666-000000000001','INV-2026-000001',0,1,32, now() - interval '3 days');

INSERT INTO public.customer_payments (customer_id, sale_id, amount, method, remarks)
VALUES ('33333333-3333-4333-8333-000000000002','66666666-6666-4666-8666-000000000001',1495,'upi','Paid via UPI');

-- Sample sale 2 (credit, partially paid)
INSERT INTO public.sales (id, invoice_no, customer_id, customer_name, invoice_date, subtotal, discount_amount, taxable_amount, cgst, sgst, igst, round_off, grand_total, paid_amount, cogs, status)
VALUES ('66666666-6666-4666-8666-000000000002','INV-2026-000002','33333333-3333-4333-8333-000000000003','Green Leaf Cafe', now() - interval '1 day', 4266, 0, 3855.99, 205.01, 205.00, 0, 0.00, 4266, 2000, 2810, 'completed');

INSERT INTO public.sale_items (sale_id, product_id, product_name, hsn_code, quantity, rate, discount, gst_rate, tax_amount, taxable_amount, total, cost_price) VALUES
 ('66666666-6666-4666-8666-000000000002','44444444-4444-4444-8444-000000000006','Instant Coffee 100g','2101',6,299,0,18,273.66,1520.34,1794,215),
 ('66666666-6666-4666-8666-000000000002','44444444-4444-4444-8444-000000000005','Assam Tea 500g','0902',5,239,0,5,56.90,1138.10,1195,185),
 ('66666666-6666-4666-8666-000000000002','44444444-4444-4444-8444-000000000007','Orange Juice 1L','2009',8,109,0,12,93.39,778.61,872,78),
 ('66666666-6666-4666-8666-000000000002','44444444-4444-4444-8444-000000000011','Floor Cleaner 1L','3402',2,159,0,18,48.51,269.49,318,96),
 ('66666666-6666-4666-8666-000000000002','44444444-4444-4444-8444-000000000012','Garbage Bags 30pcs','3923',1,99,0,18,15.10,83.90,99,58);

INSERT INTO public.inventory_transactions (product_id, txn_type, reference_type, reference_id, reference_no, qty_in, qty_out, unit_cost, txn_date) VALUES
 ('44444444-4444-4444-8444-000000000006','sale','sale','66666666-6666-4666-8666-000000000002','INV-2026-000002',0,6,215, now() - interval '1 day'),
 ('44444444-4444-4444-8444-000000000005','sale','sale','66666666-6666-4666-8666-000000000002','INV-2026-000002',0,5,185, now() - interval '1 day'),
 ('44444444-4444-4444-8444-000000000007','sale','sale','66666666-6666-4666-8666-000000000002','INV-2026-000002',0,8,78, now() - interval '1 day'),
 ('44444444-4444-4444-8444-000000000011','sale','sale','66666666-6666-4666-8666-000000000002','INV-2026-000002',0,2,96, now() - interval '1 day'),
 ('44444444-4444-4444-8444-000000000012','sale','sale','66666666-6666-4666-8666-000000000002','INV-2026-000002',0,1,58, now() - interval '1 day');

INSERT INTO public.customer_payments (customer_id, sale_id, amount, method, remarks)
VALUES ('33333333-3333-4333-8333-000000000003','66666666-6666-4666-8666-000000000002',2000,'bank_transfer','Advance against INV-2026-000002');

UPDATE public.customers SET balance = 2266 WHERE id = '33333333-3333-4333-8333-000000000003';
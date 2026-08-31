# Remix of Stock Keeper Pro Shop

Build an Inventory, Sales & Billing Management System

Build a complete, production-ready Inventory and Billing Management System in Lovable.

The application will be used by a business to manage categories, products, purchases, inventory, customers, suppliers, sales, billing, payments, returns, GST, and reports.

The most important workflow is:

Category → Product → Purchase → Inventory → Sale/Billing → Payment → Reports

The application should be fully functional, not just a visual prototype.

1. Technology Stack

Use:

React

TypeScript

Vite

Tailwind CSS

shadcn/ui

Lucide icons

Supabase for authentication and database initially

Keep the database layer modular so that the application can later be migrated to Microsoft SQL Server if required.

Use proper relational database design with:

Primary keys

Foreign keys

Indexes

Unique constraints

Timestamps

Database transactions where required

Do not hard-code data.

2. Authentication

Create a login system using Supabase authentication.

Users should log in using:

Email

Password

Implement role-based access.

Roles:

Super Admin

Full access.

Admin

Access to products, inventory, purchases, sales, customers, suppliers and reports.

Billing User

Access to customers, sales/billing, payments and invoices.

Inventory User

Access to categories, products, purchases and inventory.

Users should only see modules allowed for their role.

3. Main Navigation

Create a professional left sidebar.

Menu:

Dashboard

Categories

Products

Customers

Suppliers

Purchases

Sales / Billing

Inventory

Payments

Returns

Reports

Users

Settings

Audit Log

Make the sidebar collapsible.

4. Dashboard

Create a modern dashboard with cards showing:

Today's Sales

Today's Purchases

Today's Profit

Total Products

Total Categories

Current Stock Value

Low Stock Products

Out of Stock Products

Customer Outstanding

Supplier Outstanding

Charts:

Sales Chart

Daily/monthly sales.

Purchase Chart

Daily/monthly purchases.

Profit Chart

Daily/monthly profit.

Category Sales

Category-wise sales.

Top Products

Top 10 selling products.

Allow date filters:

Today

Yesterday

This Week

This Month

This Year

Custom Date Range

5. Category Management

Categories are a very important part of this application.

All products must be associated with a category.

Create a Category Master.

Fields:

Category ID

Category Code

Category Name

Parent Category

Description

Status

Created At

Updated At

Support parent/child categories.

Example:

Electronics

Mobile

Laptop

Television

Accessories

Grocery

Rice

Flour

Pulses

Oil

Clothing

Men's

Women's

Kids

Features:

Add Category

Edit Category

View Category

Activate/Deactivate

Search

Filter

Delete

Do not allow deletion of a category if products are assigned to it.

Show the number of products under each category.

6. Product Management

Products should always be entered under a category.

Create Product Master.

Fields:

Product Information

Product ID

SKU

Barcode

Product Name

Category

Subcategory

Brand

Description

Product Image

Status

Pricing

Purchase Price

MRP

Selling Price

Discount

GST Rate

Tax Inclusive / Exclusive

Inventory

Opening Stock

Current Stock

Minimum Stock

Maximum Stock

Reorder Level

Unit

Units:

Piece

Box

Packet

Kg

Gram

Litre

Meter

Dozen

GST

HSN/SAC

GST Rate

CGST

SGST

IGST

Additional

Supplier

Rack

Shelf

Batch Number

Manufacturing Date

Expiry Date

7. Category-Based Product Entry

The product entry interface should be designed around categories.

When adding a product:

Step 1

Select Category.

Step 2

Select Subcategory if applicable.

Step 3

Enter Product Information.

Step 4

Enter Pricing.

Step 5

Enter Inventory Information.

Step 6

Save Product.

After selecting a category, show all products belonging to that category.

Example:

Category: Mobile

ProductSKUPurchase PriceSelling PriceStockSamsung A55SAM-A55₹25,000₹29,99910OnePlus NordOP-NORD₹20,000₹24,9998

Provide:

Search

Sort

Filter

Edit

View

Stock update

Search products by:

Product name

SKU

Barcode

Category

8. Category-Based Billing

The billing screen should also use categories.

Create a fast POS-style billing screen.

At the top show category buttons:

All | Mobile | Laptop | Accessories | Television

When the user clicks a category, display the products in that category.

Example:

Mobile

[Samsung A55] [OnePlus Nord] [Vivo T4] [iPhone]

Clicking a product should add it directly to the bill.

Also support barcode scanning/search.

9. Sales / Billing

Create a POS-style billing interface.

Layout:

Left Side

Category and product selection.

Right Side

Current invoice/cart.

Invoice columns:

ProductQtyRateDiscountGSTAmount

Automatically calculate:

Subtotal

Discount

Taxable Amount

CGST

SGST

IGST

Round Off

Grand Total

Allow:

Increase quantity

Decrease quantity

Remove product

Change quantity

Apply item discount

Apply invoice discount

10. Customer Selection

At the top of billing:

Select Customer

Options:

Walk-in Customer

Existing Customer

Add New Customer

Customer information:

Name

Mobile

GSTIN

Address

11. Payment

Support:

Cash

Card

UPI

Bank Transfer

Credit

Allow split payment.

Example:

Cash ₹500
UPI ₹1,000

Total = ₹1,500

Show:

Amount Received

Amount Paid

Balance

Change

12. Inventory Update After Sale

When a sale is completed:

Current Stock - Sold Quantity = New Stock

Example:

Stock = 30

Sold = 5

New Stock = 25

Do this automatically.

Do not allow sale quantity greater than available stock unless the administrator enables "Allow Negative Stock".

13. Purchase Management

Create Purchase Entry.

Workflow:

Supplier → Purchase Invoice → Category → Product → Quantity → Purchase Price → GST → Total

Fields:

Purchase Number

Supplier

Purchase Date

Due Date

Product

Category

Quantity

Purchase Rate

Discount

GST

Tax Amount

Total

When purchase is saved:

Inventory automatically increases.

Example:

Stock = 20

Purchase = 10

New Stock = 30

14. Inventory Ledger

Do not simply overwrite stock.

Maintain a complete inventory transaction ledger.

Transaction types:

Opening Stock

Purchase

Sale

Sales Return

Purchase Return

Stock Adjustment

Example:

DateTypeReferenceINOUTBalance01-AugOpeningOP-0015005003-AugPurchasePUR-0012007005-AugSaleINV-00101060

Current stock should be traceable from inventory transactions.

15. Stock Adjustment

Create stock adjustment functionality.

Reasons:

Damaged

Lost

Expired

Physical Stock Correction

Other

Record:

Product

Previous Stock

Adjustment Quantity

New Stock

Reason

User

Date/Time

Every adjustment must create an inventory transaction.

16. Customer Management

Create Customer Master.

Fields:

Customer Name

Mobile

Email

GSTIN

Address

City

State

PIN Code

Opening Balance

Credit Limit

Status

Customer profile should show:

Total Purchases

Total Payments

Outstanding

Invoice History

17. Supplier Management

Create Supplier Master.

Fields:

Supplier Name

Company Name

Mobile

Email

GSTIN

Address

City

State

PIN Code

Opening Balance

Credit Limit

Payment Terms

Status

Supplier profile should show:

Total Purchases

Total Payments

Outstanding

Purchase History

18. Invoice

After completing a sale, generate a professional invoice.

Invoice should contain:

Business Logo

Business Name

Business Address

GSTIN

Invoice Number

Invoice Date

Customer

Product

HSN/SAC

Quantity

Rate

Discount

GST

Total

Payment Method

Amount Paid

Balance

Buttons:

Print

Download PDF

Reprint

Share

Invoice numbering:

INV-2026-000001

Make invoice prefix and starting number configurable.

19. Sales Return

Allow users to search an invoice.

Select products and quantity to return.

Rules:

Cannot return more than sold quantity.

Inventory increases after return.

Customer balance is adjusted.

Create return transaction.

Maintain audit trail.

20. Purchase Return

Allow purchase returns against existing purchase invoices.

When purchase return is completed:

Inventory decreases.

Supplier balance adjusts.

Purchase return transaction is created.

21. Payments

Create separate payment management.

Customer Payment

Fields:

Customer

Invoice

Date

Amount

Payment Method

Reference Number

Remarks

Supplier Payment

Fields:

Supplier

Purchase Invoice

Date

Amount

Payment Method

Reference Number

Remarks

Show outstanding balances.

22. GST

Support Indian GST.

Support:

GSTIN

HSN/SAC

CGST

SGST

IGST

GST Rates

Tax Inclusive Pricing

Tax Exclusive Pricing

GST rates:

0%

5%

12%

18%

28%

Store the actual tax rate and tax amount used on each invoice so that historical invoices do not change when the product's current GST rate is changed.

23. Reports

Create a Reports section.

Sales

Daily Sales

Monthly Sales

Date-wise Sales

Category-wise Sales

Product-wise Sales

Customer-wise Sales

Payment Method-wise Sales

Purchases

Daily Purchases

Monthly Purchases

Supplier-wise Purchases

Product-wise Purchases

Category-wise Purchases

Inventory

Current Stock

Stock Valuation

Low Stock

Out of Stock

Stock Movement

Stock Ledger

Category-wise Stock

Profit

Calculate:

Profit = Sales Revenue - Cost of Goods Sold

Reports:

Product-wise Profit

Category-wise Profit

Daily Profit

Monthly Profit

Date-range Profit

Allow:

Excel export

CSV export

PDF export

24. Barcode

Implement barcode support.

Allow:

Product barcode

Barcode search

Barcode scanning during billing

Barcode generation

When barcode is scanned:

Automatically find the product and add it to the current bill.

25. Excel / CSV Import

Create product import functionality.

Allow users to upload Excel/CSV containing:

Category

Subcategory

Product Name

SKU

Barcode

Purchase Price

Selling Price

MRP

GST

Opening Stock

Unit

Before importing:

Validate the file.

Validate categories.

Validate duplicate SKU.

Validate duplicate barcode.

Show errors.

Show preview.

Allow user to confirm import.

26. Settings

Create business settings.

Business

Business Name

Logo

Address

Phone

Email

GSTIN

Website

Invoice

Invoice Prefix

Starting Invoice Number

Invoice Format

Terms & Conditions

Inventory

Allow Negative Stock

Low Stock Threshold

Default Unit

Financial

Financial Year

Currency

Default GST

27. Audit Log

Record important changes.

Log:

User

Module

Action

Record ID

Old Value

New Value

Date/Time

Examples:

Product Created

Product Updated

Price Changed

Purchase Created

Invoice Created

Invoice Cancelled

Stock Adjusted

Customer Updated

28. Database Tables

Create a proper relational database.

Tables:

profiles

roles

categories

products

customers

suppliers

purchases

purchase_items

sales

sale_items

payments

customer_payments

supplier_payments

inventory_transactions

stock_adjustments

sales_returns

sales_return_items

purchase_returns

purchase_return_items

tax_rates

business_settings

audit_logs

Use foreign keys and indexes.

Use database-level security policies.

29. Important Database / Transaction Rules

For a completed sale, use a database transaction so that:

Sale is created.

Sale items are created.

Inventory is reduced.

Payment is recorded.

Customer balance is updated.

If any step fails, roll back the complete operation.

Similarly, for purchases:

Purchase is created.

Purchase items are created.

Inventory is increased.

Supplier balance is updated.

Never leave partial transactions.

30. UI Requirements

Use a modern professional interface.

Use:

Responsive layout

Tables

Cards

Tabs

Dialogs

Dropdowns

Search

Filters

Pagination

Date pickers

Toast notifications

Confirmation dialogs

Loading indicators

Empty states

Error handling

Use consistent spacing and typography.

31. POS Screen Requirements

The billing screen is one of the most important screens.

Optimize it for speed.

The cashier should be able to:

Select category.

Select product.

Enter quantity.

Select customer.

Apply discount if permitted.

Select payment method.

Complete sale.

Print/download invoice.

Minimize unnecessary navigation.

Support keyboard-friendly operation where possible.

32. Initial Sample Data

Create realistic sample data for testing.

Categories:

Electronics

Mobile

Laptop

Accessories

Grocery

Clothing

Products:

Samsung A55

OnePlus Nord

iPhone

Dell Laptop

HP Laptop

Wireless Mouse

Keyboard

Rice

Cooking Oil

T-Shirt

Create sample:

Customers

Suppliers

Purchases

Sales

Inventory transactions

This will allow the dashboard and reports to display meaningful data immediately.

33. Development Approach

Build the application in logical stages.

Phase 1

Authentication, database, roles and layout.

Phase 2

Categories and Products.

Phase 3

Customers and Suppliers.

Phase 4

Purchases and Inventory.

Phase 5

Sales/POS Billing.

Phase 6

Payments and Returns.

Phase 7

GST and Invoice.

Phase 8

Reports.

Phase 9

Barcode and Excel/CSV import.

Phase 10

Audit logging, testing and final UI improvements.

Before moving to the next phase, ensure the previous phase is functional.

Do not create mock-only pages.

All buttons, forms, tables and actions should be connected to the database.

34. Most Important Requirement

The application must maintain a single source of truth for inventory.

Every stock movement must be recorded.

Purchase → Stock IN

Sale → Stock OUT

Sales Return → Stock IN

Purchase Return → Stock OUT

Adjustment → Stock IN/OUT

The system must always be able to answer:

How much stock do I have?

When was it purchased?

When was it sold?

Which category does it belong to?

What is the purchase cost?

What is the selling price?

How much profit was generated?

Which customer purchased it?

Which supplier supplied it?

Build the application with this inventory transaction model as the core architecture.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://stock-sale-flow.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f5aa6138-9c58-40f8-84d4-f2c1f346758b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

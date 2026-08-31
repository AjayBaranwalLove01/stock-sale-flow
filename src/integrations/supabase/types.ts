export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          module: string
          new_value: Json | null
          old_value: Json | null
          record_id: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          module: string
          new_value?: Json | null
          old_value?: Json | null
          record_id?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          module?: string
          new_value?: Json | null
          old_value?: Json | null
          record_id?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      business_settings: {
        Row: {
          address: string | null
          allow_negative_stock: boolean
          business_name: string
          created_at: string
          currency: string
          default_gst: number
          default_unit: string
          email: string | null
          financial_year_start: string
          gstin: string | null
          id: string
          invoice_prefix: string
          invoice_start_number: number
          logo_url: string | null
          low_stock_threshold: number
          phone: string | null
          singleton: boolean
          state: string | null
          terms_conditions: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          allow_negative_stock?: boolean
          business_name?: string
          created_at?: string
          currency?: string
          default_gst?: number
          default_unit?: string
          email?: string | null
          financial_year_start?: string
          gstin?: string | null
          id?: string
          invoice_prefix?: string
          invoice_start_number?: number
          logo_url?: string | null
          low_stock_threshold?: number
          phone?: string | null
          singleton?: boolean
          state?: string | null
          terms_conditions?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          allow_negative_stock?: boolean
          business_name?: string
          created_at?: string
          currency?: string
          default_gst?: number
          default_unit?: string
          email?: string | null
          financial_year_start?: string
          gstin?: string | null
          id?: string
          invoice_prefix?: string
          invoice_start_number?: number
          logo_url?: string | null
          low_stock_threshold?: number
          phone?: string | null
          singleton?: boolean
          state?: string | null
          terms_conditions?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      catalog_images: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          image_lg: string
          image_md: string
          image_sm: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          image_lg: string
          image_md: string
          image_sm: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          image_lg?: string
          image_md?: string
          image_sm?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          image_lg: string | null
          image_md: string | null
          image_sm: string | null
          image_url: string | null
          name: string
          parent_id: string | null
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          image_lg?: string | null
          image_md?: string | null
          image_sm?: string | null
          image_url?: string | null
          name: string
          parent_id?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          image_lg?: string | null
          image_md?: string | null
          image_sm?: string | null
          image_url?: string | null
          name?: string
          parent_id?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          payment_date: string
          reference_no: string | null
          remarks: string | null
          sale_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          payment_date?: string
          reference_no?: string | null
          remarks?: string | null
          sale_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          payment_date?: string
          reference_no?: string | null
          remarks?: string | null
          sale_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          balance: number
          city: string | null
          created_at: string
          credit_limit: number
          email: string | null
          gstin: string | null
          id: string
          mobile: string | null
          name: string
          opening_balance: number
          pincode: string | null
          state: string | null
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          balance?: number
          city?: string | null
          created_at?: string
          credit_limit?: number
          email?: string | null
          gstin?: string | null
          id?: string
          mobile?: string | null
          name: string
          opening_balance?: number
          pincode?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          balance?: number
          city?: string | null
          created_at?: string
          credit_limit?: number
          email?: string | null
          gstin?: string | null
          id?: string
          mobile?: string | null
          name?: string
          opening_balance?: number
          pincode?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Relationships: []
      }
      inventory_transactions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          product_id: string
          qty_in: number
          qty_out: number
          reference_id: string | null
          reference_no: string | null
          reference_type: string | null
          txn_date: string
          txn_type: Database["public"]["Enums"]["inv_txn_type"]
          unit_cost: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id: string
          qty_in?: number
          qty_out?: number
          reference_id?: string | null
          reference_no?: string | null
          reference_type?: string | null
          txn_date?: string
          txn_type: Database["public"]["Enums"]["inv_txn_type"]
          unit_cost?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          qty_in?: number
          qty_out?: number
          reference_id?: string | null
          reference_no?: string | null
          reference_type?: string | null
          txn_date?: string
          txn_type?: Database["public"]["Enums"]["inv_txn_type"]
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          batch_number: string | null
          brand: string | null
          category_id: string
          created_at: string
          current_stock: number
          description: string | null
          discount: number
          expiry_date: string | null
          gst_rate: number
          hsn_code: string | null
          id: string
          image_lg: string | null
          image_md: string | null
          image_sm: string | null
          image_url: string | null
          manufacturing_date: string | null
          max_stock: number
          min_stock: number
          mrp: number
          name: string
          opening_stock: number
          purchase_price: number
          rack: string | null
          reorder_level: number
          selling_price: number
          shelf: string | null
          sku: string
          status: Database["public"]["Enums"]["record_status"]
          supplier_id: string | null
          tax_inclusive: boolean
          unit: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          batch_number?: string | null
          brand?: string | null
          category_id: string
          created_at?: string
          current_stock?: number
          description?: string | null
          discount?: number
          expiry_date?: string | null
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          image_lg?: string | null
          image_md?: string | null
          image_sm?: string | null
          image_url?: string | null
          manufacturing_date?: string | null
          max_stock?: number
          min_stock?: number
          mrp?: number
          name: string
          opening_stock?: number
          purchase_price?: number
          rack?: string | null
          reorder_level?: number
          selling_price?: number
          shelf?: string | null
          sku: string
          status?: Database["public"]["Enums"]["record_status"]
          supplier_id?: string | null
          tax_inclusive?: boolean
          unit?: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          batch_number?: string | null
          brand?: string | null
          category_id?: string
          created_at?: string
          current_stock?: number
          description?: string | null
          discount?: number
          expiry_date?: string | null
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          image_lg?: string | null
          image_md?: string | null
          image_sm?: string | null
          image_url?: string | null
          manufacturing_date?: string | null
          max_stock?: number
          min_stock?: number
          mrp?: number
          name?: string
          opening_stock?: number
          purchase_price?: number
          rack?: string | null
          reorder_level?: number
          selling_price?: number
          shelf?: string | null
          sku?: string
          status?: Database["public"]["Enums"]["record_status"]
          supplier_id?: string | null
          tax_inclusive?: boolean
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          phone?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Relationships: []
      }
      purchase_items: {
        Row: {
          created_at: string
          discount: number
          gst_rate: number
          id: string
          product_id: string
          purchase_id: string
          quantity: number
          rate: number
          returned_qty: number
          tax_amount: number
          total: number
        }
        Insert: {
          created_at?: string
          discount?: number
          gst_rate?: number
          id?: string
          product_id: string
          purchase_id: string
          quantity: number
          rate: number
          returned_qty?: number
          tax_amount?: number
          total?: number
        }
        Update: {
          created_at?: string
          discount?: number
          gst_rate?: number
          id?: string
          product_id?: string
          purchase_id?: string
          quantity?: number
          rate?: number
          returned_qty?: number
          tax_amount?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_return_items: {
        Row: {
          amount: number
          id: string
          product_id: string
          purchase_item_id: string
          quantity: number
          rate: number
          return_id: string
        }
        Insert: {
          amount?: number
          id?: string
          product_id: string
          purchase_item_id: string
          quantity: number
          rate: number
          return_id: string
        }
        Update: {
          amount?: number
          id?: string
          product_id?: string
          purchase_item_id?: string
          quantity?: number
          rate?: number
          return_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_purchase_item_id_fkey"
            columns: ["purchase_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "purchase_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_returns: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          purchase_id: string
          reason: string | null
          return_date: string
          return_no: string
          supplier_id: string | null
          total_amount: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          purchase_id: string
          reason?: string | null
          return_date?: string
          return_no: string
          supplier_id?: string | null
          total_amount?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          purchase_id?: string
          reason?: string | null
          return_date?: string
          return_no?: string
          supplier_id?: string | null
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_returns_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          created_at: string
          created_by: string | null
          discount_amount: number
          due_date: string | null
          grand_total: number
          id: string
          notes: string | null
          paid_amount: number
          purchase_date: string
          purchase_no: string
          round_off: number
          subtotal: number
          supplier_id: string
          tax_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          due_date?: string | null
          grand_total?: number
          id?: string
          notes?: string | null
          paid_amount?: number
          purchase_date?: string
          purchase_no: string
          round_off?: number
          subtotal?: number
          supplier_id: string
          tax_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          due_date?: string | null
          grand_total?: number
          id?: string
          notes?: string | null
          paid_amount?: number
          purchase_date?: string
          purchase_no?: string
          round_off?: number
          subtotal?: number
          supplier_id?: string
          tax_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          cost_price: number
          created_at: string
          discount: number
          gst_rate: number
          hsn_code: string | null
          id: string
          product_id: string
          product_name: string
          quantity: number
          rate: number
          returned_qty: number
          sale_id: string
          tax_amount: number
          taxable_amount: number
          total: number
        }
        Insert: {
          cost_price?: number
          created_at?: string
          discount?: number
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          product_id: string
          product_name: string
          quantity: number
          rate: number
          returned_qty?: number
          sale_id: string
          tax_amount?: number
          taxable_amount?: number
          total?: number
        }
        Update: {
          cost_price?: number
          created_at?: string
          discount?: number
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          product_id?: string
          product_name?: string
          quantity?: number
          rate?: number
          returned_qty?: number
          sale_id?: string
          tax_amount?: number
          taxable_amount?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          cgst: number
          cogs: number
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string
          discount_amount: number
          grand_total: number
          id: string
          igst: number
          invoice_date: string
          invoice_no: string
          notes: string | null
          paid_amount: number
          round_off: number
          sgst: number
          status: string
          subtotal: number
          taxable_amount: number
          updated_at: string
        }
        Insert: {
          cgst?: number
          cogs?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string
          discount_amount?: number
          grand_total?: number
          id?: string
          igst?: number
          invoice_date?: string
          invoice_no: string
          notes?: string | null
          paid_amount?: number
          round_off?: number
          sgst?: number
          status?: string
          subtotal?: number
          taxable_amount?: number
          updated_at?: string
        }
        Update: {
          cgst?: number
          cogs?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string
          discount_amount?: number
          grand_total?: number
          id?: string
          igst?: number
          invoice_date?: string
          invoice_no?: string
          notes?: string | null
          paid_amount?: number
          round_off?: number
          sgst?: number
          status?: string
          subtotal?: number
          taxable_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_return_items: {
        Row: {
          amount: number
          id: string
          product_id: string
          quantity: number
          rate: number
          return_id: string
          sale_item_id: string
        }
        Insert: {
          amount?: number
          id?: string
          product_id: string
          quantity: number
          rate: number
          return_id: string
          sale_item_id: string
        }
        Update: {
          amount?: number
          id?: string
          product_id?: string
          quantity?: number
          rate?: number
          return_id?: string
          sale_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "sales_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_returns: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          reason: string | null
          return_date: string
          return_no: string
          sale_id: string
          total_amount: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          reason?: string | null
          return_date?: string
          return_no: string
          sale_id: string
          total_amount?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          reason?: string | null
          return_date?: string
          return_no?: string
          sale_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustments: {
        Row: {
          adjustment_qty: number
          created_at: string
          created_by: string | null
          id: string
          new_stock: number
          notes: string | null
          previous_stock: number
          product_id: string
          reason: string
        }
        Insert: {
          adjustment_qty: number
          created_at?: string
          created_by?: string | null
          id?: string
          new_stock?: number
          notes?: string | null
          previous_stock?: number
          product_id: string
          reason: string
        }
        Update: {
          adjustment_qty?: number
          created_at?: string
          created_by?: string | null
          id?: string
          new_stock?: number
          notes?: string | null
          previous_stock?: number
          product_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          payment_date: string
          purchase_id: string | null
          reference_no: string | null
          remarks: string | null
          supplier_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          payment_date?: string
          purchase_id?: string | null
          reference_no?: string | null
          remarks?: string | null
          supplier_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          payment_date?: string
          purchase_id?: string | null
          reference_no?: string | null
          remarks?: string | null
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          balance: number
          city: string | null
          company_name: string | null
          created_at: string
          credit_limit: number
          email: string | null
          gstin: string | null
          id: string
          mobile: string | null
          name: string
          opening_balance: number
          payment_terms: string | null
          pincode: string | null
          state: string | null
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          balance?: number
          city?: string | null
          company_name?: string | null
          created_at?: string
          credit_limit?: number
          email?: string | null
          gstin?: string | null
          id?: string
          mobile?: string | null
          name: string
          opening_balance?: number
          payment_terms?: string | null
          pincode?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          balance?: number
          city?: string | null
          company_name?: string | null
          created_at?: string
          credit_limit?: number
          email?: string | null
          gstin?: string | null
          id?: string
          mobile?: string | null
          name?: string
          opening_balance?: number
          payment_terms?: string | null
          pincode?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_stock: {
        Args: {
          p_notes?: string
          p_product_id: string
          p_qty: number
          p_reason: string
        }
        Returns: string
      }
      create_purchase: {
        Args: {
          p_due_date: string
          p_items: Json
          p_notes?: string
          p_paid_amount: number
          p_purchase_date: string
          p_supplier_id: string
        }
        Returns: string
      }
      create_purchase_return: {
        Args: { p_items: Json; p_purchase_id: string; p_reason: string }
        Returns: string
      }
      create_sale: {
        Args: {
          p_customer_id: string
          p_customer_name: string
          p_invoice_discount: number
          p_items: Json
          p_notes?: string
          p_payments: Json
        }
        Returns: string
      }
      create_sales_return: {
        Args: { p_items: Json; p_reason: string; p_sale_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "billing_user" | "inventory_user"
      inv_txn_type:
        | "opening"
        | "purchase"
        | "sale"
        | "sales_return"
        | "purchase_return"
        | "adjustment"
      payment_method: "cash" | "card" | "upi" | "bank_transfer" | "credit"
      record_status: "active" | "inactive"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "admin", "billing_user", "inventory_user"],
      inv_txn_type: [
        "opening",
        "purchase",
        "sale",
        "sales_return",
        "purchase_return",
        "adjustment",
      ],
      payment_method: ["cash", "card", "upi", "bank_transfer", "credit"],
      record_status: ["active", "inactive"],
    },
  },
} as const

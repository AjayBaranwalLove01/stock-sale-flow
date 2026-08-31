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
          business_id: string | null
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
          business_id?: string | null
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
          business_id?: string | null
          created_at?: string
          id?: string
          module?: string
          new_value?: Json | null
          old_value?: Json | null
          record_id?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_features: {
        Row: {
          business_id: string
          created_at: string
          enabled: boolean
          feature_key: string
          id: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          enabled?: boolean
          feature_key: string
          id?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          enabled?: boolean
          feature_key?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_features_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_features_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_features_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["key"]
          },
        ]
      }
      business_settings: {
        Row: {
          address: string | null
          allow_negative_stock: boolean
          business_id: string
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
          business_id: string
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
          business_id?: string
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
        Relationships: [
          {
            foreignKeyName: "business_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          address: string | null
          business_type: string | null
          city: string | null
          code: string
          country: string
          created_at: string
          created_by: string | null
          customer_site_enabled: boolean
          email: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          pincode: string | null
          state: string | null
          status: string
          subdomain: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          business_type?: string | null
          city?: string | null
          code: string
          country?: string
          created_at?: string
          created_by?: string | null
          customer_site_enabled?: boolean
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          pincode?: string | null
          state?: string | null
          status?: string
          subdomain: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          business_type?: string | null
          city?: string | null
          code?: string
          country?: string
          created_at?: string
          created_by?: string | null
          customer_site_enabled?: boolean
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          pincode?: string | null
          state?: string | null
          status?: string
          subdomain?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      catalog_images: {
        Row: {
          business_id: string | null
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
          business_id?: string | null
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
          business_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "catalog_images_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_images_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          business_id: string
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
          business_id?: string
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
          business_id?: string
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
            foreignKeyName: "categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "storefront_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_payments: {
        Row: {
          amount: number
          business_id: string | null
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
          business_id?: string | null
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
          business_id?: string | null
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
            foreignKeyName: "customer_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
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
          auth_user_id: string | null
          balance: number
          business_id: string
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
          source: string
          state: string | null
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          auth_user_id?: string | null
          balance?: number
          business_id?: string
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
          source?: string
          state?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          auth_user_id?: string | null
          balance?: number
          business_id?: string
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
          source?: string
          state?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      features: {
        Row: {
          category: string
          created_at: string
          depends_on: string | null
          description: string | null
          enabled_globally: boolean
          key: string
          name: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          depends_on?: string | null
          description?: string | null
          enabled_globally?: boolean
          key: string
          name: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          depends_on?: string | null
          description?: string | null
          enabled_globally?: boolean
          key?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "features_depends_on_fkey"
            columns: ["depends_on"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["key"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          business_id: string
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
          business_id?: string
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
          business_id?: string
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
            foreignKeyName: "inventory_transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "storefront_products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          business_id: string
          created_at: string
          gst_rate: number
          id: string
          order_id: string
          product_id: string
          product_name: string
          quantity: number
          rate: number
          tax_amount: number
          total: number
        }
        Insert: {
          business_id: string
          created_at?: string
          gst_rate?: number
          id?: string
          order_id: string
          product_id: string
          product_name: string
          quantity: number
          rate: number
          tax_amount?: number
          total?: number
        }
        Update: {
          business_id?: string
          created_at?: string
          gst_rate?: number
          id?: string
          order_id?: string
          product_id?: string
          product_name?: string
          quantity?: number
          rate?: number
          tax_amount?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "storefront_products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          business_id: string
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          discount_amount: number
          grand_total: number
          id: string
          notes: string | null
          order_no: string
          payment_mode: string
          placed_by: string | null
          shipping_address: string | null
          shipping_city: string | null
          shipping_pincode: string | null
          shipping_state: string | null
          status: string
          subtotal: number
          tax_amount: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          discount_amount?: number
          grand_total?: number
          id?: string
          notes?: string | null
          order_no: string
          payment_mode?: string
          placed_by?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_pincode?: string | null
          shipping_state?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          discount_amount?: number
          grand_total?: number
          id?: string
          notes?: string | null
          order_no?: string
          payment_mode?: string
          placed_by?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_pincode?: string | null
          shipping_state?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          barcode_type: string | null
          batch_number: string | null
          brand: string | null
          business_id: string
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
          barcode_type?: string | null
          batch_number?: string | null
          brand?: string | null
          business_id?: string
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
          barcode_type?: string | null
          batch_number?: string | null
          brand?: string | null
          business_id?: string
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
            foreignKeyName: "products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "storefront_categories"
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
          account_type: string
          active_business_id: string | null
          business_id: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
        }
        Insert: {
          account_type?: string
          active_business_id?: string | null
          business_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          phone?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Update: {
          account_type?: string
          active_business_id?: string | null
          business_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_business_id_fkey"
            columns: ["active_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_active_business_id_fkey"
            columns: ["active_business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          banner_url: string | null
          business_id: string
          category_id: string | null
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          ends_at: string | null
          id: string
          is_active: boolean
          product_id: string | null
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          business_id?: string
          category_id?: string | null
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          product_id?: string | null
          starts_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          business_id?: string
          category_id?: string | null
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          product_id?: string | null
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "storefront_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "storefront_products"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          business_id: string
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
          business_id?: string
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
          business_id?: string
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
            foreignKeyName: "purchase_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "storefront_products"
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
          business_id: string | null
          id: string
          product_id: string
          purchase_item_id: string
          quantity: number
          rate: number
          return_id: string
        }
        Insert: {
          amount?: number
          business_id?: string | null
          id?: string
          product_id: string
          purchase_item_id: string
          quantity: number
          rate: number
          return_id: string
        }
        Update: {
          amount?: number
          business_id?: string | null
          id?: string
          product_id?: string
          purchase_item_id?: string
          quantity?: number
          rate?: number
          return_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_return_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "storefront_products"
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
          business_id: string | null
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
          business_id?: string | null
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
          business_id?: string | null
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
            foreignKeyName: "purchase_returns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
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
          business_id: string
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
          business_id?: string
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
          business_id?: string
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
            foreignKeyName: "purchases_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
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
          business_id: string
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
          business_id?: string
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
          business_id?: string
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
            foreignKeyName: "sale_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "storefront_products"
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
          business_id: string
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
          business_id?: string
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
          business_id?: string
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
            foreignKeyName: "sales_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
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
          business_id: string | null
          id: string
          product_id: string
          quantity: number
          rate: number
          return_id: string
          sale_item_id: string
        }
        Insert: {
          amount?: number
          business_id?: string | null
          id?: string
          product_id: string
          quantity: number
          rate: number
          return_id: string
          sale_item_id: string
        }
        Update: {
          amount?: number
          business_id?: string | null
          id?: string
          product_id?: string
          quantity?: number
          rate?: number
          return_id?: string
          sale_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_return_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "storefront_products"
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
          business_id: string | null
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
          business_id?: string | null
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
          business_id?: string | null
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
            foreignKeyName: "sales_returns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
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
          business_id: string | null
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
          business_id?: string | null
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
          business_id?: string | null
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
            foreignKeyName: "stock_adjustments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "storefront_products"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payments: {
        Row: {
          amount: number
          business_id: string | null
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
          business_id?: string | null
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
          business_id?: string | null
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
            foreignKeyName: "supplier_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
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
          business_id: string
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
          business_id?: string
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
          business_id?: string
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
        Relationships: [
          {
            foreignKeyName: "suppliers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          business_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      storefront_businesses: {
        Row: {
          business_type: string | null
          city: string | null
          code: string | null
          country: string | null
          email: string | null
          id: string | null
          logo_url: string | null
          name: string | null
          phone: string | null
          state: string | null
          subdomain: string | null
          website: string | null
        }
        Insert: {
          business_type?: string | null
          city?: string | null
          code?: string | null
          country?: string | null
          email?: string | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
          phone?: string | null
          state?: string | null
          subdomain?: string | null
          website?: string | null
        }
        Update: {
          business_type?: string | null
          city?: string | null
          code?: string | null
          country?: string | null
          email?: string | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
          phone?: string | null
          state?: string | null
          subdomain?: string | null
          website?: string | null
        }
        Relationships: []
      }
      storefront_categories: {
        Row: {
          business_id: string | null
          code: string | null
          description: string | null
          id: string | null
          image_lg: string | null
          image_md: string | null
          image_sm: string | null
          name: string | null
          parent_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "storefront_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_products: {
        Row: {
          brand: string | null
          business_id: string | null
          category_id: string | null
          description: string | null
          discount: number | null
          gst_rate: number | null
          id: string | null
          image_lg: string | null
          image_md: string | null
          image_sm: string | null
          in_stock: boolean | null
          mrp: number | null
          name: string | null
          selling_price: number | null
          sku: string | null
          tax_inclusive: boolean | null
          unit: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "storefront_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_promotions: {
        Row: {
          banner_url: string | null
          business_id: string | null
          category_id: string | null
          description: string | null
          discount_type: string | null
          discount_value: number | null
          ends_at: string | null
          id: string | null
          product_id: string | null
          starts_at: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "storefront_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "storefront_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "storefront_products"
            referencedColumns: ["id"]
          },
        ]
      }
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
      can_access_business: { Args: { _business_id: string }; Returns: boolean }
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
      current_business_id: { Args: never; Returns: string }
      generate_internal_barcode: {
        Args: { p_product_id?: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_feature_enabled: {
        Args: { _business_id: string; _key: string }
        Returns: boolean
      }
      is_staff: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      lookup_product_by_barcode: {
        Args: { p_barcode: string }
        Returns: {
          barcode: string
          barcode_type: string
          category_id: string
          current_stock: number
          gst_rate: number
          id: string
          mrp: number
          name: string
          purchase_price: number
          selling_price: number
          sku: string
          status: Database["public"]["Enums"]["record_status"]
          tax_inclusive: boolean
          unit: string
        }[]
      }
      place_order: {
        Args: {
          p_address: string
          p_business_id: string
          p_city: string
          p_email: string
          p_items: Json
          p_name: string
          p_notes?: string
          p_phone: string
          p_pincode: string
          p_state: string
        }
        Returns: string
      }
      receive_stock_by_barcode: {
        Args: { p_items: Json; p_notes?: string }
        Returns: number
      }
      set_order_status: {
        Args: { p_order_id: string; p_status: string }
        Returns: undefined
      }
      storefront_product_by_barcode: {
        Args: { p_barcode: string; p_business_id: string }
        Returns: {
          id: string
          in_stock: boolean
          mrp: number
          name: string
          selling_price: number
          sku: string
          unit: string
        }[]
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

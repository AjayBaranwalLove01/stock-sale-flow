import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StoreBusiness = {
  id: string;
  name: string;
  code: string;
  subdomain: string;
  logo_url: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  business_type: string | null;
};

export type StoreProduct = {
  id: string;
  business_id: string;
  name: string;
  sku: string;
  brand: string | null;
  description: string | null;
  category_id: string;
  selling_price: number;
  mrp: number;
  discount: number;
  gst_rate: number;
  unit: string;
  image_sm: string | null;
  image_md: string | null;
  image_lg: string | null;
  in_stock: boolean;
};

export type StoreCategory = {
  id: string;
  business_id: string;
  name: string;
  code: string;
  parent_id: string | null;
  description: string | null;
  image_md: string | null;
};

export type StorePromotion = {
  id: string;
  title: string;
  description: string | null;
  banner_url: string | null;
  discount_type: "percent" | "flat" | "none";
  discount_value: number;
  category_id: string | null;
  product_id: string | null;
};

/** Resolve the storefront tenant from the URL slug (subdomain or business code). */
export function useStoreBusiness(slug: string) {
  return useQuery({
    queryKey: ["store-business", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("storefront_businesses")
        .select("*")
        .or(`subdomain.eq.${slug.toLowerCase()},code.eq.${slug.toUpperCase()}`)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as StoreBusiness | null;
    },
  });
}

export function useStoreProducts(businessId: string | undefined) {
  return useQuery({
    queryKey: ["store-products", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("storefront_products")
        .select("*")
        .eq("business_id", businessId!)
        .order("name");
      if (error) throw error;
      return data as unknown as StoreProduct[];
    },
  });
}

export function useStoreCategories(businessId: string | undefined) {
  return useQuery({
    queryKey: ["store-categories", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("storefront_categories")
        .select("*")
        .eq("business_id", businessId!)
        .order("name");
      if (error) throw error;
      return data as unknown as StoreCategory[];
    },
  });
}

/** Extra product↔category mappings, so a product can show under many categories. */
export function useStoreProductCategories(businessId: string | undefined) {
  return useQuery({
    queryKey: ["store-product-categories", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_categories")
        .select("product_id,category_id")
        .eq("business_id", businessId!);
      if (error) throw error;
      return data as { product_id: string; category_id: string }[];
    },
  });
}


export function useStorePromotions(businessId: string | undefined) {
  return useQuery({
    queryKey: ["store-promotions", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("storefront_promotions")
        .select("*")
        .eq("business_id", businessId!);
      if (error) throw error;
      return data as unknown as StorePromotion[];
    },
  });
}

export type CartLine = {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  image_md?: string | null;
};

const key = (slug: string) => `cart:${slug}`;

/** Guest-friendly cart kept in the browser, scoped per storefront. */
export function useCart(slug: string) {
  const [lines, setLines] = useState<CartLine[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key(slug));
      setLines(raw ? (JSON.parse(raw) as CartLine[]) : []);
    } catch {
      setLines([]);
    }
  }, [slug]);

  const persist = useCallback(
    (next: CartLine[]) => {
      setLines(next);
      localStorage.setItem(key(slug), JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("cart-changed"));
    },
    [slug],
  );

  useEffect(() => {
    const handler = () => {
      const raw = localStorage.getItem(key(slug));
      setLines(raw ? (JSON.parse(raw) as CartLine[]) : []);
    };
    window.addEventListener("cart-changed", handler);
    return () => window.removeEventListener("cart-changed", handler);
  }, [slug]);

  const add = (line: Omit<CartLine, "quantity">, qty = 1) => {
    const existing = lines.find((l) => l.product_id === line.product_id);
    persist(
      existing
        ? lines.map((l) =>
            l.product_id === line.product_id ? { ...l, quantity: l.quantity + qty } : l,
          )
        : [...lines, { ...line, quantity: qty }],
    );
  };

  const setQty = (productId: string, qty: number) =>
    persist(
      qty <= 0
        ? lines.filter((l) => l.product_id !== productId)
        : lines.map((l) => (l.product_id === productId ? { ...l, quantity: qty } : l)),
    );

  const clear = () => persist([]);

  const total = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const count = lines.reduce((s, l) => s + l.quantity, 0);

  return { lines, add, setQty, clear, total, count };
}

import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, LockKeyhole } from "lucide-react";
import { z } from "zod";
import { inr } from "@/lib/format";
import { useCart, useStoreBusiness } from "@/lib/storefront";
import { useAuth } from "@/hooks/useAuth";
import { StoreImage } from "@/components/StoreImage";

export const Route = createFileRoute("/shop/$code/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — Stock Keeper Storefront" },
      { name: "description", content: "Sign in, confirm your delivery details and place your order." },
      { property: "og:title", content: "Checkout — Stock Keeper Storefront" },
      { property: "og:description", content: "Sign in, confirm your delivery details and place your order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CheckoutPage,
});

const credentials = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
});

function CheckoutPage() {
  const { code } = useParams({ from: "/shop/$code" });
  const navigate = useNavigate();
  const { data: business } = useStoreBusiness(code);
  const cart = useCart(code);
  const { user, loading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [payMode, setPayMode] = useState<"cod" | "credit">("cod");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
  });

  useEffect(() => {
    if (user?.email) setEmail(user.email);
  }, [user]);

  const { data: myCredit } = useQuery({
    queryKey: ["my-credit", business?.id, user?.id],
    enabled: !!business?.id && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("credit_allowed, credit_limit, credit_terms_days")
        .eq("business_id", business!.id)
        .eq("auth_user_id", user!.id)
        .maybeSingle();
      return data as
        | { credit_allowed: boolean; credit_limit: number; credit_terms_days: number }
        | null;
    },
  });
  const creditAvailable = !!myCredit?.credit_allowed;

  async function authenticate(mode: "signin" | "signup") {
    const parsed = credentials.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]!.message);
      return;
    }
    if (!business) return;
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword(parsed.data);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          ...parsed.data,
          options: {
            emailRedirectTo: window.location.href,
            data: {
              full_name: form.name || "Customer",
              account_type: "customer",
              business_id: business.id,
            },
          },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Check your email to confirm your account, then come back to order");
          return;
        }
      }
      toast.success("Signed in");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  const place = useMutation({
    mutationFn: async () => {
      if (!business) throw new Error("Store unavailable");
      if (cart.lines.length === 0) throw new Error("Your cart is empty");
      const args = {
        p_business_id: business.id,
        p_items: cart.lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
        p_name: form.name || "Customer",
        p_email: email,
        p_phone: form.phone,
        p_address: form.address,
        p_city: form.city,
        p_state: form.state,
        p_pincode: form.pincode,
      };
      const { data, error } =
        payMode === "credit" && creditAvailable
          ? await supabase.rpc("place_credit_order", args)
          : await supabase.rpc("place_order", args);
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      cart.clear();
      toast.success(
        payMode === "credit" && creditAvailable
          ? "Order placed on credit — pay by the due date"
          : "Order placed — thank you!",
      );
      void navigate({ to: "/shop/$code/orders", params: { code } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not place the order"),
  });

  if (loading) return <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>;

  if (cart.lines.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-muted-foreground">Your cart is empty.</p>
        <Button asChild className="mt-4">
          <Link to="/shop/$code" params={{ code }}>
            Browse products
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-[1.4fr_1fr]">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>

        {!user ? (
          <Card className="p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-medium">
              <LockKeyhole className="size-4" />
              Sign in to complete your order
            </p>
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="space-y-3 pt-4">
                <Field label="Email" value={email} onChange={setEmail} type="email" />
                <Field label="Password" value={password} onChange={setPassword} type="password" />
                <Button className="w-full" disabled={busy} onClick={() => void authenticate("signin")}>
                  {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Sign in
                </Button>
              </TabsContent>
              <TabsContent value="signup" className="space-y-3 pt-4">
                <Field
                  label="Full name"
                  value={form.name}
                  onChange={(v) => setForm({ ...form, name: v })}
                />
                <Field label="Email" value={email} onChange={setEmail} type="email" />
                <Field label="Password" value={password} onChange={setPassword} type="password" />
                <Button className="w-full" disabled={busy} onClick={() => void authenticate("signup")}>
                  {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Create account
                </Button>
              </TabsContent>
            </Tabs>
          </Card>
        ) : (
          <Card className="space-y-3 p-4">
            <p className="text-sm font-medium">Delivery details</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
              <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
              <div className="sm:col-span-2">
                <Field
                  label="Address"
                  value={form.address}
                  onChange={(v) => setForm({ ...form, address: v })}
                />
              </div>
              <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
              <Field label="State" value={form.state} onChange={(v) => setForm({ ...form, state: v })} />
              <Field
                label="PIN code"
                value={form.pincode}
                onChange={(v) => setForm({ ...form, pincode: v })}
              />
            </div>
            {creditAvailable ? (
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">Payment</p>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    className="mt-1"
                    checked={payMode === "cod"}
                    onChange={() => setPayMode("cod")}
                  />
                  <span>Cash on delivery</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    className="mt-1"
                    checked={payMode === "credit"}
                    onChange={() => setPayMode("credit")}
                  />
                  <span>
                    Buy on credit (Udhar)
                    <span className="block text-xs text-muted-foreground">
                      Payable within {myCredit?.credit_terms_days ?? 15} days
                      {Number(myCredit?.credit_limit ?? 0) > 0
                        ? ` · credit limit ${inr(Number(myCredit?.credit_limit))}`
                        : ""}
                    </span>
                  </span>
                </label>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Payment: cash on delivery.</p>
            )}
            <Button className="w-full" disabled={place.isPending} onClick={() => place.mutate()}>
              {place.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Place order
            </Button>
          </Card>
        )}
      </div>

      <Card className="h-fit space-y-3 p-4">
        <p className="text-sm font-medium">Order summary</p>
        <div className="space-y-2.5 text-sm">
          {cart.lines.map((l) => (
            <div key={l.product_id} className="flex items-center gap-3">
              <span className="size-12 shrink-0 overflow-hidden rounded-md border bg-muted">
                <StoreImage path={l.image_md} alt={l.name} iconClass="size-5" />
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {l.name} × {l.quantity}
              </span>
              <span className="tabular">{inr(l.price * l.quantity)}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between border-t pt-3 font-semibold">
          <span>Total</span>
          <span className="tabular">{inr(cart.total)}</span>
        </div>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Warehouse, Loader2 } from "lucide-react";
import { z } from "zod";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Ledger ERP" },
      { name: "description", content: "Sign in to manage inventory, billing and reports." },
      { property: "og:title", content: "Sign in — Ledger ERP" },
      {
        property: "og:description",
        content: "Sign in to manage inventory, billing and reports.",
      },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function handle(mode: "signin" | "signup") {
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]!.message);
      return;
    }
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword(parsed.data);
        if (error) throw error;
        toast.success("Welcome back");
        navigate({ to: "/dashboard", replace: true });
      } else {
        const { data, error } = await supabase.auth.signUp({
          ...parsed.data,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Account created");
          navigate({ to: "/dashboard", replace: true });
        } else {
          toast.success("Check your email to confirm your account");
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function forgotPassword() {
    const parsed = schema.shape.email.safeParse(email);
    if (!parsed.success) {
      toast.error("Enter your email address first");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Password reset link sent — check your email");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send reset email");
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setLoading(false);
      toast.error("Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard", replace: true });
  }


  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Warehouse className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Ledger ERP</h1>
          <p className="text-sm text-muted-foreground">
            Inventory, sales, GST billing and reporting
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Account access</CardTitle>
            <CardDescription>
              The first account created becomes the Super Admin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="space-y-3 pt-4">
                <Field id="si-email" label="Email" type="email" value={email} onChange={setEmail} />
                <Field
                  id="si-pass"
                  label="Password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                />
                <Button
                  className="w-full"
                  disabled={loading}
                  onClick={() => void handle("signin")}
                >
                  {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Sign in
                </Button>
                <button
                  type="button"
                  className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
                  disabled={loading}
                  onClick={() => void forgotPassword()}
                >
                  Forgot password?
                </button>

              </TabsContent>

              <TabsContent value="signup" className="space-y-3 pt-4">
                <Field id="su-name" label="Full name" value={fullName} onChange={setFullName} />
                <Field id="su-email" label="Email" type="email" value={email} onChange={setEmail} />
                <Field
                  id="su-pass"
                  label="Password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                />
                <Button
                  className="w-full"
                  disabled={loading}
                  onClick={() => void handle("signup")}
                >
                  {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Create account
                </Button>
              </TabsContent>
            </Tabs>

            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <Button variant="outline" className="w-full" disabled={loading} onClick={() => void google()}>
              Continue with Google
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  type = "text",
  value,
  onChange,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

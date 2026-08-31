import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, LoadingRows, EmptyState, StatCard } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useServerFn } from "@tanstack/react-start";
import { createStaffUser } from "@/lib/tenant.functions";
import { toast } from "sonner";
import { UserCog, ShieldCheck, UserPlus } from "lucide-react";
import { dateFmt } from "@/lib/format";
import { ROLE_LABELS, useAuth, type AppRole } from "@/hooks/useAuth";
import { logAudit } from "@/lib/queries";


export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "Users & Roles — Ledger ERP" },
      { name: "description", content: "Manage team members and role-based module access." },
      { property: "og:title", content: "Users & Roles — Ledger ERP" },
      { property: "og:description", content: "Manage team members and role-based module access." },
    ],
  }),
  component: UsersPage,
});

const ALL_ROLES: AppRole[] = ["super_admin", "admin", "billing_user", "inventory_user"];

type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: "active" | "inactive";
  created_at: string;
};

type InviteRole = "admin" | "billing_user" | "inventory_user";
const emptyInvite = { full_name: "", email: "", password: "", role: "billing_user" as InviteRole };

function UsersPage() {
  const qc = useQueryClient();
  const { roles: myRoles, user } = useAuth();
  const isSuperAdmin = myRoles.includes("super_admin");
  const [invite, setInvite] = useState<typeof emptyInvite | null>(null);
  const addUserFn = useServerFn(createStaffUser);

  const addUser = useMutation({
    mutationFn: async () => {
      if (!invite) return;
      await addUserFn({ data: invite });
    },
    onSuccess: async () => {
      toast.success("User created");
      setInvite(null);
      await qc.invalidateQueries({ queryKey: ["profiles-with-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const { data, isLoading } = useQuery({
    queryKey: ["profiles-with-roles"],
    queryFn: async () => {
      const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;
      const map: Record<string, AppRole[]> = {};
      for (const r of roles ?? []) {
        (map[r.user_id] ||= []).push(r.role as AppRole);
      }
      return { profiles: (profiles ?? []) as Profile[], roleMap: map };
    },
  });

  const profiles = data?.profiles ?? [];
  const roleMap = data?.roleMap ?? {};

  const [edit, setEdit] = useState<Profile | null>(null);
  const [selected, setSelected] = useState<AppRole[]>([]);

  const save = useMutation({
    mutationFn: async () => {
      if (!edit) return;
      const current = roleMap[edit.id] ?? [];
      const toAdd = selected.filter((r) => !current.includes(r));
      const toRemove = current.filter((r) => !selected.includes(r));
      if (toRemove.length) {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", edit.id)
          .in("role", toRemove);
        if (error) throw error;
      }
      if (toAdd.length) {
        const { error } = await supabase
          .from("user_roles")
          .insert(toAdd.map((role) => ({ user_id: edit.id, role })));
        if (error) throw error;
      }
      await logAudit("Users", "Roles Updated", edit.id, current, selected);
    },
    onSuccess: () => {
      toast.success("Roles updated");
      setEdit(null);
      void qc.invalidateQueries({ queryKey: ["profiles-with-roles"] });
      void qc.invalidateQueries({ queryKey: ["auth-session"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function sendReset(targetEmail: string | null) {
    if (!targetEmail) return;
    const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success(`Password reset link sent to ${targetEmail}`);
  }

  const toggleStatus = useMutation({

    mutationFn: async (p: Profile) => {
      const next = p.status === "active" ? "inactive" : "active";
      const { error } = await supabase.from("profiles").update({ status: next }).eq("id", p.id);
      if (error) throw error;
      await logAudit("Users", "Status Changed", p.id, p.status, next);
    },
    onSuccess: () => {
      toast.success("Status updated");
      void qc.invalidateQueries({ queryKey: ["profiles-with-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Users & Roles"
        description="Team members of this business, and the modules each of them can use."
        actions={
          <Button className="gap-1.5" onClick={() => setInvite({ ...emptyInvite })}>
            <UserPlus className="size-4" />
            Add user
          </Button>
        }
      />

      <Dialog open={!!invite} onOpenChange={(o) => !o && setInvite(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add a team member</DialogTitle>
          </DialogHeader>
          {invite && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Full name</Label>
                <Input
                  value={invite.full_name}
                  onChange={(e) => setInvite({ ...invite, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={invite.email}
                  onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Temporary password</Label>
                <Input
                  type="password"
                  value={invite.password}
                  onChange={(e) => setInvite({ ...invite, password: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select
                  value={invite.role}
                  onValueChange={(v) => setInvite({ ...invite, role: v as InviteRole })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Business Admin</SelectItem>
                    <SelectItem value="billing_user">Billing User</SelectItem>
                    <SelectItem value="inventory_user">Inventory User</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvite(null)}>
              Cancel
            </Button>
            <Button disabled={addUser.isPending} onClick={() => addUser.mutate()}>
              Create user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Team Members" value={profiles.length} icon={UserCog} />
        <StatCard
          label="Active"
          value={profiles.filter((p) => p.status === "active").length}
          icon={UserCog}
          tone="success"
        />
        <StatCard
          label="Administrators"
          value={Object.values(roleMap).filter((r) => r.includes("admin") || r.includes("super_admin")).length}
          icon={ShieldCheck}
          tone="info"
        />
      </div>

      <Card>
        {isLoading ? (
          <LoadingRows />
        ) : profiles.length === 0 ? (
          <EmptyState title="No users yet" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      {p.full_name}
                      {p.id === user?.id && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          You
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.email ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(roleMap[p.id] ?? []).length ? (
                          (roleMap[p.id] ?? []).map((r) => (
                            <Badge key={r} variant="secondary" className="text-[10px]">
                              {ROLE_LABELS[r]}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            No role
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{dateFmt(p.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "active" ? "secondary" : "outline"}>{p.status}</Badge>
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!isSuperAdmin}
                        onClick={() => {
                          setEdit(p);
                          setSelected(roleMap[p.id] ?? []);
                        }}
                      >
                        Roles
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!isSuperAdmin || !p.email}
                        onClick={() => void sendReset(p.email)}
                      >
                        Reset link
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!isSuperAdmin || p.id === user?.id}
                        onClick={() => toggleStatus.mutate(p)}
                      >
                        {p.status === "active" ? "Disable" : "Enable"}
                      </Button>

                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {!isSuperAdmin && (
        <p className="mt-3 text-sm text-muted-foreground">
          Only Super Admins can change roles or disable accounts.
        </p>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Roles · {edit?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {ALL_ROLES.map((r) => (
              <label key={r} className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  checked={selected.includes(r)}
                  onCheckedChange={(v) =>
                    setSelected((prev) => (v ? [...prev, r] : prev.filter((x) => x !== r)))
                  }
                />
                <div>
                  <Label className="cursor-pointer">{ROLE_LABELS[r]}</Label>
                  <p className="text-xs text-muted-foreground">
                    {r === "super_admin"
                      ? "Full access including users, settings and audit log."
                      : r === "admin"
                        ? "All operational modules and reports."
                        : r === "billing_user"
                          ? "Sales, customers, payments and returns."
                          : "Products, categories, suppliers, purchases and inventory."}
                  </p>
                </div>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save Roles
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

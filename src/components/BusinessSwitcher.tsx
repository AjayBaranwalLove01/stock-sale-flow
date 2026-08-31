import { Building2, Check, ChevronsUpDown, Globe2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveBusiness, useBusinesses, useSwitchBusiness } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

/** Super Admin only: choose which business to work in ("All Businesses" = global view). */
export function BusinessSwitcher() {
  const { isSuperAdmin } = useAuth();
  const { data: businesses } = useBusinesses();
  const { data: active } = useActiveBusiness();
  const switcher = useSwitchBusiness();

  if (!isSuperAdmin) {
    return active ? (
      <span className="hidden items-center gap-1.5 text-sm text-muted-foreground md:flex">
        <Building2 className="size-4" />
        <span className="max-w-[180px] truncate">{active.name}</span>
      </span>
    ) : null;
  }

  function pick(id: string | null) {
    switcher.mutate(id, {
      onSuccess: () => toast.success(id ? "Switched business" : "Viewing all businesses"),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Could not switch"),
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          {active ? <Building2 className="size-4" /> : <Globe2 className="size-4" />}
          <span className="max-w-[160px] truncate">{active?.name ?? "All Businesses"}</span>
          <ChevronsUpDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Working context</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => pick(null)}>
          <Globe2 className="mr-2 size-4" />
          All Businesses
          {!active && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {(businesses ?? []).map((b) => (
          <DropdownMenuItem key={b.id} onClick={() => pick(b.id)}>
            <Building2 className="mr-2 size-4" />
            <span className="truncate">{b.name}</span>
            {active?.id === b.id && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

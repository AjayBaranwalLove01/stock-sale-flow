import { useEffect } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGodown, useMyWarehouses, WAREHOUSE_TYPE_LABELS } from "@/lib/warehouse";

/**
 * Location picker restricted to the active business, the user's permitted
 * locations and active locations only. Renders nothing when the business does
 * not use Godown / Warehouse management.
 */
export function LocationSelector({
  value,
  onChange,
  label = "Location",
  className,
  includeAll = false,
  allLabel = "All Locations",
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  label?: string;
  className?: string;
  includeAll?: boolean;
  allLabel?: string;
}) {
  const { godown } = useGodown();
  const { warehouses, defaultId } = useMyWarehouses();

  useEffect(() => {
    if (!godown) return;
    if (includeAll) return;
    if (!value && defaultId) onChange(defaultId);
  }, [godown, includeAll, value, defaultId, onChange]);

  if (!godown || warehouses.length === 0) return null;

  return (
    <div className={className}>
      {label ? <Label>{label}</Label> : null}
      <Select
        value={value ?? (includeAll ? "__all" : "")}
        onValueChange={(v) => onChange(v === "__all" ? null : v)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select location" />
        </SelectTrigger>
        <SelectContent>
          {includeAll && <SelectItem value="__all">{allLabel}</SelectItem>}
          {warehouses.map((w) => (
            <SelectItem key={w.id} value={w.id}>
              {w.name} · {WAREHOUSE_TYPE_LABELS[w.type] ?? w.type}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

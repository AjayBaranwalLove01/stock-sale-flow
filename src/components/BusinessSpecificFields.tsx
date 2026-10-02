import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  isMedicalBusiness,
  isClothingBusiness,
  isElectronicsBusiness,
  isGroceryBusiness,
  isHardwareBusiness,
  type BusinessTypeFields,
} from "@/lib/businessTypes";
import { Pill, Shirt, Cpu, Apple, Wrench } from "lucide-react";

interface BusinessSpecificFieldsProps {
  businessType?: string | null | undefined;
  activeFormulation: string;
  onActiveFormulationChange: (v: string) => void;
  data: BusinessTypeFields;
  onChange: (data: BusinessTypeFields) => void;
}

export function BusinessSpecificFields({
  businessType,
  activeFormulation,
  onActiveFormulationChange,
  data,
  onChange,
}: BusinessSpecificFieldsProps) {
  const isMed = isMedicalBusiness(businessType);
  const isCloth = isClothingBusiness(businessType);
  const isElec = isElectronicsBusiness(businessType);
  const isGroc = isGroceryBusiness(businessType);
  const isHard = isHardwareBusiness(businessType);

  const update = (patch: Partial<BusinessTypeFields>) => {
    onChange({ ...data, ...patch });
  };

  if (isMed) {
    return (
      <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2 border-b border-primary/10 pb-2">
          <Pill className="size-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Medical / Pharmacy Details</h4>
          <span className="ml-auto text-[11px] text-muted-foreground">Pharmacy Specific</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label className="text-xs font-medium">
              Active Formulation / Chemical Composition <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="e.g. Paracetamol 500 mg, Amoxicillin 500 mg + Clavulanic Acid 125 mg"
              value={activeFormulation}
              onChange={(e) => onActiveFormulationChange(e.target.value)}
              className="bg-background"
            />
            <p className="text-[11px] text-muted-foreground">
              Searchable salt/generic chemical name for substitution and pharmacy lookup.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Drug Schedule</Label>
            <Select
              value={data.drug_schedule || "OTC"}
              onValueChange={(v) => update({ drug_schedule: v })}
            >
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Select schedule" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OTC">OTC (Over the Counter)</SelectItem>
                <SelectItem value="Schedule H">Schedule H (Prescription)</SelectItem>
                <SelectItem value="Schedule H1">Schedule H1 (High Risk)</SelectItem>
                <SelectItem value="Schedule X">Schedule X (Narcotics)</SelectItem>
                <SelectItem value="Schedule G">Schedule G</SelectItem>
                <SelectItem value="Ayurvedic">Ayurvedic / Herbal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Dosage Form</Label>
            <Select
              value={data.dosage_form || "Tablet"}
              onValueChange={(v) => update({ dosage_form: v })}
            >
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Select dosage form" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Tablet">Tablet</SelectItem>
                <SelectItem value="Capsule">Capsule</SelectItem>
                <SelectItem value="Syrup / Liquid">Syrup / Liquid</SelectItem>
                <SelectItem value="Injection">Injection</SelectItem>
                <SelectItem value="Ointment / Cream">Ointment / Cream</SelectItem>
                <SelectItem value="Drops">Drops</SelectItem>
                <SelectItem value="Inhaler / Respule">Inhaler / Respule</SelectItem>
                <SelectItem value="Powder">Powder</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Storage Conditions</Label>
            <Input
              placeholder="e.g. Store below 25°C in dry place, 2°C - 8°C"
              value={data.storage_condition || ""}
              onChange={(e) => update({ storage_condition: e.target.value })}
              className="bg-background"
            />
          </div>

          <div className="flex items-center gap-3 pt-6">
            <Switch
              checked={!!data.prescription_required}
              onCheckedChange={(v) => update({ prescription_required: v })}
            />
            <Label className="text-xs">Doctor's Prescription Required (Rx)</Label>
          </div>
        </div>
      </div>
    );
  }

  if (isCloth) {
    return (
      <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2 border-b border-primary/10 pb-2">
          <Shirt className="size-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Clothing & Apparel Details</h4>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Size</Label>
            <Input
              placeholder="e.g. S, M, L, XL, 32, 34"
              value={data.size || ""}
              onChange={(e) => update({ size: e.target.value })}
              className="bg-background"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Color</Label>
            <Input
              placeholder="e.g. Navy Blue, Crimson, Heather Grey"
              value={data.color || ""}
              onChange={(e) => update({ color: e.target.value })}
              className="bg-background"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Material / Fabric</Label>
            <Input
              placeholder="e.g. 100% Cotton, Denim, Linen, Polyester Blend"
              value={data.material || ""}
              onChange={(e) => update({ material: e.target.value })}
              className="bg-background"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Gender / Fit</Label>
            <Select
              value={data.gender || "Unisex"}
              onValueChange={(v) => update({ gender: v })}
            >
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Men">Men</SelectItem>
                <SelectItem value="Women">Women</SelectItem>
                <SelectItem value="Kids / Boys">Kids / Boys</SelectItem>
                <SelectItem value="Kids / Girls">Kids / Girls</SelectItem>
                <SelectItem value="Unisex">Unisex</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs font-medium">Style / Pattern Code</Label>
            <Input
              placeholder="e.g. Slim Fit, Regular, Striped, Graphic"
              value={data.style_code || ""}
              onChange={(e) => update({ style_code: e.target.value })}
              className="bg-background"
            />
          </div>
        </div>
      </div>
    );
  }

  if (isElec) {
    return (
      <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2 border-b border-primary/10 pb-2">
          <Cpu className="size-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Electronics & Devices Details</h4>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Model Number / Code</Label>
            <Input
              placeholder="e.g. WH-1000XM5, Galaxy-A54"
              value={data.model_number || ""}
              onChange={(e) => update({ model_number: e.target.value })}
              className="bg-background"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Manufacturer / OEM</Label>
            <Input
              placeholder="e.g. Sony, Samsung, Dell, Philips"
              value={data.manufacturer || ""}
              onChange={(e) => update({ manufacturer: e.target.value })}
              className="bg-background"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Warranty Period</Label>
            <Input
              placeholder="e.g. 12 Months, 2 Years Onsite"
              value={data.warranty_period || ""}
              onChange={(e) => update({ warranty_period: e.target.value })}
              className="bg-background"
            />
          </div>

          <div className="flex items-center gap-3 pt-6">
            <Switch
              checked={!!data.serial_number_tracked}
              onCheckedChange={(v) => update({ serial_number_tracked: v })}
            />
            <Label className="text-xs">Individual Serial Number Tracking</Label>
          </div>
        </div>
      </div>
    );
  }

  if (isGroc) {
    return (
      <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2 border-b border-primary/10 pb-2">
          <Apple className="size-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Grocery & Perishables Details</h4>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Packaging Type</Label>
            <Select
              value={data.package_type || "Pouch / Packet"}
              onValueChange={(v) => update({ package_type: v })}
            >
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Package type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Pouch / Packet">Pouch / Packet</SelectItem>
                <SelectItem value="Bottle / Jar">Bottle / Jar</SelectItem>
                <SelectItem value="Box / Carton">Box / Carton</SelectItem>
                <SelectItem value="Bag / Sack">Bag / Sack</SelectItem>
                <SelectItem value="Loose / Bulk">Loose / Bulk</SelectItem>
                <SelectItem value="Can / Tin">Can / Tin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Shelf Life (Days)</Label>
            <Input
              type="number"
              placeholder="e.g. 180"
              value={data.shelf_life_days !== undefined ? String(data.shelf_life_days) : ""}
              onChange={(e) => update({ shelf_life_days: e.target.value })}
              className="bg-background"
            />
          </div>

          <div className="flex items-center gap-3 sm:col-span-2 pt-2">
            <Switch
              checked={!!data.perishable}
              onCheckedChange={(v) => update({ perishable: v })}
            />
            <Label className="text-xs">Perishable Item (Requires Expiry Tracking & Quick Rotation)</Label>
          </div>
        </div>
      </div>
    );
  }

  if (isHard) {
    return (
      <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2 border-b border-primary/10 pb-2">
          <Wrench className="size-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Hardware & Tools Details</h4>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Dimensions / Specifications</Label>
            <Input
              placeholder="e.g. 10mm x 50mm, 1/2 inch, 5m"
              value={data.dimensions || ""}
              onChange={(e) => update({ dimensions: e.target.value })}
              className="bg-background"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Material Grade</Label>
            <Input
              placeholder="e.g. SS 304, Galvanized Iron, High Carbon Steel"
              value={data.material_grade || ""}
              onChange={(e) => update({ material_grade: e.target.value })}
              className="bg-background"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs font-medium">Technical Specifications</Label>
            <Input
              placeholder="e.g. Load capacity 500kg, Voltage 220V, Torque 15Nm"
              value={data.technical_specs || ""}
              onChange={(e) => update({ technical_specs: e.target.value })}
              className="bg-background"
            />
          </div>
        </div>
      </div>
    );
  }

  // General Store / Other
  return (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
      <div className="text-xs font-medium text-muted-foreground">
        Standard General Store product fields are active. You can add custom notes or attributes below.
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Specification / Remarks</Label>
        <Input
          placeholder="Optional notes or specifications"
          value={(data["notes"] as string) || ""}
          onChange={(e) => update({ notes: e.target.value })}
          className="bg-background"
        />
      </div>
    </div>
  );
}

export const BUSINESS_TYPES = [
  "Medical / Pharmacy",
  "Grocery",
  "General Store",
  "Electronics",
  "Clothing",
  "Hardware",
  "Other",
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number] | string;

export function normalizeBusinessType(type?: string | null): string {
  if (!type) return "General Store";
  const lower = type.toLowerCase().trim();
  if (lower.includes("medic") || lower.includes("pharm")) return "Medical / Pharmacy";
  if (lower.includes("groc")) return "Grocery";
  if (lower.includes("electr")) return "Electronics";
  if (lower.includes("cloth") || lower.includes("garment") || lower.includes("apparel")) return "Clothing";
  if (lower.includes("hardw")) return "Hardware";
  if (lower.includes("general")) return "General Store";
  return type;
}

export function isMedicalBusiness(type?: string | null): boolean {
  if (!type) return false;
  const lower = type.toLowerCase();
  return lower.includes("medic") || lower.includes("pharm");
}

export function isClothingBusiness(type?: string | null): boolean {
  if (!type) return false;
  const lower = type.toLowerCase();
  return lower.includes("cloth") || lower.includes("garment") || lower.includes("apparel");
}

export function isElectronicsBusiness(type?: string | null): boolean {
  if (!type) return false;
  return type.toLowerCase().includes("electr");
}

export function isGroceryBusiness(type?: string | null): boolean {
  if (!type) return false;
  return type.toLowerCase().includes("groc");
}

export function isHardwareBusiness(type?: string | null): boolean {
  if (!type) return false;
  return type.toLowerCase().includes("hardw");
}

export interface BusinessTypeFields {
  // Medical
  drug_schedule?: string;
  prescription_required?: boolean;
  storage_condition?: string;
  dosage_form?: string;

  // Grocery
  perishable?: boolean;
  shelf_life_days?: string | number;
  package_type?: string;

  // Electronics
  model_number?: string;
  manufacturer?: string;
  warranty_period?: string;
  serial_number_tracked?: boolean;

  // Clothing
  size?: string;
  color?: string;
  material?: string;
  gender?: string;
  style_code?: string;

  // Hardware
  technical_specs?: string;
  material_grade?: string;
  dimensions?: string;

  // General / Remarks
  notes?: string;

  [key: string]: unknown;
}

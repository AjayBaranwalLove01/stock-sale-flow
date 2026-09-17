import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FolderTree,
  Package,
  Users,
  Truck,
  ShoppingCart,
  Receipt,
  Boxes,
  Wallet,
  Undo2,
  BarChart3,
  UserCog,
  Settings,
  ScrollText,
  Warehouse,
  Building2,
  ToggleRight,
  ShoppingBag,
  Megaphone,
  ScanLine,
  Tv,
  HandCoins,
  BadgeIndianRupee,
  ArrowLeftRight,
  Shuffle,

} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth, type ModuleKey } from "@/hooks/useAuth";
import { useEnabledFeatures } from "@/hooks/useTenant";

interface NavItem {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  module: ModuleKey;
  group: string;
  feature?: string;
}

const ITEMS: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, module: "dashboard", group: "Overview" },
  { title: "Businesses", url: "/businesses", icon: Building2, module: "businesses", group: "Platform" },
  { title: "Features", url: "/features", icon: ToggleRight, module: "features", group: "Platform" },
  { title: "Categories", url: "/categories", icon: FolderTree, module: "categories", group: "Catalogue" },
  { title: "Products", url: "/products", icon: Package, module: "products", group: "Catalogue" },
  { title: "Category Mapping", url: "/category-mapping", icon: Shuffle, module: "categories", group: "Catalogue" },

  { title: "Promotions", url: "/promotions", icon: Megaphone, module: "promotions", group: "Catalogue", feature: "promotions" },
  { title: "Digital Signage", url: "/signage", icon: Tv, module: "signage", group: "Catalogue", feature: "digital_signage" },
  { title: "Customers", url: "/customers", icon: Users, module: "customers", group: "Contacts" },
  { title: "Suppliers", url: "/suppliers", icon: Truck, module: "suppliers", group: "Contacts" },
  { title: "Purchases", url: "/purchases", icon: ShoppingCart, module: "purchases", group: "Operations", feature: "purchases" },
  { title: "Sales / Billing", url: "/sales", icon: Receipt, module: "sales", group: "Operations" },
  { title: "Online Orders", url: "/orders", icon: ShoppingBag, module: "orders", group: "Operations", feature: "online_orders" },
  { title: "Inventory", url: "/inventory", icon: Boxes, module: "inventory", group: "Operations" },
  { title: "Godowns / Warehouses", url: "/warehouses", icon: Warehouse, module: "warehouses", group: "Operations", feature: "godown_management" },
  { title: "Stock Transfer", url: "/transfers", icon: ArrowLeftRight, module: "transfers", group: "Operations", feature: "godown_management" },
  { title: "Barcode Stock Entry", url: "/stock-entry", icon: ScanLine, module: "stock-entry", group: "Operations", feature: "barcode_management" },
  { title: "Credit / Udhar", url: "/credit", icon: BadgeIndianRupee, module: "credit", group: "Operations", feature: "customer_credit" },
  { title: "Collections", url: "/collections", icon: HandCoins, module: "collections", group: "Operations", feature: "customer_credit" },
  { title: "Payments", url: "/payments", icon: Wallet, module: "payments", group: "Operations" },
  { title: "Returns", url: "/returns", icon: Undo2, module: "returns", group: "Operations" },
  { title: "Reports", url: "/reports", icon: BarChart3, module: "reports", group: "Insights", feature: "reports" },
  { title: "Users", url: "/users", icon: UserCog, module: "users", group: "Administration" },
  { title: "Settings", url: "/settings", icon: Settings, module: "settings", group: "Administration" },
  { title: "Audit Log", url: "/audit", icon: ScrollText, module: "audit", group: "Administration", feature: "audit_log" },
];


export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { can } = useAuth();
  const { enabled } = useEnabledFeatures();

  const visible = ITEMS.filter((i) => can(i.module) && (!i.feature || enabled(i.feature)));

  const groups = Array.from(new Set(visible.map((i) => i.group)));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-1 py-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Warehouse className="size-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-sidebar-foreground">Ledger ERP</p>
              <p className="truncate text-[11px] text-sidebar-foreground/60">Inventory & Billing</p>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((g) => (
          <SidebarGroup key={g}>
            {!collapsed && <SidebarGroupLabel>{g}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {visible
                  .filter((i) => i.group === g)
                  .map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={pathname.startsWith(item.url)}
                        tooltip={item.title}
                      >
                        <Link to={item.url} className="flex items-center gap-2">
                          <item.icon className="size-4" />
                          {!collapsed && <span>{item.title}</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}

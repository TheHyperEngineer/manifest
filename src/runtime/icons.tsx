import {
  ArrowUpRight,
  Boxes,
  Braces,
  Check,
  CircleDollarSign,
  CloudSun,
  FileJson,
  LayoutGrid,
  ListChecks,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Star,
  Sun,
  Trash2,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export const ICONS: Record<string, LucideIcon> = {
  ArrowUpRight,
  Boxes,
  Braces,
  Check,
  CircleDollarSign,
  CloudSun,
  FileJson,
  LayoutGrid,
  ListChecks,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Star,
  Sun,
  Trash2,
  Users,
  Warehouse,
};

export function AppIcon({
  name,
  size = 18,
  className,
}: {
  name?: string;
  size?: number;
  className?: string;
}) {
  if (!name) return null;
  const Icon = ICONS[name];
  if (!Icon) return null;
  return <Icon size={size} className={className} aria-hidden />;
}

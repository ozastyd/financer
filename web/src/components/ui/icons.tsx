import {
  Bike,
  BookOpen,
  Briefcase,
  Clapperboard,
  CreditCard,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Laptop,
  type LucideIcon,
  Plane,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  Store,
  Target,
  TrendingUp,
  Tv,
  Utensils,
  Wallet,
  Award,
  CircleDashed,
} from "lucide-react";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  makan: Utensils,
  transport: Bike,
  belanja: ShoppingBag,
  hiburan: Clapperboard,
  langganan: Tv,
  pendidikan: GraduationCap,
  rumah: House,
  tagihan: Receipt,
  kesehatan: HeartPulse,
  utang: CreditCard,
  gaji: Wallet,
  freelance: Briefcase,
  usaha: Store,
  uang_saku: Gift,
  beasiswa: Award,
  lainnya: CircleDashed,
};

const GOAL_ICONS: Record<string, LucideIcon> = {
  target: Target,
  dompet: Wallet,
  darurat: ShieldCheck,
  utang: CreditCard,
  laptop: Laptop,
  motor: Bike,
  liburan: Plane,
  usaha: Store,
  investasi: TrendingUp,
  pendidikan: BookOpen,
  lainnya: Target,
};

export function CategoryIcon({ icon, size = 20 }: { icon: string; size?: number }) {
  const I = CATEGORY_ICONS[icon] ?? CircleDashed;
  return <I size={size} strokeWidth={1.8} aria-hidden="true" />;
}

export function GoalIcon({ icon, size = 20 }: { icon: string; size?: number }) {
  const I = GOAL_ICONS[icon] ?? Target;
  return <I size={size} strokeWidth={1.8} aria-hidden="true" />;
}

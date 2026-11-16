import {
  Award,
  Backpack,
  Ban,
  Briefcase,
  CalendarDays,
  CalendarRange,
  CircleDashed,
  CircleDot,
  CircleHelp,
  CircleOff,
  CircleX,
  Clock,
  CreditCard,
  Flame,
  Gift,
  GraduationCap,
  Hourglass,
  Laptop,
  Leaf,
  type LucideIcon,
  Mountain,
  PiggyBank,
  Repeat,
  ShieldCheck,
  ShieldHalf,
  ShieldOff,
  ShoppingBag,
  ShoppingCart,
  Shuffle,
  Sprout,
  Store,
  TreeDeciduous,
  Trees,
  TrendingUp,
  Trophy,
  Wallet,
} from "lucide-react";

// Icons, tile colors and short descriptions for onboarding answers, keyed by
// question then option value (values from src/lib/options.ts).

/** Icon tile tones that read on both light and dark cards. */
const TONES = {
  green: "#10a37f",
  teal: "#0d9488",
  blue: "#3b82f6",
  violet: "#8b5cf6",
  amber: "#d97706",
  rose: "#e11d48",
  slate: "#64748b",
} as const;
type Tone = keyof typeof TONES;

interface OptionVisual {
  icon: LucideIcon;
  tone: Tone;
  desc?: string;
}

export type OptionGroup =
  | "age"
  | "occupation"
  | "experience"
  | "incomeSource"
  | "incomeFrequency"
  | "emergency"
  | "habit"
  | "impulse"
  | "paylater"
  | "challenge";

const VISUALS: Record<OptionGroup, Record<string, OptionVisual>> = {
  age: {
    "<18": { icon: Sprout, tone: "green" },
    "18-21": { icon: Leaf, tone: "teal" },
    "22-25": { icon: TreeDeciduous, tone: "blue" },
    "26-30": { icon: Trees, tone: "violet" },
    ">30": { icon: Mountain, tone: "slate" },
  },
  occupation: {
    pelajar: { icon: Backpack, tone: "amber" },
    mahasiswa: { icon: GraduationCap, tone: "blue" },
    fresh_graduate: { icon: Award, tone: "violet" },
    karyawan: { icon: Briefcase, tone: "teal" },
    freelancer: { icon: Laptop, tone: "green" },
    wirausaha: { icon: Store, tone: "rose" },
    lainnya: { icon: CircleDashed, tone: "slate" },
  },
  experience: {
    pemula: { icon: Sprout, tone: "green", desc: "Belum pernah benar-benar atur keuangan" },
    menengah: { icon: TrendingUp, tone: "blue", desc: "Sudah mulai mencatat atau menabung" },
    mahir: { icon: Trophy, tone: "amber", desc: "Punya anggaran dan rutin mengeceknya" },
  },
  incomeSource: {
    gaji: { icon: Wallet, tone: "green" },
    freelance: { icon: Laptop, tone: "blue" },
    usaha: { icon: Store, tone: "rose" },
    uang_saku: { icon: Gift, tone: "amber" },
    beasiswa: { icon: Award, tone: "violet" },
    lainnya: { icon: CircleDashed, tone: "slate" },
    belum_ada: { icon: CircleOff, tone: "slate" },
  },
  incomeFrequency: {
    bulanan: { icon: CalendarDays, tone: "green" },
    mingguan: { icon: CalendarRange, tone: "blue" },
    tidak_tentu: { icon: Shuffle, tone: "amber" },
    belum_ada: { icon: CircleOff, tone: "slate" },
  },
  emergency: {
    belum_ada: { icon: ShieldOff, tone: "rose", desc: "Kalau ada kejadian mendadak, belum ada cadangan" },
    sebagian: { icon: ShieldHalf, tone: "amber", desc: "Ada cadangan, tapi kurang dari 3 bulan biaya hidup" },
    cukup: { icon: ShieldCheck, tone: "green", desc: "Cukup untuk 3 bulan atau lebih" },
  },
  habit: {
    rutin: { icon: Repeat, tone: "green" },
    kadang: { icon: CircleDot, tone: "amber" },
    tidak: { icon: CircleX, tone: "slate" },
  },
  impulse: {
    sering: { icon: Flame, tone: "rose" },
    kadang: { icon: ShoppingCart, tone: "amber" },
    jarang: { icon: Leaf, tone: "green" },
  },
  paylater: {
    sering: { icon: CreditCard, tone: "rose" },
    kadang: { icon: Clock, tone: "amber" },
    tidak: { icon: Ban, tone: "green" },
  },
  challenge: {
    "Uang cepat habis sebelum akhir bulan": { icon: Hourglass, tone: "amber" },
    "Susah nabung rutin": { icon: PiggyBank, tone: "rose" },
    "Sering belanja impulsif": { icon: ShoppingBag, tone: "violet" },
    "Punya cicilan atau utang": { icon: CreditCard, tone: "blue" },
    "Pemasukan nggak tentu": { icon: Shuffle, tone: "teal" },
    "Bingung mulai dari mana": { icon: CircleHelp, tone: "slate" },
  },
};

export function optionVisual(group: OptionGroup, value: string): { Icon: LucideIcon; color: string; desc?: string } {
  const v = VISUALS[group][value] ?? { icon: CircleDashed, tone: "slate" as Tone };
  return { Icon: v.icon, color: TONES[v.tone], desc: v.desc };
}

/** Icon in a softly tinted rounded tile. */
export function OptionIconTile({ Icon, color, size = 20 }: { Icon: LucideIcon; color: string; size?: number }) {
  return (
    <span className="opt-icon" style={{ background: `${color}1f`, color }}>
      <Icon size={size} strokeWidth={2} aria-hidden="true" />
    </span>
  );
}

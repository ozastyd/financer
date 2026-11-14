// Answer options for onboarding and goal forms. Values match the CHECK
// constraints in supabase/migrations.

export interface Option<T extends string = string> {
  value: T;
  label: string;
}

export const AGE_RANGES: Option[] = [
  { value: "<18", label: "Di bawah 18" },
  { value: "18-21", label: "18–21" },
  { value: "22-25", label: "22–25" },
  { value: "26-30", label: "26–30" },
  { value: ">30", label: "Di atas 30" },
];

export const OCCUPATIONS: Option[] = [
  { value: "pelajar", label: "Pelajar" },
  { value: "mahasiswa", label: "Mahasiswa" },
  { value: "fresh_graduate", label: "Fresh graduate" },
  { value: "karyawan", label: "Karyawan" },
  { value: "freelancer", label: "Freelancer" },
  { value: "wirausaha", label: "Wirausaha" },
  { value: "lainnya", label: "Lainnya" },
];

export const EXPERIENCE: Option[] = [
  { value: "pemula", label: "Baru mulai" },
  { value: "menengah", label: "Lumayan paham" },
  { value: "mahir", label: "Sudah mahir" },
];

export const INCOME_SOURCES: Option[] = [
  { value: "gaji", label: "Gaji" },
  { value: "freelance", label: "Freelance" },
  { value: "usaha", label: "Usaha" },
  { value: "uang_saku", label: "Uang saku" },
  { value: "beasiswa", label: "Beasiswa" },
  { value: "lainnya", label: "Lainnya" },
  { value: "belum_ada", label: "Belum ada pemasukan" },
];

export const INCOME_FREQUENCY: Option[] = [
  { value: "bulanan", label: "Tiap bulan" },
  { value: "mingguan", label: "Tiap minggu" },
  { value: "tidak_tentu", label: "Nggak tentu" },
  { value: "belum_ada", label: "Belum ada" },
];

export const EMERGENCY_STATUS: Option[] = [
  { value: "belum_ada", label: "Belum ada" },
  { value: "sebagian", label: "Ada, tapi belum cukup" },
  { value: "cukup", label: "Sudah cukup (3+ bulan)" },
];

export const FREQ3: Option[] = [
  { value: "rutin", label: "Rutin" },
  { value: "kadang", label: "Kadang-kadang" },
  { value: "tidak", label: "Belum" },
];

export const IMPULSE: Option[] = [
  { value: "sering", label: "Sering" },
  { value: "kadang", label: "Kadang" },
  { value: "jarang", label: "Jarang" },
];

export const PAYLATER: Option[] = [
  { value: "sering", label: "Sering" },
  { value: "kadang", label: "Kadang" },
  { value: "tidak", label: "Nggak pakai" },
];

export const CHALLENGES: string[] = [
  "Uang cepat habis sebelum akhir bulan",
  "Susah nabung rutin",
  "Sering belanja impulsif",
  "Punya cicilan atau utang",
  "Pemasukan nggak tentu",
  "Bingung mulai dari mana",
];

export interface GoalTemplate {
  key: string;
  label: string;
  title: string;
  icon: string;
  target?: number;
}

export const GOAL_TEMPLATES: GoalTemplate[] = [
  { key: "rp1jt", label: "Rp1 juta pertama", title: "Rp1 Juta Pertamaku", icon: "dompet", target: 1_000_000 },
  { key: "rp10jt", label: "Rp10 juta pertama", title: "Rp10 Juta Pertamaku", icon: "target", target: 10_000_000 },
  { key: "darurat", label: "Dana darurat", title: "Dana darurat", icon: "darurat" },
  { key: "utang", label: "Lunasin utang", title: "Lunasin utang", icon: "utang" },
  { key: "laptop", label: "Beli laptop", title: "Laptop baru", icon: "laptop" },
  { key: "motor", label: "Beli motor", title: "Motor", icon: "motor" },
  { key: "liburan", label: "Liburan", title: "Liburan", icon: "liburan" },
  { key: "usaha", label: "Modal usaha", title: "Modal usaha", icon: "usaha" },
  { key: "investasi", label: "Mulai investasi", title: "Dana investasi", icon: "investasi" },
  { key: "pendidikan", label: "Pendidikan", title: "Pendidikan", icon: "pendidikan" },
];

export const GOAL_ICONS: Option[] = [
  { value: "target", label: "Tabungan" },
  { value: "dompet", label: "Dompet" },
  { value: "darurat", label: "Dana darurat" },
  { value: "utang", label: "Utang" },
  { value: "laptop", label: "Gadget" },
  { value: "motor", label: "Kendaraan" },
  { value: "liburan", label: "Liburan" },
  { value: "usaha", label: "Usaha" },
  { value: "investasi", label: "Investasi" },
  { value: "pendidikan", label: "Pendidikan" },
  { value: "lainnya", label: "Lainnya" },
];

export function labelOf(options: Option[], value: string | null | undefined): string {
  return options.find((o) => o.value === value)?.label ?? "";
}

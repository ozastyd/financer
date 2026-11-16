import { z } from "zod";
import { isValidDate } from "./date";
import { MAX_AMOUNT } from "./money";

// Shared validation used by the client forms and re-run on the server.

export const amountSchema = z
  .number({ error: "Masukkan jumlah dalam angka" })
  .int("Jumlah harus bilangan bulat")
  .positive("Jumlah harus lebih dari 0")
  .max(MAX_AMOUNT, "Jumlah terlalu besar");

export const nonNegativeAmount = z.number().int().min(0).max(MAX_AMOUNT);

export const dateSchema = z
  .string()
  .refine((d) => isValidDate(d), "Tanggal tidak valid")
  .refine((d) => d >= "2000-01-01" && d <= "2100-12-31", "Tanggal di luar jangkauan");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maksimal ${max} karakter`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const idSchema = z.string().min(1).max(64);

export const txTypeSchema = z.enum(["income", "expense"]);

export const transactionInput = z.object({
  type: txTypeSchema,
  category_id: idSchema,
  amount: amountSchema,
  description: optionalText(120),
  transaction_date: dateSchema,
});
export type TransactionInput = z.infer<typeof transactionInput>;

export const transactionUpdate = transactionInput.partial();
export type TransactionUpdate = z.infer<typeof transactionUpdate>;

export const goalInput = z.object({
  title: z.string().trim().min(1, "Nama tujuan wajib diisi").max(60, "Maksimal 60 karakter"),
  target_amount: amountSchema,
  target_date: dateSchema.nullable().optional().transform((v) => v ?? null),
  category: z.string().min(1).max(30).default("target"),
  priority: z.number().int().min(1).max(3).default(2),
  description: optionalText(200),
  monthly_plan: amountSchema.nullable().optional().transform((v) => v ?? null),
});
export type GoalInput = z.infer<typeof goalInput>;

export const goalUpdate = z
  .object({
    title: z.string().trim().min(1).max(60),
    target_amount: amountSchema,
    target_date: dateSchema.nullable(),
    category: z.string().min(1).max(30),
    priority: z.number().int().min(1).max(3),
    description: optionalText(200),
    monthly_plan: amountSchema.nullable(),
    status: z.enum(["active", "paused"]),
  })
  .partial();
export type GoalUpdate = z.infer<typeof goalUpdate>;

export const contributionInput = z.object({
  kind: z.enum(["deposit", "withdrawal", "spend"]),
  amount: amountSchema,
  note: optionalText(120),
  contribution_date: dateSchema,
  /** Spend only: record it as an expense in this category. */
  category_id: idSchema.nullable().optional(),
});
export type ContributionInput = z.infer<typeof contributionInput>;

export const contributionUpdate = z
  .object({
    amount: amountSchema,
    note: optionalText(120),
    contribution_date: dateSchema,
  })
  .partial();
export type ContributionUpdate = z.infer<typeof contributionUpdate>;

const choice = <T extends [string, ...string[]]>(values: T) => z.enum(values).nullable().optional();

export const onboardingInput = z.object({
  step: z.number().int().min(1).max(6),
  completed: z.boolean().default(false),
  profile: z
    .object({
      display_name: z.string().trim().min(1, "Nama wajib diisi").max(60),
      age_range: choice(["<18", "18-21", "22-25", "26-30", ">30"]),
      occupation: choice(["pelajar", "mahasiswa", "fresh_graduate", "karyawan", "freelancer", "wirausaha", "lainnya"]),
      financial_experience: choice(["pemula", "menengah", "mahir"]),
    })
    .optional(),
  financial: z
    .object({
      monthly_income: nonNegativeAmount,
      income_source: choice(["gaji", "freelance", "usaha", "uang_saku", "beasiswa", "lainnya", "belum_ada"]),
      additional_income: nonNegativeAmount,
      income_frequency: choice(["bulanan", "mingguan", "tidak_tentu", "belum_ada"]),
      current_savings: nonNegativeAmount,
      monthly_expenses: nonNegativeAmount,
      existing_debt: nonNegativeAmount,
      monthly_obligations: nonNegativeAmount,
      emergency_fund_status: choice(["belum_ada", "sebagian", "cukup"]),
      goal_choices: z.array(z.string().max(40)).max(12),
      tracks_expenses: choice(["rutin", "kadang", "tidak"]),
      saves_regularly: choice(["rutin", "kadang", "tidak"]),
      impulse_buying: choice(["sering", "kadang", "jarang"]),
      uses_paylater: choice(["sering", "kadang", "tidak"]),
      biggest_challenge: z.string().trim().max(200).nullable().optional(),
    })
    .partial()
    .optional(),
});
export type OnboardingInput = z.infer<typeof onboardingInput>;

export const coachRequest = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(20),
});
export type CoachRequest = z.infer<typeof coachRequest>;

/** First human-readable error message from a Zod error. */
export function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Data tidak valid";
}

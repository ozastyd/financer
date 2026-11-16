import { z } from "zod";

// Shared by the sign-up/sign-in form and the API routes.

export const MIN_PASSWORD = 8;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Masukkan alamat email yang valid").max(254, "Email terlalu panjang"));

export const signUpSchema = z.object({
  email: emailSchema,
  password: z.string().min(MIN_PASSWORD, `Kata sandi minimal ${MIN_PASSWORD} karakter`).max(200, "Kata sandi terlalu panjang"),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Masukkan kata sandi").max(200),
});

import type { Metadata } from "next";
import { NotFoundState } from "@/components/error-states";

export const metadata: Metadata = { title: "Halaman tidak ditemukan · Financer" };

export default function NotFound() {
  return <NotFoundState />;
}

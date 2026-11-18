import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Hapus akun · Financer", description: "Cara menghapus akun Financer beserta seluruh datanya." };

const SUPPORT = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@financer.my.id";

export default function HapusAkunPage() {
  const mail = `mailto:${SUPPORT}?subject=${encodeURIComponent("Hapus akun Financer")}&body=${encodeURIComponent("Halo, tolong hapus akun Financer dengan email ini beserta seluruh datanya.")}`;
  return (
    <LegalPage title="Hapus akun Financer" updated="18 November 2026">
      <h2>Lewat aplikasi (langsung terhapus)</h2>
      <ol>
        <li>
          <Link href="/masuk?mode=masuk">Masuk</Link> ke akunmu.
        </li>
        <li>Buka Profil (ikon huruf di kanan atas Beranda).</li>
        <li>Opsional: tekan &ldquo;Unduh data saya&rdquo; untuk menyimpan salinan catatanmu.</li>
        <li>Tekan &ldquo;Hapus akun&rdquo; di bagian paling bawah, masukkan kata sandi, lalu ketik HAPUS.</li>
      </ol>

      <h2>Lewat email (kalau tidak bisa masuk)</h2>
      <p>
        Kirim email ke <a href={mail}>{SUPPORT}</a> dari alamat email yang terdaftar, dengan judul &ldquo;Hapus akun Financer&rdquo;. Kami proses dalam 7 hari kerja dan membalas
        setelah selesai.
      </p>

      <h2>Yang ikut terhapus</h2>
      <ul>
        <li>Akun dan email</li>
        <li>Jawaban onboarding</li>
        <li>Semua transaksi, tujuan, dan riwayat setoran</li>
        <li>Pilihan &ldquo;Kabari saya&rdquo;</li>
      </ul>
      <p>
        Penghapusan tidak bisa dibatalkan. Salinan cadangan harian yang masih memuat datamu terhapus otomatis paling lama sekitar 60 hari kemudian. Detailnya ada di{" "}
        <Link href="/privasi">Kebijakan Privasi</Link>.
      </p>
    </LegalPage>
  );
}

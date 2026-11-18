import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Kebijakan Privasi · Financer", description: "Data apa yang dikumpulkan Financer, untuk apa, dan hakmu atas datamu." };

const SUPPORT = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@financer.my.id";

export default function PrivasiPage() {
  return (
    <LegalPage title="Kebijakan Privasi" updated="18 November 2026">
      <p>
        Financer adalah aplikasi untuk mencatat keuangan pribadi, menabung untuk tujuan, dan bertanya ke AI Coach. Halaman ini menjelaskan data apa yang kami simpan, untuk apa,
        siapa saja yang ikut memprosesnya, dan apa hakmu. Kami mengikuti Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi.
      </p>

      <h2>Data yang kami simpan</h2>
      <ul>
        <li>
          <b>Akun:</b> alamat email dan kata sandi. Kata sandi disimpan dalam bentuk hash (scrypt), jadi kami pun tidak bisa membacanya.
        </li>
        <li>
          <b>Jawaban onboarding:</b> nama panggilan, rentang umur, kesibukan, perkiraan pemasukan, pengeluaran, tabungan, utang, dan kebiasaan keuanganmu.
        </li>
        <li>
          <b>Catatanmu:</b> transaksi (jumlah, kategori, tanggal, catatan), tujuan tabungan, dan riwayat setoran.
        </li>
        <li>
          <b>Fitur yang kamu tunggu:</b> kalau kamu menekan &ldquo;Kabari saya&rdquo; di Profil.
        </li>
      </ul>
      <p>
        <b>Yang tidak kami simpan:</b> foto struk dan file mutasi rekening yang kamu scan. File itu hanya dibaca saat itu juga, lalu dibuang; yang tersimpan hanya transaksi yang kamu
        konfirmasi. Kami juga tidak pernah meminta kata sandi bank atau dompet digitalmu, dan Financer tidak bisa memindahkan uang.
      </p>

      <h2>Untuk apa datamu dipakai</h2>
      <ul>
        <li>Menampilkan sisa uang, grafik, rencana belanja, dan progres tujuanmu.</li>
        <li>Menjawab pertanyaanmu di AI Coach dan membaca struk yang kamu scan.</li>
        <li>Mengirim email atur ulang kata sandi saat kamu memintanya.</li>
        <li>Menjaga keamanan layanan, misalnya membatasi percobaan masuk yang berulang.</li>
      </ul>
      <p>Kami tidak menjual datamu, tidak memasang iklan, dan tidak memakai alat pelacak pihak ketiga.</p>

      <h2>Pihak lain yang ikut memproses</h2>
      <p>Beberapa fitur memakai layanan pihak ketiga. Mereka hanya menerima data yang dibutuhkan untuk fitur itu:</p>
      <ul>
        <li>
          <b>Penyedia model AI (melalui router AI)</b> untuk AI Coach: pertanyaanmu dan ringkasan angka (total pemasukan, pengeluaran, kategori teratas, dan nama serta target
          tujuanmu). Nama panggilan, email, dan catatan transaksimu tidak dikirim.
        </li>
        <li>
          <b>Exa</b> untuk pencarian harga di internet: kata kunci pencarian yang disusun AI Coach dari pertanyaanmu.
        </li>
        <li>
          <b>Groq</b> untuk membaca struk dan mutasi: gambar atau isi file yang kamu scan, sekali proses.
        </li>
        <li>
          <b>Mailjet</b> untuk mengirim email atur ulang kata sandi: alamat emailmu dan isi email tersebut.
        </li>
        <li>
          <b>Cloudflare</b> sebagai jaringan pengantar: lalu lintas ke situs ini, termasuk alamat IP.
        </li>
      </ul>
      <p>Sebagian layanan ini berada di luar Indonesia, sehingga datamu dapat diproses di negara lain.</p>

      <h2>Cookie dan penyimpanan di perangkat</h2>
      <p>
        Kami memakai satu cookie untuk menjaga kamu tetap masuk. Di perangkatmu juga tersimpan hal kecil seperti pilihan tema, kategori yang sering dipakai, isian onboarding sebelum
        akun dibuat, dan percakapan AI Coach selama tab terbuka. Tidak ada cookie iklan atau analitik.
      </p>

      <h2>Berapa lama disimpan</h2>
      <p>
        Datamu disimpan selama akunmu ada. Saat akun dihapus, semua datanya ikut terhapus dari database kami. Salinan cadangan harian disimpan paling lama sekitar 60 hari sebelum
        terhapus otomatis.
      </p>

      <h2>Keamanan</h2>
      <p>
        Koneksi selalu terenkripsi (HTTPS). Setiap akun hanya bisa membaca datanya sendiri, dan ini dijaga sampai ke tingkat database. Mengganti kata sandi otomatis mengeluarkan
        akunmu dari perangkat lain.
      </p>

      <h2>Hakmu</h2>
      <ul>
        <li>
          <b>Melihat dan mengubah</b> datamu kapan saja di aplikasi, termasuk jawaban onboarding lewat Profil.
        </li>
        <li>
          <b>Mengunduh</b> semua catatanmu sebagai file CSV: Profil → Unduh data saya.
        </li>
        <li>
          <b>Menghapus akun</b> beserta seluruh datanya: <Link href="/hapus-akun">lihat caranya</Link>.
        </li>
        <li>
          <b>Bertanya atau mengajukan keberatan</b> soal datamu lewat <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a>.
        </li>
      </ul>

      <h2>Anak di bawah umur</h2>
      <p>Financer boleh dipakai pelajar. Kalau kamu berusia di bawah 18 tahun, pakai Financer dengan sepengetahuan orang tua atau walimu.</p>

      <h2>Perubahan kebijakan</h2>
      <p>Kalau kebijakan ini berubah, tanggal di atas ikut diperbarui. Perubahan penting akan kami beri tahu di aplikasi.</p>

      <h2>Kontak</h2>
      <p>
        Pertanyaan soal privasi: <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a>.
      </p>
    </LegalPage>
  );
}

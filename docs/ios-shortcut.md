# Membuat shortcut "Catat ke Financer" (sekali saja, di iPhone)

Shortcut ini dipakai fitur **Ketuk 2x belakang iPhone**: mengambil tangkapan layar (atau gambar
yang dibagikan) dan mengirimnya ke Financer, lalu menampilkan hasilnya sebagai notifikasi.
Cukup dibuat **sekali** oleh satu orang, lalu dibagikan lewat link iCloud ke semua pengguna.

Waktu: sekitar 5 menit. Butuh iPhone dengan iOS 15 atau lebih baru dan aplikasi **Pintasan (Shortcuts)**.

## 1. Buat shortcut baru
1. Buka **Pintasan** → tab **Pintasan** → tekan **+**.
2. Ketuk judul di atas → **Ganti Nama** → `Catat ke Financer`. Pilih ikon dan warna hijau.

## 2. Tambahkan aksi (urut dari atas)
Tekan **Cari Aksi** untuk menambah tiap aksi.

1. **Teks** (Text)
   - Isi kotaknya dengan: `TEMPEL-KODE-DI-SINI`
   - Ini tempat kode Financer milik tiap pengguna.

2. **Jika** (If)
   - Input: **Input Pintasan** (Shortcut Input) → kondisi **memiliki nilai apa pun** (has any value).
   - Di dalam *Jika*: **Atur Variabel** (Set Variable) → nama `Gambar` → nilai **Input Pintasan**.
   - Di dalam *Jika Tidak* (Otherwise): **Ambil Tangkapan Layar** (Take Screenshot), lalu **Atur Variabel** → `Gambar` → **Tangkapan Layar**.
   - Biarkan **Akhiri Jika** (End If).

3. **Dapatkan Isi URL** (Get Contents of URL)
   - URL: `https://financer.my.id/api/shortcut/capture`
   - Ketuk panah **>** untuk membuka opsi:
     - **Metode**: `POST`
     - **Header** → Tambah header baru:
       - Kunci: `Authorization`
       - Teks: ketik `Bearer ` (dengan spasi), lalu sisipkan variabel **Teks** (dari aksi 1).
     - **Isi Permintaan** (Request Body): **Formulir** (Form)
       - Tambah kolom baru → jenis **File**
       - Kunci: `file`
       - Nilai: variabel **Gambar**

4. **Tampilkan Pemberitahuan** (Show Notification)
   - Judul: `Financer`
   - Isi: variabel **Isi URL** (Contents of URL).

## 3. Pengaturan shortcut
Ketuk ikon **(i)** / **Detail** di bawah:
- Nyalakan **Tampilkan di Lembar Berbagi** (Show in Share Sheet), jenis input **Gambar** saja.
  Bonus: pengguna juga bisa membagikan screenshot dari Foto ke Financer.
- Tab **Penyiapan** (Setup) → **Tambah Pertanyaan Impor** (Import Question):
  - Pilih kotak teks aksi **Teks** (`TEMPEL-KODE-DI-SINI`).
  - Pertanyaan: `Tempel kode dari Financer (Profil › Catat dari layar iPhone)`
  - Jawaban bawaan: kosongkan.
  - Catatan: di beberapa versi iOS 18 menyimpan pertanyaan impor sempat bermasalah. Kalau tidak
    bisa, lewati saja; panduan di aplikasi sudah menjelaskan cara menempel kode secara manual.

## 4. Coba sendiri dulu
1. Di Financer (Safari di iPhone), buka **Profil › Catat otomatis › Ketuk 2x belakang iPhone**,
   tekan **Buat kode**, salin.
2. Di Pintasan, tempel kode itu ke aksi **Teks** (ganti `TEMPEL-KODE-DI-SINI`).
3. Buka foto struk atau bukti transaksi, jalankan shortcut. Harus muncul notifikasi
   "Masuk ke Perlu dicek: …".
4. **Penting:** sebelum membagikan, kembalikan isi aksi **Teks** ke `TEMPEL-KODE-DI-SINI`,
   supaya kodemu tidak ikut terbagikan.

## 5. Bagikan
1. Tekan **Bagikan** (Share) di shortcut → **Salin Tautan iCloud** (Copy iCloud Link).
2. Kirim tautannya ke pengelola Financer. Tautan itu dipasang di server sebagai
   `NEXT_PUBLIC_IOS_SHORTCUT_URL` (lalu aplikasi web dibangun ulang), dan tombol
   **Pasang shortcut** di panduan langsung aktif.

## Kalau ada yang gagal
- Notifikasi "Kode Financer tidak valid": kode belum ditempel atau sudah diputus. Buat kode baru.
- "Tidak ada transaksi terbaca": jalankan di halaman bukti transaksi (yang ada nominal dan tanggal).
- Ketuk belakang tidak bereaksi: cek **Pengaturan › Aksesibilitas › Sentuh › Ketuk Belakang › Ketuk Dua Kali**
  sudah memilih **Catat ke Financer**; casing tebal bisa meredam ketukan.

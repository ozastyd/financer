import { describe, expect, it } from "vitest";
import { parseAmount, parseNotification } from "./parse";

// Samples are real notification texts with the names replaced.
const BCA = "com.bca.mybca.omni.android";
const DANA = "id.dana";
const SHOPEE = "com.shopee.id";
const GOPAY = "com.gojek.gopay";
const LIVIN = "id.bmri.livin";

describe("amounts in both number styles", () => {
  it.each([
    ["10,000.00", 10_000],
    ["1,500,000.00", 1_500_000],
    ["5.000", 5_000],
    ["3.500", 3_500],
    ["1.500.000", 1_500_000],
    ["1.500.000,00", 1_500_000],
    ["10000.00", 10_000],
    ["25000", 25_000],
    ["50.000,-", 50_000],
  ])("%s -> %d", (raw, n) => expect(parseAmount(raw)).toBe(n));
  it("rejects non-amounts", () => {
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("0")).toBeNull();
  });
});

describe("myBCA (Catatan Finansial)", () => {
  it("reads money in; a masked sender is dropped", () => {
    expect(
      parseNotification({ packageName: BCA, title: "Catatan Finansial", text: "Pemasukan sebesar IDR 10,000.00 dari ***UDI ****TOS *NO di kategori Transfer Rekening." }),
    ).toEqual({
      source: "mybca",
      type: "income",
      amount: 10_000,
      counterparty: null,
      categoryHint: "Transfer Rekening",
      description: "Transfer Rekening",
      maybeTransfer: true,
    });
  });
  it("reads money out", () => {
    expect(parseNotification({ packageName: BCA, title: "Catatan Finansial", text: "Pengeluaran sebesar IDR 10,000.00 di kategori Transfer Rekening." })).toMatchObject({
      type: "expense",
      amount: 10_000,
      categoryHint: "Transfer Rekening",
    });
  });
  it("handles large amounts and other categories", () => {
    expect(parseNotification({ packageName: BCA, title: "Catatan Finansial", text: "Pengeluaran sebesar IDR 1,250,500.00 di kategori Belanja." })).toMatchObject({
      type: "expense",
      amount: 1_250_500,
      categoryHint: "Belanja",
      maybeTransfer: false,
    });
  });
});

describe("e-wallets: money received", () => {
  it("DANA, with a name in capitals and an emoji", () => {
    expect(parseNotification({ packageName: DANA, title: "DANA", text: "Rp3.500 telah diterima dari BUDI SANTOSO 💰" })).toMatchObject({
      source: "dana",
      type: "income",
      amount: 3_500,
      counterparty: "Budi Santoso",
      description: "Uang masuk DANA · Budi Santoso",
    });
  });
  it("ShopeePay, with the call to action after the name", () => {
    expect(
      parseNotification({ packageName: SHOPEE, title: "Saldo ShopeePay Diterima", text: "Rp5.000 telah diterima dari Budi Santoso. Klik untuk cek rinciannya." }),
    ).toMatchObject({ source: "shopeepay", type: "income", amount: 5_000, counterparty: "Budi Santoso" });
  });
});

describe("GoPay", () => {
  it("reads money in", () => {
    expect(parseNotification({ packageName: GOPAY, title: "Transfer masuk", text: "Rp5.000 dari Budi Santoso udah masuk ke GoPay kamu." })).toEqual({
      source: "gopay",
      type: "income",
      amount: 5_000,
      counterparty: "Budi Santoso",
      categoryHint: null,
      description: "Uang masuk GoPay · Budi Santoso",
      maybeTransfer: true,
    });
  });
  it("reads money out", () => {
    expect(parseNotification({ packageName: GOPAY, title: "Yes, sukses transfer", text: "Kamu berhasil transfer Rp5.000 ke Budi Santoso." })).toEqual({
      source: "gopay",
      type: "expense",
      amount: 5_000,
      counterparty: "Budi Santoso",
      categoryHint: "Transfer",
      description: "Transfer GoPay · Budi Santoso",
      maybeTransfer: true,
    });
  });
  it("ignores its promos", () => {
    expect(parseNotification({ packageName: GOPAY, title: "Hadiahmu nunggu", text: "Buka sekarang sebelum hangus dan nikmatin bermacam-macam hadiah." })).toBeNull();
  });
});

describe("Livin' by Mandiri", () => {
  const title = "Ini Dia Transaksi Terbaru Anda";
  it("reads a debit card payment, despite the login call to action", () => {
    expect(
      parseNotification({ packageName: LIVIN, title, text: "Dana Rp 100.000,00 didebit dari rek. ****3106. Login ke Livin' by Mandiri untuk cek Mutasi Transaksi." }),
    ).toEqual({
      source: "livin",
      type: "expense",
      amount: 100_000,
      counterparty: null,
      categoryHint: null,
      description: "Kartu debit Mandiri · rek. 3106",
      maybeTransfer: false,
    });
    expect(
      parseNotification({ packageName: LIVIN, title, text: "Dana Rp 11.500,00 didebit dari rek. ****3106. Login ke Livin' by Mandiri untuk cek Mutasi Transaksi." }),
    ).toMatchObject({ type: "expense", amount: 11_500 });
  });
  it("still ignores its login alerts", () => {
    expect(parseNotification({ packageName: LIVIN, title: "Livin' by Mandiri", text: "Login ke Livin' by Mandiri berhasil pada perangkat baru." })).toBeNull();
  });
});

describe("never recorded", () => {
  it("ignores other apps, promos, OTPs and failed transactions", () => {
    expect(parseNotification({ packageName: "com.whatsapp", title: "Budi", text: "Rp5.000 telah diterima dari Budi" })).toBeNull();
    expect(parseNotification({ packageName: DANA, title: "DANA", text: "Promo! Cashback hingga Rp50.000 untuk transaksi pertama" })).toBeNull();
    expect(parseNotification({ packageName: BCA, title: "myBCA", text: "Kode OTP kamu 123456. Jangan berikan ke siapa pun." })).toBeNull();
    expect(parseNotification({ packageName: SHOPEE, title: "ShopeePay", text: "Transfer Rp5.000 gagal. Saldo dikembalikan." })).toBeNull();
    expect(parseNotification({ packageName: DANA, title: "DANA", text: "Ada pesan baru untukmu" })).toBeNull();
  });
});

"use client";

import { Check, ChevronLeft, Flag, PiggyBank, Plus, Repeat, Smile, Sparkles, Target, TrendingUp, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import { useToast } from "@/components/toast";
import { AmountInput, ErrorNote, Field, Spinner } from "@/components/ui/controls";
import { GoalIcon } from "@/components/ui/icons";
import { type OptionGroup, OptionIconTile, optionVisual } from "@/components/ui/option-icons";
import { formatMonthYear } from "@/lib/date";
import { toAppError } from "@/lib/errors";
import { formatRupiah } from "@/lib/money";
import {
  AGE_RANGES,
  CHALLENGES,
  EMERGENCY_STATUS,
  EXPERIENCE,
  FREQ3,
  GOAL_TEMPLATES,
  IMPULSE,
  INCOME_FREQUENCY,
  INCOME_SOURCES,
  OCCUPATIONS,
  type Option,
  PAYLATER,
} from "@/lib/options";
import { loadProgress, savePendingSignUp, saveProgress } from "@/lib/pending-signup";
import { buildStartingProfile } from "@/lib/profile";
import type { OnboardingInput } from "@/lib/schemas";
import { EMPTY_FINANCIAL_PROFILE, type FinancialProfile } from "@/lib/types";

type Amount = number | null;

interface Draft {
  display_name: string;
  age_range: string | null;
  occupation: string | null;
  financial_experience: string | null;
  monthly_income: Amount;
  income_source: string | null;
  additional_income: Amount;
  income_frequency: string | null;
  current_savings: Amount;
  monthly_expenses: Amount;
  existing_debt: Amount;
  monthly_obligations: Amount;
  emergency_fund_status: string | null;
  goal_choices: string[];
  tracks_expenses: string | null;
  saves_regularly: string | null;
  impulse_buying: string | null;
  uses_paylater: string | null;
  biggest_challenge: string | null;
}

const STEP_TITLES = ["Kenalan dulu, yuk", "Dari mana uangmu masuk?", "Gimana kondisi keuanganmu?", "Mau ngejar apa dulu?", "Soal kebiasaan", "Ini titik awal kamu"];
const STEP_SUBTITLES = [
  "Biar sapaan dan sarannya pas buat kamu.",
  "Kira-kira saja. Belum punya pemasukan? Nggak apa-apa, tetap bisa lanjut.",
  "Perkiraan kasar sudah cukup. Semua bisa diubah nanti.",
  "Pilih satu atau lebih. Bisa diubah kapan saja.",
  "Jawab jujur, ini cuma buat kamu. Nggak ada jawaban salah.",
  "Dihitung dari jawabanmu barusan. Makin rajin mencatat, makin akurat.",
];

const STEP_ICONS = [Smile, Wallet, PiggyBank, Target, Repeat, Flag];

const STEP_TIPS: (string | null)[] = [
  null,
  "Pemasukan nggak tentu? Pakai rata-rata 3 bulan terakhir saja.",
  "Belum punya dana darurat? Wajar, banyak yang mulai dari nol.",
  "Mulai dari 1–2 tujuan dulu biar lebih fokus.",
  "Jawaban yang jujur bikin saran AI Coach lebih pas buat kamu.",
  null,
];

/**
 * Answers as cards with a matching icon. "list": full width with an optional
 * description; "grid": two columns for short labels; "row": three compact
 * cards side by side for 3-option scales.
 */
function OptionCards({
  group,
  options,
  value,
  onChange,
  label,
  layout = "list",
}: {
  group: OptionGroup;
  options: Option[];
  value: string | null;
  onChange: (v: string | null) => void;
  label: string;
  layout?: "list" | "grid" | "row";
}) {
  const cls = layout === "list" ? "opt-list" : layout === "grid" ? "opt-grid" : "opt-grid c3";
  return (
    <div className={cls} role="group" aria-label={label}>
      {options.map((o) => {
        const on = value === o.value;
        const { Icon, color, desc } = optionVisual(group, o.value);
        return (
          <button key={o.value} type="button" className={`opt${layout === "row" ? " stack" : ""}`} aria-pressed={on} onClick={() => onChange(on ? null : o.value)}>
            <OptionIconTile Icon={Icon} color={color} size={layout === "list" ? 20 : 18} />
            <span className="opt-text">
              <span className="opt-label">{o.label}</span>
              {layout === "list" && desc && <span className="opt-desc">{desc}</span>}
            </span>
            {on && layout !== "row" && (
              <span className="opt-check">
                <Check size={14} strokeWidth={3} aria-hidden="true" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Question({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="col" style={{ gap: 8 }}>
      <p className="lbl" style={{ marginBottom: 0 }}>
        {label}
      </p>
      {children}
    </div>
  );
}

const n0 = (v: Amount) => v ?? 0;

const EMPTY_DRAFT: Draft = {
  display_name: "",
  age_range: null,
  occupation: null,
  financial_experience: null,
  monthly_income: null,
  income_source: null,
  additional_income: null,
  income_frequency: null,
  current_savings: null,
  monthly_expenses: null,
  existing_debt: null,
  monthly_obligations: null,
  emergency_fund_status: null,
  goal_choices: [],
  tracks_expenses: null,
  saves_regularly: null,
  impulse_buying: null,
  uses_paylater: null,
  biggest_challenge: null,
};

export default function OnboardingPage() {
  const { status, data, mutate, today, session } = useApp();
  const toast = useToast();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A problem with the name is shown at the field, which also gets focus.
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const [customGoal, setCustomGoal] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [createGoal, setCreateGoal] = useState(true);

  // A new visitor does onboarding before creating an account: answers stay in
  // this browser and are sent with the sign-up at the end.
  const guest = status === "signed_out";

  useEffect(() => {
    if (!guest || draft) return;
    const saved = loadProgress<Draft>();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from this browser
    setDraft(saved?.draft ?? { ...EMPTY_DRAFT });
    if (saved) setStep(Math.min(6, Math.max(1, saved.step)));
  }, [guest, draft]);

  // initialise the draft from saved answers (resume where the user left off)
  useEffect(() => {
    if (status !== "ready" || draft) return;
    const fp = data.financial;
    const up = data.userProfile;
    const z = (v: number | undefined) => (v ? v : null);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from loaded data
    setDraft({
      display_name: up?.display_name ?? "",
      age_range: up?.age_range ?? null,
      occupation: up?.occupation ?? null,
      financial_experience: up?.financial_experience ?? null,
      monthly_income: z(fp?.monthly_income),
      income_source: fp?.income_source ?? null,
      additional_income: z(fp?.additional_income),
      income_frequency: fp?.income_frequency ?? null,
      current_savings: z(fp?.current_savings),
      monthly_expenses: z(fp?.monthly_expenses),
      existing_debt: z(fp?.existing_debt),
      monthly_obligations: z(fp?.monthly_obligations),
      emergency_fund_status: fp?.emergency_fund_status ?? null,
      goal_choices: fp?.goal_choices ?? [],
      tracks_expenses: fp?.tracks_expenses ?? null,
      saves_regularly: fp?.saves_regularly ?? null,
      impulse_buying: fp?.impulse_buying ?? null,
      uses_paylater: fp?.uses_paylater ?? null,
      biggest_challenge: fp?.biggest_challenge ?? null,
    });
    if (fp && !fp.onboarding_completed) setStep(Math.min(6, Math.max(1, fp.onboarding_step)));
  }, [status, data, draft]);

  const fpPreview: FinancialProfile | null = useMemo(() => {
    if (!draft) return null;
    return {
      ...EMPTY_FINANCIAL_PROFILE,
      ...draft,
      monthly_income: n0(draft.monthly_income),
      additional_income: n0(draft.additional_income),
      current_savings: n0(draft.current_savings),
      monthly_expenses: n0(draft.monthly_expenses),
      existing_debt: n0(draft.existing_debt),
      monthly_obligations: n0(draft.monthly_obligations),
    };
  }, [draft]);

  const profile = useMemo(() => (fpPreview ? buildStartingProfile(fpPreview, today) : null), [fpPreview, today]);

  if (!draft || !fpPreview || !profile) {
    return (
      <main className="scr safe" style={{ alignItems: "center", justifyContent: "center" }}>
        <Spinner label="Menyiapkan" />
      </main>
    );
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setError(null);
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  };

  const payload = (nextStep: number, completed = false): OnboardingInput => ({
    step: nextStep,
    completed,
    profile: draft.display_name.trim()
      ? {
          display_name: draft.display_name.trim(),
          age_range: draft.age_range as never,
          occupation: draft.occupation as never,
          financial_experience: draft.financial_experience as never,
        }
      : undefined,
    financial: {
      monthly_income: n0(draft.monthly_income),
      income_source: draft.income_source as never,
      additional_income: n0(draft.additional_income),
      income_frequency: draft.income_frequency as never,
      current_savings: n0(draft.current_savings),
      monthly_expenses: n0(draft.monthly_expenses),
      existing_debt: n0(draft.existing_debt),
      monthly_obligations: n0(draft.monthly_obligations),
      emergency_fund_status: draft.emergency_fund_status as never,
      goal_choices: draft.goal_choices,
      tracks_expenses: draft.tracks_expenses as never,
      saves_regularly: draft.saves_regularly as never,
      impulse_buying: draft.impulse_buying as never,
      uses_paylater: draft.uses_paylater as never,
      biggest_challenge: draft.biggest_challenge,
    },
  });

  const validate = (): string | null => {
    if (step === 1 && !draft.display_name.trim()) return "Tulis nama panggilanmu dulu ya.";
    if (step === 1 && draft.display_name.trim().length > 60) return "Nama maksimal 60 karakter.";
    return null;
  };

  const save = async (nextStep: number, completed = false) => {
    if (guest) {
      saveProgress({ step: nextStep, draft });
      return true;
    }
    setSaving(true);
    setError(null);
    try {
      await mutate((s) => s.saveOnboarding(payload(nextStep, completed)));
      return true;
    } catch (e) {
      setError(toAppError(e, "Gagal menyimpan. Periksa koneksimu lalu coba lagi.").message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  /** Shows a step-1 problem at the name field and moves there. */
  const flagName = (message: string) => {
    setNameError(message);
    const el = document.getElementById("ob-name");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  };

  const next = async () => {
    const v = validate();
    if (v) {
      if (step === 1) flagName(v);
      else setError(v);
      return;
    }
    setSavedNote(false);
    if (await save(step + 1)) {
      setStep(step + 1);
      window.scrollTo({ top: 0 });
    }
  };

  const saveLater = async () => {
    const v = validate();
    if (v) {
      if (step === 1) flagName(v);
      else setError(v);
      return;
    }
    if (await save(step)) {
      // Saved: leave, and pick up from this step next time.
      toast.success(guest ? "Tersimpan di perangkat ini. Nanti lanjut dari langkah ini." : "Tersimpan. Lanjutkan kapan saja dari Profil.");
      router.replace(guest ? "/" : "/beranda");
    }
  };

  const finish = async () => {
    const rec = profile.recommended;
    if (guest) {
      // Last step for a new visitor: create the account, which saves all of this.
      saveProgress({ step: 6, draft });
      savePendingSignUp({
        onboarding: payload(6, true),
        firstGoal:
          createGoal && rec
            ? { title: rec.title, target_amount: rec.target, target_date: null, category: rec.icon, priority: 1, description: null, monthly_plan: rec.monthly }
            : undefined,
      });
      router.push("/masuk");
      return;
    }
    if (!(await save(6, true))) return;
    if (createGoal && rec && !data.goals.some((g) => g.title === rec.title)) {
      try {
        await mutate((s) =>
          s.addGoal({
            title: rec.title,
            target_amount: rec.target,
            target_date: null,
            category: rec.icon,
            priority: 1,
            description: null,
            monthly_plan: rec.monthly,
          }),
        );
      } catch {
        // C9: the profile is saved; the first goal can be made later
        toast.info("Profilmu tersimpan. Tujuan pertama belum terbuat, kamu bisa bikin dari menu Tujuan.");
      }
    }
    router.replace("/beranda");
  };

  const toggleGoal = (key: string) =>
    set("goal_choices", draft.goal_choices.includes(key) ? draft.goal_choices.filter((g) => g !== key) : [...draft.goal_choices, key]);

  const customGoals = draft.goal_choices.filter((g) => g.startsWith("lain:"));
  const name = draft.display_name.trim() || session?.email.split("@")[0] || "";
  const StepIcon = STEP_ICONS[step - 1];
  const tip = STEP_TIPS[step - 1];

  return (
    <main className="scr safe" style={{ paddingBottom: 28 }}>
      <div className="row" style={{ gap: 10 }}>
        {step > 1 ? (
          <button type="button" className="ibtn" aria-label="Kembali ke langkah sebelumnya" onClick={() => setStep(step - 1)}>
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
        ) : guest ? (
          <Link className="ibtn" href="/" aria-label="Kembali ke halaman awal">
            <ChevronLeft size={20} aria-hidden="true" />
          </Link>
        ) : (
          <span style={{ width: 44, flex: "none" }} />
        )}
        <div className="col sp" style={{ gap: 8 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <p className="s b">Langkah {step} dari 6</p>
            <p className="s mut">{step === 6 ? "Terakhir" : `${6 - step} lagi`}</p>
          </div>
          <div className="ob-progress" role="progressbar" aria-label="Progres onboarding" aria-valuemin={1} aria-valuemax={6} aria-valuenow={step} aria-valuetext={`Langkah ${step} dari 6`}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <i key={i} className={i <= step ? "on" : ""} />
            ))}
          </div>
        </div>
      </div>

      <div className="ob-hero" key={`title-${step}`}>
        <span className="ob-hero-icon">
          <StepIcon size={28} strokeWidth={2} aria-hidden="true" />
        </span>
        <h1 className="h1">{step === 6 && name ? `Ini titik awal kamu, ${name}` : STEP_TITLES[step - 1]}</h1>
        <p className="t mut">{STEP_SUBTITLES[step - 1]}</p>
      </div>

      {step === 1 && (
        <div className="col" style={{ gap: 18 }}>
          <Field label="Nama panggilan" htmlFor="ob-name" error={nameError ?? undefined}>
            <input
              id="ob-name"
              className="inp"
              autoComplete="given-name"
              maxLength={60}
              required
              aria-required="true"
              aria-invalid={!!nameError}
              value={draft.display_name}
              onChange={(e) => {
                set("display_name", e.target.value);
                if (e.target.value.trim()) setNameError(null);
              }}
              placeholder="Misalnya: Andi"
            />
          </Field>
          <Question label="Umur">
            <OptionCards group="age" layout="grid" label="Umur" options={AGE_RANGES} value={draft.age_range} onChange={(v) => set("age_range", v)} />
          </Question>
          <Question label="Kesibukan sekarang">
            <OptionCards group="occupation" layout="grid" label="Kesibukan" options={OCCUPATIONS} value={draft.occupation} onChange={(v) => set("occupation", v)} />
          </Question>
          <Question label="Pengalaman atur keuangan">
            <OptionCards group="experience" label="Pengalaman" options={EXPERIENCE} value={draft.financial_experience} onChange={(v) => set("financial_experience", v)} />
          </Question>
        </div>
      )}

      {step === 2 && (
        <div className="col" style={{ gap: 18 }}>
          <Question label="Sumber pemasukan utama">
            <OptionCards
              group="incomeSource"
              layout="grid"
              label="Sumber pemasukan"
              options={INCOME_SOURCES}
              value={draft.income_source}
              onChange={(v) => {
                set("income_source", v);
                if (v === "belum_ada") {
                  setDraft((d) => (d ? { ...d, income_source: v, monthly_income: null, income_frequency: "belum_ada" } : d));
                }
              }}
            />
          </Question>
          {draft.income_source !== "belum_ada" && (
            <>
              <Field label="Pemasukan utama per bulan" htmlFor="ob-income" hint="Kosongkan kalau belum ada.">
                <AmountInput id="ob-income" placeholder="0" value={draft.monthly_income} onValueChange={(v) => set("monthly_income", v)} />
              </Field>
              <Question label="Seberapa sering masuk?">
                <OptionCards group="incomeFrequency" layout="grid" label="Frekuensi pemasukan" options={INCOME_FREQUENCY} value={draft.income_frequency} onChange={(v) => set("income_frequency", v)} />
              </Question>
            </>
          )}
          <Field label="Pemasukan tambahan per bulan (opsional)" htmlFor="ob-extra" hint="Misalnya freelance, jualan, atau uang saku tambahan.">
            <AmountInput id="ob-extra" placeholder="0" value={draft.additional_income} onValueChange={(v) => set("additional_income", v)} />
          </Field>
        </div>
      )}

      {step === 3 && (
        <div className="col" style={{ gap: 18 }}>
          <Field label="Total tabungan sekarang" htmlFor="ob-savings" hint="Uang yang kamu pegang atau simpan, di luar utang.">
            <AmountInput id="ob-savings" placeholder="0" value={draft.current_savings} onValueChange={(v) => set("current_savings", v)} />
          </Field>
          <Field label="Pengeluaran rutin per bulan" htmlFor="ob-expenses" hint="Makan, transport, kos, pulsa, dan sejenisnya.">
            <AmountInput id="ob-expenses" placeholder="0" value={draft.monthly_expenses} onValueChange={(v) => set("monthly_expenses", v)} />
          </Field>
          <Field label="Total utang yang belum lunas" htmlFor="ob-debt" hint="Termasuk PayLater dan cicilan. Kosongkan kalau nggak ada.">
            <AmountInput id="ob-debt" placeholder="0" value={draft.existing_debt} onValueChange={(v) => set("existing_debt", v)} />
          </Field>
          <Field label="Cicilan atau kewajiban per bulan" htmlFor="ob-oblig">
            <AmountInput id="ob-oblig" placeholder="0" value={draft.monthly_obligations} onValueChange={(v) => set("monthly_obligations", v)} />
          </Field>
          <Question label="Dana darurat">
            <OptionCards group="emergency" label="Dana darurat" options={EMERGENCY_STATUS} value={draft.emergency_fund_status} onChange={(v) => set("emergency_fund_status", v)} />
          </Question>
        </div>
      )}

      {step === 4 && (
        <div className="col" style={{ gap: 10 }}>
          <div className="opt-grid" role="group" aria-label="Tujuan">
            {GOAL_TEMPLATES.map((g) => {
              const on = draft.goal_choices.includes(g.key);
              return (
                <button key={g.key} type="button" className="opt" aria-pressed={on} onClick={() => toggleGoal(g.key)}>
                  <span className="opt-icon" style={{ background: "var(--pris)", color: "var(--onpris)" }}>
                    <GoalIcon icon={g.icon} size={18} />
                  </span>
                  <span className="opt-text">
                    <span className="opt-label">{g.label}</span>
                  </span>
                  {on && (
                    <span className="opt-check">
                      <Check size={14} strokeWidth={3} aria-hidden="true" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {customGoals.map((g) => (
            <div key={g} className="tile on" style={{ minHeight: 52 }}>
              <span className="sp">{g.slice(5)}</span>
              <button type="button" className="ibtn" style={{ width: 36, height: 36 }} aria-label={`Hapus tujuan ${g.slice(5)}`} onClick={() => toggleGoal(g)}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
          {showCustom ? (
            <form
              className="row"
              style={{ gap: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                const t = customGoal.trim().slice(0, 34);
                if (t && !draft.goal_choices.includes(`lain:${t}`)) set("goal_choices", [...draft.goal_choices, `lain:${t}`]);
                setCustomGoal("");
                setShowCustom(false);
              }}
            >
              <input className="inp sp" aria-label="Nama tujuan lain" placeholder="Misalnya: Nikah" maxLength={34} value={customGoal} onChange={(e) => setCustomGoal(e.target.value)} autoFocus />
              <button className="btn sm" type="submit">
                Tambah
              </button>
            </form>
          ) : (
            <button type="button" className="tile" style={{ minHeight: 52, justifyContent: "center", borderStyle: "dashed" }} onClick={() => setShowCustom(true)}>
              <Plus size={20} aria-hidden="true" />
              Tujuan lain
            </button>
          )}
        </div>
      )}

      {step === 5 && (
        <div className="col" style={{ gap: 18 }}>
          <Question label="Kamu mencatat pengeluaran?">
            <OptionCards group="habit" layout="row" label="Mencatat pengeluaran" options={FREQ3} value={draft.tracks_expenses} onChange={(v) => set("tracks_expenses", v)} />
          </Question>
          <Question label="Kamu biasa menabung?">
            <OptionCards group="habit" layout="row" label="Menabung" options={FREQ3} value={draft.saves_regularly} onChange={(v) => set("saves_regularly", v)} />
          </Question>
          <Question label="Seberapa sering belanja impulsif?">
            <OptionCards group="impulse" layout="row" label="Belanja impulsif" options={IMPULSE} value={draft.impulse_buying} onChange={(v) => set("impulse_buying", v)} />
          </Question>
          <Question label="Pakai PayLater?">
            <OptionCards group="paylater" layout="row" label="PayLater" options={PAYLATER} value={draft.uses_paylater} onChange={(v) => set("uses_paylater", v)} />
          </Question>
          <Question label="Tantangan terbesarmu soal uang">
            <OptionCards group="challenge" label="Tantangan terbesar" options={CHALLENGES.map((c) => ({ value: c, label: c }))} value={draft.biggest_challenge} onChange={(v) => set("biggest_challenge", v)} />
          </Question>
        </div>
      )}

      {step === 6 && (
        <>
          <div className="card hero" style={{ gap: 6 }}>
            <div className="row">
              <p className="s mut sp">Sisa uang per bulan</p>
              <span className="tag">Perkiraan</span>
            </div>
            <p className="big">{formatRupiah(profile.surplus)}</p>
            <p className="s mut num">
              Pemasukan {formatRupiah(profile.income)} − pengeluaran {formatRupiah(fpPreview.monthly_expenses)} − cicilan {formatRupiah(fpPreview.monthly_obligations)}
            </p>
          </div>

          <div className="card">
            <p className="sec">Yang sudah bagus</p>
            {profile.strengths.length === 0 ? (
              <p className="s mut">Belum kelihatan dari jawabanmu. Mulai mencatat, nanti kekuatanmu terlihat di sini.</p>
            ) : (
              profile.strengths.map((s) => (
                <div key={s} className="row" style={{ alignItems: "flex-start" }}>
                  <span className="icb g" style={{ width: 28, height: 28, borderRadius: 9 }}>
                    <Check size={16} aria-hidden="true" />
                  </span>
                  <p className="t sp">{s}</p>
                </div>
              ))
            )}
            <hr className="div" />
            <p className="sec">Yang bisa ditingkatkan</p>
            {profile.improvements.length === 0 ? (
              <p className="s mut">Tidak ada yang mendesak dari jawabanmu. Pertahankan!</p>
            ) : (
              profile.improvements.map((s) => (
                <div key={s} className="row" style={{ alignItems: "flex-start" }}>
                  <span className="icb am" style={{ width: 28, height: 28, borderRadius: 9 }}>
                    <TrendingUp size={16} aria-hidden="true" />
                  </span>
                  <p className="t sp">{s}</p>
                </div>
              ))
            )}
          </div>

          {profile.recommended ? (
            <div className="card soft" style={{ gap: 6 }}>
              <p className="sec" style={{ color: "var(--onpris)" }}>
                Tujuan pertama yang kami sarankan
              </p>
              <p className="h2">
                {profile.recommended.title} · <span className="num">{formatRupiah(profile.recommended.target)}</span>
              </p>
              <p className="s">
                {profile.recommended.reason}{" "}
                {profile.recommended.monthly && profile.recommended.completionDate ? (
                  <>
                    Dengan nabung <span className="num b">{formatRupiah(profile.recommended.monthly)}</span> per bulan (separuh sisa uangmu), tercapai sekitar{" "}
                    {formatMonthYear(profile.recommended.completionDate)}.
                  </>
                ) : (
                  "Mulai dari setoran kecil saat ada uang lebih."
                )}
              </p>
              {profile.alsoChosen.length > 0 && (
                <p className="s">
                  Pilihanmu yang lain (<span className="b">{profile.alsoChosen.join(", ")}</span>) bisa kamu buat di tab Tujuan kapan saja. Kami sarankan mulai dari yang ini dulu.
                </p>
              )}
              <label className="row" style={{ minHeight: 44, cursor: "pointer" }}>
                <input type="checkbox" checked={createGoal} onChange={(e) => setCreateGoal(e.target.checked)} style={{ width: 20, height: 20, accentColor: "var(--pri)" }} />
                <span className="s b">Buat tujuan ini sekarang</span>
              </label>
            </div>
          ) : (
            <div className="card soft">
              <p className="s">Tabunganmu sudah di atas Rp10 juta. Buat tujuan sendiri di tab Tujuan, misalnya untuk {draft.goal_choices.length ? "pilihanmu tadi" : "rencana besar berikutnya"}.</p>
            </div>
          )}
        </>
      )}

      {tip && (
        <div className="ob-tip">
          <span className="ob-tip-icon">
            <Sparkles size={20} aria-hidden="true" />
          </span>
          <p className="s">
            <b>Tips AI:</b> {tip}
          </p>
        </div>
      )}

      <div className="sp" />
      <ErrorNote message={error} />
      {savedNote && (
        <p className="s pos b" role="status" style={{ textAlign: "center" }}>
          {guest ? "Tersimpan di perangkat ini. Nanti kamu lanjut dari langkah ini." : "Tersimpan. Nanti kamu lanjut dari langkah ini."}
        </p>
      )}

      <div className="col" style={{ gap: 4 }}>
        {step === 4 && (
          <p className="s mut" style={{ textAlign: "center" }}>
            {draft.goal_choices.length} tujuan dipilih
          </p>
        )}
        {step === 6 && (
          <p className="s mut" style={{ textAlign: "center", marginBottom: 4 }}>
            {profile.firstAction}
          </p>
        )}
        <button className="btn" type="button" disabled={saving} onClick={step === 6 ? finish : next}>
          {saving ? <Spinner label="Menyimpan" /> : step === 6 ? (guest ? "Lanjut, buat akun" : "Mulai dari sini") : "Lanjut"}
        </button>
        {step < 6 && (
          <button className="lnk" type="button" disabled={saving} style={{ justifyContent: "center", color: "var(--mut)" }} onClick={saveLater}>
            Simpan dulu, lanjut nanti
          </button>
        )}
      </div>
    </main>
  );
}

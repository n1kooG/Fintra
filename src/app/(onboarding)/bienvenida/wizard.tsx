"use client";

import { useState, useTransition } from "react";
import { createAccount } from "@/server/actions/accounts";
import { setDisplayCurrency } from "@/server/actions/preferences";
import { addSuggestedCategories, finishOnboarding } from "@/server/actions/onboarding";
import {
  ACCOUNT_PRESETS,
  SUGGESTED_CATEGORIES,
  newCategoryNames,
  type AccountPreset,
} from "@/lib/onboarding";
import { DISPLAY_CURRENCIES, type Currency } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const TOTAL_STEPS = 3;
const labelClass = "font-mono text-[9.5px] tracking-[0.08em] uppercase";

const CURRENCY_CHOICES: Record<
  (typeof DISPLAY_CURRENCIES)[number],
  { label: string; hint: string }
> = {
  CLP: { label: "Pesos chilenos", hint: "CLP · lo más común" },
  USD: { label: "Dólares", hint: "USD · para quien ahorra o cobra en dólares" },
  EUR: { label: "Euros", hint: "EUR · para quien vive o ahorra en euros" },
  UF: {
    label: "Unidad de Fomento",
    hint: "UF · para ver el patrimonio en un valor estable",
  },
};

export function OnboardingWizard({
  firstName,
  displayCurrency,
  hasAccount,
  existingCategories,
}: {
  firstName: string;
  displayCurrency: Currency;
  hasAccount: boolean;
  existingCategories: string[];
}) {
  // Quien ya tiene cuenta (volvió a mitad del asistente) retoma en el paso 3.
  const [step, setStep] = useState(hasAccount ? 3 : 1);

  return (
    <div className="flex flex-1 flex-col">
      <p className="text-muted-foreground mb-3 font-mono text-[10px] tracking-[0.12em] uppercase">
        Paso {String(step).padStart(2, "0")} — {String(TOTAL_STEPS).padStart(2, "0")}
      </p>
      {step === 1 ? (
        <CurrencyStep
          firstName={firstName}
          initial={displayCurrency}
          onDone={() => setStep(2)}
        />
      ) : null}
      {step === 2 ? <AccountStep onDone={() => setStep(3)} /> : null}
      {step === 3 ? <CategoriesStep existing={existingCategories} /> : null}
    </div>
  );
}

// --- Paso 1: moneda ----------------------------------------------------------

function CurrencyStep({
  firstName,
  initial,
  onDone,
}: {
  firstName: string;
  initial: Currency;
  onDone: () => void;
}) {
  const [value, setValue] = useState<Currency>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function next() {
    startTransition(async () => {
      try {
        await setDisplayCurrency(value);
        onDone();
      } catch {
        setError("No pudimos guardar la moneda. Inténtalo de nuevo.");
      }
    });
  }

  return (
    <>
      <h1 className="mb-2 text-[26px] font-medium">Hola, {firstName}</h1>
      <p className="text-muted-foreground mb-8 text-[14.5px]">
        Vamos a dejar Fintra lista en tres pasos. ¿En qué moneda quieres ver tus totales?
        Cada movimiento se guarda en su propia moneda; esto solo cambia cómo se suman.
      </p>

      <div
        role="radiogroup"
        aria-label="Moneda de visualización"
        className="flex flex-col"
      >
        {DISPLAY_CURRENCIES.map((code) => (
          <ChoiceRow
            key={code}
            selected={value === code}
            onSelect={() => setValue(code)}
            title={CURRENCY_CHOICES[code].label}
            hint={CURRENCY_CHOICES[code].hint}
          />
        ))}
      </div>

      {error ? (
        <p role="alert" className="text-destructive mt-4 font-mono text-[11px]">
          {error}
        </p>
      ) : null}
      <Button
        onClick={next}
        disabled={pending}
        className="mt-8 w-full py-3.5 text-[12.5px]"
      >
        {pending ? "Guardando..." : "Continuar"}
      </Button>
    </>
  );
}

// --- Paso 2: primera cuenta ------------------------------------------------

function AccountStep({ onDone }: { onDone: () => void }) {
  const [preset, setPreset] = useState<AccountPreset>(ACCOUNT_PRESETS[0]);
  const [name, setName] = useState(ACCOUNT_PRESETS[0].defaultName);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(next: AccountPreset) {
    // Si el nombre sigue siendo el sugerido del tipo anterior, se acompaña.
    if (name === preset.defaultName) setName(next.defaultName);
    setPreset(next);
  }

  function submit(formData: FormData) {
    formData.set("type", preset.type);
    startTransition(async () => {
      const result = await createAccount({ error: null }, formData);
      if (result.error) setError(result.error);
      else onDone();
    });
  }

  return (
    <>
      <h1 className="mb-2 text-[26px] font-medium">Agrega tu primera cuenta</h1>
      <p className="text-muted-foreground mb-8 text-[14.5px]">
        Así Fintra sabe de dónde sale y a dónde entra tu plata. Puedes agregar más cuentas
        después.
      </p>

      <form action={submit} className="flex flex-col gap-6">
        <div role="radiogroup" aria-label="Tipo de cuenta" className="flex flex-col">
          {ACCOUNT_PRESETS.map((p) => (
            <ChoiceRow
              key={p.id}
              selected={preset.id === p.id}
              onSelect={() => choose(p)}
              title={p.label}
              hint={p.hint}
            />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ob-name" className={labelClass}>
              Nombre
            </Label>
            <Input
              id="ob-name"
              name="name"
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ob-institution" className={labelClass}>
              Banco (opcional)
            </Label>
            <Input
              id="ob-institution"
              name="institution"
              maxLength={80}
              placeholder="BancoEstado"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ob-balance" className={labelClass}>
            {preset.type === "credit_card"
              ? "Deuda actual (opcional, en 0 si no debes)"
              : "Saldo actual"}
          </Label>
          <Input
            id="ob-balance"
            name="initialBalance"
            type="number"
            step="any"
            inputMode="decimal"
            defaultValue={0}
            className="font-mono"
          />
          <p className="text-muted-foreground font-mono text-[10.5px]">
            {preset.type === "credit_card"
              ? "Si ya debes algo, escríbelo con signo menos (por ejemplo -150000)."
              : "Lo que tienes hoy en la cuenta. Desde aquí, cada movimiento lo ajusta."}
          </p>
        </div>

        <input type="hidden" name="currency" value="CLP" />

        {preset.type === "credit_card" ? (
          <div className="border-border grid grid-cols-3 gap-3 border-t pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="ob-close" className={labelClass}>
                Día de cierre
              </Label>
              <Input
                id="ob-close"
                name="closeDay"
                type="number"
                min={1}
                max={31}
                inputMode="numeric"
                placeholder="22"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ob-due" className={labelClass}>
                Día de pago
              </Label>
              <Input
                id="ob-due"
                name="dueDay"
                type="number"
                min={1}
                max={31}
                inputMode="numeric"
                placeholder="5"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ob-limit" className={labelClass}>
                Cupo
              </Label>
              <Input
                id="ob-limit"
                name="limit"
                type="number"
                min={0}
                inputMode="numeric"
                className="font-mono"
              />
            </div>
            <p className="text-muted-foreground col-span-3 font-mono text-[10.5px]">
              Opcional: con el ciclo podrás pagar en cuotas y ver tus estados de cuenta.
            </p>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-destructive font-mono text-[11px]">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending} className="w-full py-3.5 text-[12.5px]">
          {pending ? "Creando..." : "Continuar"}
        </Button>
      </form>
    </>
  );
}

// --- Paso 3: categorías ----------------------------------------------------

function CategoriesStep({ existing }: { existing: string[] }) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Las que ya existen no se ofrecen de nuevo.
  const available = SUGGESTED_CATEGORIES.filter(
    (name) => newCategoryNames(existing, [name]).length === 1,
  );

  function toggle(name: string) {
    setChosen((current) =>
      current.includes(name) ? current.filter((n) => n !== name) : [...current, name],
    );
  }

  function finish() {
    startTransition(async () => {
      if (chosen.length > 0) {
        const result = await addSuggestedCategories(chosen);
        if (result.error) {
          setError(result.error);
          return;
        }
      }
      await finishOnboarding();
    });
  }

  return (
    <>
      <h1 className="mb-2 text-[26px] font-medium">Tus categorías</h1>
      <p className="text-muted-foreground mb-6 text-[14.5px]">
        Ya tienes un set base de categorías chilenas
        {existing.length > 0 ? `: ${existing.join(", ")}` : ""}. Agrega las que te sirvan;
        siempre puedes crear, renombrar o borrar más en Configuración.
      </p>

      {available.length > 0 ? (
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Categorías sugeridas"
        >
          {available.map((name) => {
            const on = chosen.includes(name);
            return (
              <button
                key={name}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(name)}
                className={cn(
                  "border px-3 py-1.5 font-mono text-[11.5px] transition-colors",
                  on
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
                )}
              >
                {on ? "✓ " : "+ "}
                {name}
              </button>
            );
          })}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-destructive mt-4 font-mono text-[11px]">
          {error}
        </p>
      ) : null}

      <Button
        onClick={finish}
        disabled={pending}
        className="mt-8 w-full py-3.5 text-[12.5px]"
      >
        {pending
          ? "Terminando..."
          : chosen.length > 0
            ? `Agregar ${chosen.length} y empezar`
            : "Empezar a usar Fintra"}
      </Button>
    </>
  );
}

// --- Fila de opción (radio) -------------------------------------------------

function ChoiceRow({
  selected,
  onSelect,
  title,
  hint,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "border-border flex items-center justify-between gap-3 border-b py-3.5 text-left",
        selected ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <span>
        <span className="block text-[15px]">{title}</span>
        <span className="block font-mono text-[10.5px]">{hint}</span>
      </span>
      <span aria-hidden="true" className="font-mono text-[15px]">
        {selected ? "✓" : ""}
      </span>
    </button>
  );
}

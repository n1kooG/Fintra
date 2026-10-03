"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addHoldingFlow,
  createHolding,
  refreshPricesNow,
  setHoldingPrice,
  setHoldingValuation,
  updateHolding,
} from "@/server/actions/investments";
import { useFormDialog } from "@/components/use-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HOLDING_KINDS, HOLDING_KIND_LABEL } from "@/lib/investments";
import { isUnitMethod, type ValuationMethod } from "@/lib/holding-value";
import { CRYPTO_ASSETS, CRYPTO_VS_CURRENCIES } from "@/lib/crypto";
import { CURRENCIES, type Currency } from "@/lib/money";
import { QUOTED_CURRENCIES } from "@/lib/mindicador";
import { todayISO } from "@/lib/dates";

const labelClass = "font-mono text-[9.5px] tracking-[0.08em] uppercase";
const hintClass = "text-muted-foreground font-mono text-[10.5px]";

/** Como elige la persona el tipo de inversion: cada uno fija el metodo de valorizacion. */
const CREATE_TYPES = [
  {
    value: "dap",
    label: "Depósito a plazo",
    hint: "Se valoriza solo: capital + interés devengado",
  },
  {
    value: "fx",
    label: "Dólares, euros o UF",
    hint: "Se valoriza solo con la cotización del día",
  },
  {
    value: "crypto",
    label: "Criptomoneda",
    hint: "Se valoriza solo con el precio de mercado",
  },
  {
    value: "fund",
    label: "Fondo mutuo o acciones",
    hint: "Cuotas o acciones; tú actualizas el precio",
  },
  { value: "manual", label: "Otro (valor a mano)", hint: "Tú escribes cuánto vale" },
] as const;
type CreateType = (typeof CREATE_TYPES)[number]["value"];

const METHOD_OF: Record<CreateType, ValuationMethod> = {
  dap: "fixed_term",
  fx: "fx",
  crypto: "crypto",
  fund: "priced",
  manual: "manual",
};

const RATE_LABEL: Record<(typeof QUOTED_CURRENCIES)[number], string> = {
  USD: "Dólar (USD)",
  EUR: "Euro (EUR)",
  UF: "UF",
  UTM: "UTM",
};

type EditingHolding = {
  id: string;
  name: string;
  institution: string | null;
  notes: string | null;
  method: ValuationMethod;
  /** Solo depósito a plazo. */
  terms?: { end: string; ratePercent: string; period: "monthly" | "annual" } | null;
};

function CurrencySelect({
  name = "currency",
  options = CURRENCIES,
  defaultValue = "CLP",
}: {
  name?: string;
  options?: readonly string[];
  defaultValue?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className={labelClass}>Moneda</Label>
      <Select name={name} defaultValue={defaultValue}>
        <SelectTrigger className="w-[96px] rounded-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NumberField({
  id,
  name,
  label,
  required = true,
  placeholder,
  defaultValue,
  step = "any",
}: {
  id: string;
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number;
  step?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={labelClass}>
        {label}
      </Label>
      <Input
        id={id}
        name={name}
        type="number"
        inputMode="decimal"
        step={step}
        min="0"
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="font-mono"
      />
    </div>
  );
}

function DateField({
  id,
  name,
  label,
  defaultValue,
  required = false,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={labelClass}>
        {label}
      </Label>
      <Input
        id={id}
        name={name}
        type="date"
        required={required}
        defaultValue={defaultValue}
        className="font-mono"
      />
    </div>
  );
}

function RateFields({
  defaultPercent,
  defaultPeriod = "monthly",
}: {
  defaultPercent?: string;
  defaultPeriod?: "monthly" | "annual";
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3">
      <NumberField
        id="h-rate"
        name="ratePercent"
        label="Tasa (%)"
        placeholder="0,45"
        defaultValue={defaultPercent}
      />
      <div className="space-y-1.5">
        <Label className={labelClass}>Período</Label>
        <Select name="ratePeriod" defaultValue={defaultPeriod}>
          <SelectTrigger className="w-[112px] rounded-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">mensual</SelectItem>
            <SelectItem value="annual">anual</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/**
 * Crear (sin `holding`) o editar (con `holding`) un instrumento. Al crear se
 * elige el tipo: cada uno pide solo lo que necesita y fija cómo se valoriza.
 * Al editar cambian nombre, institución y nota (y vencimiento y tasa, en un
 * depósito a plazo).
 */
export function HoldingDialog({ holding }: { holding?: EditingHolding }) {
  const editing = Boolean(holding);
  const [type, setType] = useState<CreateType>("dap");
  const [fundKind, setFundKind] = useState("mutual_fund");
  const [manualKind, setManualKind] = useState("other");

  const { open, error, pending, handleSubmit, onOpenChange } = useFormDialog(
    (formData) => {
      if (holding) return updateHolding(holding.id, { error: null }, formData);
      formData.set("method", METHOD_OF[type]);
      if (type === "fund") formData.set("kind", fundKind);
      if (type === "manual") formData.set("kind", manualKind);
      return createHolding({ error: null }, formData);
    },
  );

  const today = todayISO();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {editing ? (
          <button
            type="button"
            className="text-muted-foreground font-mono text-[9.5px] uppercase"
          >
            editar
          </button>
        ) : (
          <Button>+ Agregar instrumento</Button>
        )}
      </DialogTrigger>
      <DialogContent className="border-border bg-background max-h-[90dvh] overflow-y-auto rounded-none sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-[19px] font-medium">
            {editing ? "Editar instrumento" : "Nuevo instrumento"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {editing
              ? "Cambia el nombre, la institución o la nota del instrumento."
              : "Elige el tipo de inversión y completa sus datos."}
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="flex flex-col gap-5 pt-2">
          {!editing ? (
            <div className="space-y-1.5">
              <Label className={labelClass}>Tipo de inversión</Label>
              <Select value={type} onValueChange={(v) => setType(v as CreateType)}>
                <SelectTrigger className="w-full rounded-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CREATE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className={hintClass}>
                {CREATE_TYPES.find((t) => t.value === type)?.hint}
              </p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="h-name" className={labelClass}>
              Nombre
            </Label>
            <Input
              id="h-name"
              name="name"
              required
              maxLength={80}
              placeholder={
                type === "fx"
                  ? "Dólares ahorrados"
                  : type === "crypto"
                    ? "Bitcoin"
                    : "Depósito a plazo BancoEstado"
              }
              defaultValue={holding?.name}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="h-institution" className={labelClass}>
              Institución (opcional)
            </Label>
            <Input
              id="h-institution"
              name="institution"
              maxLength={80}
              defaultValue={holding?.institution ?? ""}
            />
          </div>

          {/* --- Edición: condiciones del depósito a plazo --- */}
          {editing && holding?.method === "fixed_term" && holding.terms ? (
            <>
              <DateField
                id="h-end"
                name="termEnd"
                label="Vencimiento"
                defaultValue={holding.terms.end}
                required
              />
              <RateFields
                defaultPercent={holding.terms.ratePercent}
                defaultPeriod={holding.terms.period}
              />
            </>
          ) : null}

          {/* --- Creación: campos según el tipo --- */}
          {!editing && type === "dap" ? (
            <>
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <NumberField id="h-invested" name="invested" label="Capital" />
                <CurrencySelect />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <DateField
                  id="h-opened"
                  name="openedOn"
                  label="Inicio"
                  defaultValue={today}
                />
                <DateField
                  id="h-end"
                  name="termEnd"
                  label="Vencimiento"
                  defaultValue=""
                  required
                />
              </div>
              <RateFields />
              <p className={hintClass}>
                Interés simple: con tasa mensual, el interés de 30 días es capital × tasa.
                Al vencer, registra el cobro como un retiro.
              </p>
            </>
          ) : null}

          {!editing && type === "fx" ? (
            <>
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <NumberField
                  id="h-units"
                  name="units"
                  label="Cantidad"
                  placeholder="1500"
                />
                <div className="space-y-1.5">
                  <Label className={labelClass}>Moneda</Label>
                  <Select name="asset" defaultValue="USD">
                    <SelectTrigger className="w-[132px] rounded-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUOTED_CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {RATE_LABEL[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <DateField
                  id="h-opened"
                  name="openedOn"
                  label="Fecha de compra"
                  defaultValue={today}
                />
                <NumberField
                  id="h-cost"
                  name="cost"
                  label="Pagué en pesos"
                  required={false}
                  placeholder="opcional"
                />
              </div>
              <p className={hintClass}>
                Si no escribes cuánto pagaste, se usa la cotización de esa fecha. La
                ganancia incluye lo que subió o bajó el tipo de cambio.
              </p>
            </>
          ) : null}

          {!editing && type === "crypto" ? (
            <>
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <div className="space-y-1.5">
                  <Label className={labelClass}>Criptomoneda</Label>
                  <Select name="asset" defaultValue="BTC">
                    <SelectTrigger className="w-full rounded-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CRYPTO_ASSETS.map((a) => (
                        <SelectItem key={a.code} value={a.code}>
                          {a.name} ({a.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <CurrencySelect options={CRYPTO_VS_CURRENCIES} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  id="h-units"
                  name="units"
                  label="Cantidad"
                  placeholder="0,002"
                />
                <NumberField id="h-cost" name="cost" label="Pagué en total" />
              </div>
              <DateField
                id="h-opened"
                name="openedOn"
                label="Fecha de compra"
                defaultValue={today}
              />
              <p className={hintClass}>
                El precio se trae solo desde CoinGecko, una vez al día o cuando pulses
                «actualizar precios».
              </p>
            </>
          ) : null}

          {!editing && type === "fund" ? (
            <>
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <div className="space-y-1.5">
                  <Label className={labelClass}>Tipo</Label>
                  <Select value={fundKind} onValueChange={setFundKind}>
                    <SelectTrigger className="w-full rounded-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mutual_fund">Fondo mutuo</SelectItem>
                      <SelectItem value="stock">Acciones</SelectItem>
                      <SelectItem value="other">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <CurrencySelect />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumberField id="h-units" name="units" label="Cuotas o acciones" />
                <NumberField id="h-cost" name="cost" label="Pagué en total" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <DateField
                  id="h-opened"
                  name="openedOn"
                  label="Fecha de compra"
                  defaultValue={today}
                />
                <NumberField
                  id="h-price"
                  name="unitPrice"
                  label="Precio actual"
                  required={false}
                  placeholder="por cuota"
                />
              </div>
              <p className={hintClass}>
                Si no pones el precio actual, parte valiendo lo que pagaste; después lo
                actualizas con «actualizar precio».
              </p>
            </>
          ) : null}

          {!editing && type === "manual" ? (
            <>
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <div className="space-y-1.5">
                  <Label className={labelClass}>Tipo</Label>
                  <Select value={manualKind} onValueChange={setManualKind}>
                    <SelectTrigger className="w-full rounded-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HOLDING_KINDS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {HOLDING_KIND_LABEL[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <CurrencySelect />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumberField id="h-invested" name="invested" label="Monto invertido" />
                <DateField
                  id="h-opened"
                  name="openedOn"
                  label="Fecha"
                  defaultValue={today}
                />
              </div>
              <NumberField
                id="h-value"
                name="currentValue"
                label="Valor actual (opcional)"
                required={false}
                placeholder="si lo dejas vacío, vale lo invertido"
              />
            </>
          ) : null}

          {!editing ? (
            <p className={hintClass}>
              Si ya tienes esta plata en una cuenta de tipo Inversión, archívala para no
              contarla dos veces en tu patrimonio.
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="h-notes" className={labelClass}>
              Nota (opcional)
            </Label>
            <Input
              id="h-notes"
              name="notes"
              maxLength={200}
              placeholder="renovable, liquidez diaria..."
              defaultValue={holding?.notes ?? ""}
            />
          </div>

          {error ? (
            <p role="alert" className="text-destructive font-mono text-[11px]">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending} className="w-full py-3 text-[12.5px]">
            {pending
              ? "Guardando..."
              : editing
                ? "Guardar cambios"
                : "Guardar instrumento"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Actualiza cuanto vale el instrumento hoy (o en otra fecha) — solo instrumentos de valor manual. */
export function ValuationDialog({
  holdingId,
  name,
  currency,
}: {
  holdingId: string;
  name: string;
  currency: Currency;
}) {
  const { open, error, pending, handleSubmit, onOpenChange } = useFormDialog((formData) =>
    setHoldingValuation(holdingId, { error: null }, formData),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="border-foreground border-b pb-0.5 font-mono text-[10.5px] uppercase"
        >
          valorizar
        </button>
      </DialogTrigger>
      <DialogContent className="border-border bg-background rounded-none sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="text-[19px] font-medium">Valorizar {name}</DialogTitle>
          <DialogDescription className="sr-only">
            Escribe cuánto vale hoy este instrumento.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="flex flex-col gap-5 pt-2">
          <NumberField id="v-value" name="value" label={`Cuánto vale (${currency})`} />
          <DateField
            id="v-date"
            name="valuedOn"
            label="Fecha"
            defaultValue={todayISO()}
          />
          <p className={hintClass}>
            Si ya hay una valorización de esa fecha, se reemplaza. Un aporte o retiro
            posterior a la valorización se suma al valor automáticamente.
          </p>

          {error ? (
            <p role="alert" className="text-destructive font-mono text-[11px]">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending} className="w-full py-3 text-[12.5px]">
            {pending ? "Guardando..." : "Guardar valor"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Actualiza el precio por cuota o acción (instrumentos «por cuotas»). */
export function PriceDialog({
  holdingId,
  name,
  currency,
}: {
  holdingId: string;
  name: string;
  currency: Currency;
}) {
  const { open, error, pending, handleSubmit, onOpenChange } = useFormDialog((formData) =>
    setHoldingPrice(holdingId, { error: null }, formData),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="border-foreground border-b pb-0.5 font-mono text-[10.5px] uppercase"
        >
          actualizar precio
        </button>
      </DialogTrigger>
      <DialogContent className="border-border bg-background rounded-none sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="text-[19px] font-medium">Precio de {name}</DialogTitle>
          <DialogDescription className="sr-only">
            Escribe el precio actual por cuota o acción.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="flex flex-col gap-5 pt-2">
          <NumberField
            id="p-price"
            name="unitPrice"
            label={`Precio por cuota o acción (${currency})`}
          />
          <DateField
            id="p-date"
            name="valuedOn"
            label="Fecha"
            defaultValue={todayISO()}
          />
          <p className={hintClass}>
            El valor del instrumento será tus cuotas × este precio. Lo encuentras en la
            cartola o en la app de tu corredora.
          </p>

          {error ? (
            <p role="alert" className="text-destructive font-mono text-[11px]">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending} className="w-full py-3 text-[12.5px]">
            {pending ? "Guardando..." : "Guardar precio"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Aporte (pones más plata) o retiro (sacas plata); en instrumentos por unidades, compra o venta. */
export function FlowDialog({
  holdingId,
  name,
  currency,
  method,
  assetCode,
}: {
  holdingId: string;
  name: string;
  currency: Currency;
  method: ValuationMethod;
  assetCode: string | null;
}) {
  const [direction, setDirection] = useState("contribution");
  const byUnits = isUnitMethod(method);
  const { open, error, pending, handleSubmit, onOpenChange } = useFormDialog(
    (formData) => {
      formData.set("direction", direction);
      return addHoldingFlow(holdingId, { error: null }, formData);
    },
  );

  const buyLabel = byUnits ? "Compra" : "Aporte (pongo plata)";
  const sellLabel = byUnits
    ? "Venta"
    : method === "fixed_term"
      ? "Cobro / retiro"
      : "Retiro (saco plata)";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground font-mono text-[10.5px] uppercase"
        >
          {byUnits ? "comprar / vender" : "aportar / retirar"}
        </button>
      </DialogTrigger>
      <DialogContent className="border-border bg-background rounded-none sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-[19px] font-medium">{name}</DialogTitle>
          <DialogDescription className="sr-only">
            Registra un aporte, retiro, compra o venta de este instrumento.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="flex flex-col gap-5 pt-2">
          <div className="space-y-1.5">
            <Label className={labelClass}>Tipo</Label>
            <Select value={direction} onValueChange={setDirection}>
              <SelectTrigger className="w-full rounded-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contribution">{buyLabel}</SelectItem>
                <SelectItem value="withdrawal">{sellLabel}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {byUnits ? (
            <NumberField
              id="f-units"
              name="units"
              label={`Unidades${assetCode ? ` (${assetCode})` : ""}`}
            />
          ) : null}

          <NumberField
            id="f-amount"
            name="amount"
            label={
              byUnits
                ? `${direction === "withdrawal" ? "Recibí" : "Pagué"} en total (${currency})`
                : `Monto (${currency})`
            }
            required={method !== "fx"}
            placeholder={method === "fx" ? "vacío = cotización del día" : undefined}
          />

          <div className="grid grid-cols-2 gap-3">
            <DateField
              id="f-date"
              name="occurredOn"
              label="Fecha"
              defaultValue={todayISO()}
            />
            <div className="space-y-1.5">
              <Label htmlFor="f-notes" className={labelClass}>
                Nota
              </Label>
              <Input id="f-notes" name="notes" maxLength={200} placeholder="opcional" />
            </div>
          </div>
          <p className={hintClass}>
            Es un registro del instrumento: no mueve el saldo de ninguna cuenta.
          </p>

          {error ? (
            <p role="alert" className="text-destructive font-mono text-[11px]">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending} className="w-full py-3 text-[12.5px]">
            {pending ? "Guardando..." : "Registrar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** «Actualizar precios»: trae ahora los precios de mercado de tus criptomonedas. */
export function RefreshPricesButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await refreshPricesNow();
          if (result.error) toast.error("No pudimos traer los precios: " + result.error);
          else
            toast.success(
              result.updated > 0
                ? "Precios actualizados."
                : "No hay criptomonedas que actualizar.",
            );
        })
      }
      className="text-muted-foreground font-mono text-[10px] uppercase underline underline-offset-4 disabled:opacity-50"
    >
      {pending ? "actualizando..." : "actualizar precios"}
    </button>
  );
}

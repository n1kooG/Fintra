"use client";

import { toast } from "sonner";
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
import { useFormDialog } from "@/components/use-form-dialog";
import type { ActionState } from "@/server/actions/accounts";

export type FormDialogField = {
  name: string;
  label: string;
  type?: "text" | "email" | "password";
  defaultValue?: string;
  autoComplete?: string;
  maxLength?: number;
  placeholder?: string;
  required?: boolean;
};

const labelClass = "font-mono text-[9.5px] tracking-[0.08em] uppercase";

/**
 * Dialogo de formulario simple para acciones de un solo paso (cambiar
 * nombre, contrasena, eliminar cuenta...). Cierra al guardar sin error,
 * muestra el error del servidor si no, y avisa con un toast al terminar.
 */
export function FormDialog({
  triggerLabel,
  title,
  description,
  fields,
  submitLabel,
  action,
  successMessage,
  destructive = false,
}: {
  triggerLabel: string;
  title: string;
  description?: string;
  fields: FormDialogField[];
  submitLabel: string;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  successMessage?: string;
  destructive?: boolean;
}) {
  const { open, error, pending, handleSubmit, onOpenChange } = useFormDialog(
    async (formData) => {
      const result = await action({ error: null }, formData);
      if (!result.error && successMessage) toast.success(successMessage);
      return result;
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={
            destructive
              ? "text-destructive border-destructive border-b pb-0.5 font-mono text-[10.5px] uppercase"
              : "border-foreground border-b pb-0.5 font-mono text-[10.5px] uppercase"
          }
        >
          {triggerLabel}
        </button>
      </DialogTrigger>
      <DialogContent className="border-border bg-background rounded-none sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-[19px] font-medium">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-muted-foreground text-[13px]">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <form action={handleSubmit} className="flex flex-col gap-5 pt-2">
          {fields.map((field) => (
            <div key={field.name} className="space-y-1.5">
              <Label htmlFor={`fd-${field.name}`} className={labelClass}>
                {field.label}
              </Label>
              <Input
                id={`fd-${field.name}`}
                name={field.name}
                type={field.type ?? "text"}
                defaultValue={field.defaultValue}
                autoComplete={field.autoComplete}
                maxLength={field.maxLength}
                placeholder={field.placeholder}
                required={field.required ?? true}
              />
            </div>
          ))}

          {error ? (
            <p role="alert" className="text-destructive font-mono text-[11px]">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            disabled={pending}
            variant={destructive ? "destructive" : "default"}
            className="w-full py-3 text-[12.5px]"
          >
            {pending ? "Guardando..." : submitLabel}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

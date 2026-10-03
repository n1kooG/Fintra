import { redirect } from "next/navigation";
import { getCurrentHousehold } from "@/lib/auth/current-household";
import { ReportsTabs } from "@/components/reports/reports-tabs";
import { todayISO } from "@/lib/dates";
import { HonorariosCalculator } from "./calculator";

export default async function HonorariosPage() {
  const current = await getCurrentHousehold();
  if (!current) redirect("/login");

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-7 px-6 py-8 md:px-11">
      <h1 className="text-2xl font-medium md:text-[23px]">Reportes</h1>
      <ReportsTabs active="/reportes/honorarios" />
      <HonorariosCalculator defaultYear={Number(todayISO().slice(0, 4))} />
    </div>
  );
}

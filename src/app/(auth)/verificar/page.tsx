import { safeNextPath } from "@/lib/safe-redirect";
import { VerifyForm } from "./verify-form";

export default async function VerificarPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      <VerifyForm next={safeNextPath(next)} />
    </div>
  );
}

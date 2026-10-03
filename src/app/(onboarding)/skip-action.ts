"use server";

import { finishOnboarding } from "@/server/actions/onboarding";

/** Adaptador para <form action>: no recibe argumentos ni devuelve nada. */
export async function skipOnboardingAction() {
  await finishOnboarding();
}

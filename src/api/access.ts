import { ExecutionMethod } from "appwrite";
import { account, functions } from "../lib/appwrite";
import { ACCEPTED_LABEL, ADMIN_LABEL, env } from "../lib/env";
import type { Models } from "../lib/appwrite";

export type AccessState = "anonymous" | "unverified" | "pending" | "accepted";

export function accessStateFor(user: Models.User<Models.Preferences> | null): AccessState {
  if (!user) return "anonymous";
  if (!user.emailVerification) return "unverified";
  return user.labels.includes(ACCEPTED_LABEL) ? "accepted" : "pending";
}

/**
 * Los admins mantienen el catalogo. Es solo para no ensenar controles que
 * Appwrite va a rechazar: el permiso de verdad lo aplican las colecciones.
 */
export function isAdmin(user: Models.User<Models.Preferences> | null): boolean {
  return Boolean(user?.labels.includes(ADMIN_LABEL));
}

export interface AccessRequestResult {
  ok: boolean;
  status?: string;
  notified?: boolean;
  rateLimited?: boolean;
  nextAllowedAt?: string | null;
  reason?: string;
}

/**
 * Reinvoca la funcion que avisa al admin. La funcion aplica su propio limite de
 * frecuencia, asi que es seguro llamarla desde un boton.
 */
export async function requestAccess(message?: string): Promise<AccessRequestResult> {
  const execution = await functions.createExecution({
    functionId: env.notifyFunctionId,
    body: JSON.stringify({ message: message ?? "" }),
    async: false,
    method: ExecutionMethod.POST,
    headers: { "content-type": "application/json" },
  });

  try {
    return JSON.parse(execution.responseBody) as AccessRequestResult;
  } catch {
    return { ok: false, reason: "respuesta-invalida" };
  }
}

export async function sendVerificationEmail(): Promise<void> {
  await account.createEmailVerification({ url: `${window.location.origin}/verify` });
}

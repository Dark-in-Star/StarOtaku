import "server-only";
import { cookies } from "next/headers";

export const ADULT_CONSENT_COOKIE = "starotaku_adult_ok";

/**
 * The adult section is off unless the deployment opts in. Google Play bans sexual content
 * outright, and the Android app is this same site in a Trusted Web Activity — so it must
 * be possible to ship a build where these routes simply don't exist.
 */
export function adultReaderEnabled(): boolean {
  return process.env.ENABLE_ADULT_READER === "1";
}

export async function hasAdultConsent(): Promise<boolean> {
  return (await cookies()).get(ADULT_CONSENT_COOKIE)?.value === "1";
}

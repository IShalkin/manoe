/**
 * Pure CORS origin resolution extracted from Server.ts so the policy is unit-tested
 * against the SAME code the server runs (not the `cors` npm package's behavior).
 *
 * `allow` is the value to pass to the cors callback's success path; when `error`
 * is set the origin is rejected. Behavior mirrors Server.ts:130-146 exactly.
 */
export function resolveCorsOrigin(
  corsOriginEnv: string,
  requestOrigin: string | undefined
): { allow: string | null; error?: string } {
  if (corsOriginEnv === "*") {
    return { allow: "*" };
  }
  const whitelist = corsOriginEnv.split(",").map((s) => s.trim());
  if (!requestOrigin || whitelist.includes(requestOrigin)) {
    return { allow: requestOrigin || whitelist[0] };
  }
  return { allow: null, error: `Origin ${requestOrigin} not allowed by CORS` };
}

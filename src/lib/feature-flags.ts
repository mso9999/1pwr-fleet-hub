function truthyFlag(v: string | undefined): boolean {
  if (!v) return true;
  const s = v.trim().toLowerCase();
  return s !== "0" && s !== "false" && s !== "off";
}

/** Client-side switch for multi-stop mission/trip rollout. Default ON unless explicitly disabled. */
export function isMultiStopRolloutEnabled(): boolean {
  return truthyFlag(process.env.NEXT_PUBLIC_MULTI_STOP_ROLLOUT);
}

/** Server-side switch for multi-stop mission/trip rollout. */
export function isMultiStopRolloutEnabledServer(): boolean {
  return truthyFlag(process.env.MULTI_STOP_ROLLOUT ?? process.env.NEXT_PUBLIC_MULTI_STOP_ROLLOUT);
}

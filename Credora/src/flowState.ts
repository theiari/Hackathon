const NS = "credora:";

export type FlowStep = 1 | 2 | 3 | 4 | 5;

const KEYS = {
  completedSteps: `${NS}completed_steps`,
  lastDomainId: `${NS}last_domain_id`,
  lastTemplateId: `${NS}last_template_id`,
  lastNotarizationId: `${NS}last_notarization_id`,
  lastDomainCapId: `${NS}last_domain_cap_id`,
  adminApiKey: `${NS}admin_api_key`,
  aaAccountId: `${NS}aa_account_id`,
  aaThreshold: `${NS}aa_threshold`,
  aaSignerCount: `${NS}aa_signer_count`,
  packageMetadataId: `${NS}package_metadata_id`,
};

export const flowKeys = KEYS;

export function getCompletedSteps(address?: string): Set<number> {
  const key = address ? `${KEYS.completedSteps}:${address}` : KEYS.completedSteps;
  const raw = localStorage.getItem(key);
  if (!raw) return new Set<number>();
  try {
    const parsed = JSON.parse(raw) as number[];
    return new Set(parsed.filter((n) => n >= 1 && n <= 5));
  } catch {
    return new Set<number>();
  }
}

export function markStepCompleted(step: FlowStep, address?: string): Set<number> {
  const key = address ? `${KEYS.completedSteps}:${address}` : KEYS.completedSteps;
  const next = getCompletedSteps(address);
  next.add(step);
  localStorage.setItem(key, JSON.stringify(Array.from(next)));
  return next;
}

export function getCurrentStep(completed: Set<number>): FlowStep {
  for (const step of [1, 2, 3, 4, 5] as FlowStep[]) {
    if (!completed.has(step)) return step;
  }
  return 5;
}

export function setFlowValue(key: keyof typeof KEYS, value: string) {
  localStorage.setItem(KEYS[key], value);
  window.dispatchEvent(new CustomEvent("flowStateChange", { detail: { key, value } }));
}

export function getFlowValue(key: keyof typeof KEYS): string {
  return localStorage.getItem(KEYS[key]) ?? "";
}

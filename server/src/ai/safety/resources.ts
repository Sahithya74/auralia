import type { SafetyCategory } from './crisisDetector.js';

// Verify these numbers before each release; services and numbers change.
// Display names are localised on the client by id (safety.resources.<id>).
export interface SupportResource {
  id: 'emergency' | 'telemanas' | 'women_helpline';
  phone: string;
  altPhone?: string;
  for: SafetyCategory[];
}

const INDIA: SupportResource[] = [
  { id: 'emergency', phone: '112', for: ['self_harm', 'abuse', 'harm_to_others', 'medical'] },
  { id: 'telemanas', phone: '14416', altPhone: '1-800-891-4416', for: ['self_harm', 'harm_to_others'] },
  { id: 'women_helpline', phone: '181', for: ['abuse'] },
];

const BY_REGION = { IN: INDIA } as const;

export function resourcesFor(region: keyof typeof BY_REGION, categories: SafetyCategory[]): SupportResource[] {
  return BY_REGION[region].filter((r) => r.for.some((c) => categories.includes(c)));
}

// -----------------------------------------------------------------------------
// Local Accreditation Registry — the configured "official source" in this
// development environment.
//
// In production this module would be replaced by live calls to an authoritative
// government / accreditation registry API. Here it is a small, inspectable,
// editable fixture. An organization is confirmed by the official source ONLY when
// its submitted registration number (or official institutional domain) matches an
// entry below AND the submitted legal name is consistent with the registry record.
//
// Organizations NOT present here are never fabricated as verified — the
// official-source check returns PENDING (unavailable), per the project's rule:
// "If an authoritative source cannot actually be reached/configured, return
//  PENDING_VERIFICATION rather than falsely returning VERIFIED."
//
// To let a brand-new registration reach VERIFIED in the demo, register using one
// of the identities listed below (see ACCREDITATION_REGISTRY[0] — pre-filled as
// the default in the registration form).
// -----------------------------------------------------------------------------

export interface AccreditationRecord {
  name: string;
  regNumber: string;
  domain: string; // official institutional domain (matches official_email / website)
  type: string;
  jurisdiction: string;
  source: string; // human-readable issuing authority
}

export const ACCREDITATION_REGISTRY: AccreditationRecord[] = [
  {
    // Mirrors the seeded demo organization (ORG-ZEROLEAK-NATIONAL) so a fresh
    // registration using this identity reaches VERIFIED and unlocks Stage 2.
    name: 'National Board of Technical Examinations',
    regNumber: 'NBTE/2026/REG-9482',
    domain: 'nbte.edu.in',
    type: 'Government Examination Board',
    jurisdiction: 'IN',
    source: 'National Accreditation Registry — Ministry of Education (IN)',
  },
  {
    name: 'Central Board of Secondary Education',
    regNumber: 'CBSE/1962/REG-0001',
    domain: 'cbse.gov.in',
    type: 'Central Examination Board',
    jurisdiction: 'IN',
    source: 'National Accreditation Registry — Ministry of Education (IN)',
  },
  {
    name: 'National Testing Agency',
    regNumber: 'NTA/2017/REG-0007',
    domain: 'nta.ac.in',
    type: 'National Recruitment Commission',
    jurisdiction: 'IN',
    source: 'National Accreditation Registry — Ministry of Education (IN)',
  },
];

// Recognized institutional domain suffixes. Used by the email/domain check only —
// NOT as a substitute for an official-source registry match.
export const RECOGNIZED_INSTITUTIONAL_SUFFIXES = [
  '.edu',
  '.edu.in',
  '.ac.in',
  '.gov',
  '.gov.in',
  '.nic.in',
];

// Public email providers can never serve as an official institutional domain.
export const PUBLIC_EMAIL_PROVIDERS = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'proton.me',
  'protonmail.com',
  'icloud.com',
  'aol.com',
];

export function normalizeName(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function normalizeReg(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function extractDomain(emailOrUrl: string): string {
  if (!emailOrUrl) return '';
  let s = emailOrUrl.trim().toLowerCase();
  if (s.includes('@')) return (s.split('@')[1] || '').trim();
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  return (s.split('/')[0] || '').trim();
}

/**
 * Look up an organization in the configured registry by registration number,
 * official domain (email or website), or exact legal name. Returns null when the
 * organization is not present (→ official source unavailable → PENDING).
 */
export function findRegistryRecord(input: {
  reg_number?: string;
  official_email?: string;
  name?: string;
  website?: string;
}): AccreditationRecord | null {
  const reg = normalizeReg(input.reg_number || '');
  const emailDomain = extractDomain(input.official_email || '');
  const siteDomain = extractDomain(input.website || '');
  const nm = normalizeName(input.name || '');

  for (const rec of ACCREDITATION_REGISTRY) {
    if (reg && normalizeReg(rec.regNumber) === reg) return rec;
    if (emailDomain && rec.domain.toLowerCase() === emailDomain) return rec;
    if (siteDomain && rec.domain.toLowerCase() === siteDomain) return rec;
    if (nm && normalizeName(rec.name) === nm) return rec;
  }
  return null;
}

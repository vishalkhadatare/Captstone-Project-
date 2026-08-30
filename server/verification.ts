// -----------------------------------------------------------------------------
// ZeroLeak — Stage 1 Organization Verification Engine
//
// Pure, rule-based, DETERMINISTIC. AI / OCR may only EXTRACT text from documents;
// the decision itself is made here by explicit rules. No AI decides "verified".
//
// Decision rules (per spec):
//   - missing mandatory info        → VERIFICATION_FAILED
//   - required document missing     → PENDING_VERIFICATION
//   - document invalid / corrupt    → VERIFICATION_FAILED
//   - extracted text ≠ submitted    → VERIFICATION_FAILED
//   - official source ≠ submitted   → VERIFICATION_FAILED
//   - official source unavailable   → PENDING_VERIFICATION
//   - all checks pass               → VERIFIED
//
// Aggregation: any FAIL → VERIFICATION_FAILED; else any PENDING →
// PENDING_VERIFICATION; else VERIFIED. Only VERIFIED unlocks Stage 2.
// -----------------------------------------------------------------------------

import crypto from 'crypto';
// pdf-parse is already a project dependency (used in server.ts). The deep import
// avoids the package's index.js debug harness that reads a local test file.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import {
  findRegistryRecord,
  extractDomain,
  normalizeName,
  normalizeReg,
  RECOGNIZED_INSTITUTIONAL_SUFFIXES,
  PUBLIC_EMAIL_PROVIDERS,
} from './accreditationRegistry.ts';

export type CheckStatus = 'PASS' | 'PENDING' | 'FAIL';
export type OrgVerificationDecision =
  | 'VERIFIED'
  | 'PENDING_VERIFICATION'
  | 'VERIFICATION_FAILED';

export interface VerificationCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export type ExtractionStatus = 'EXTRACTED' | 'UNAVAILABLE' | 'CORRUPT' | 'MISSING';
export type DocMatchStatus = 'MATCH' | 'MISMATCH' | 'UNVERIFIED';

export interface DocumentVerificationDetail {
  doc_type: string;
  file_name: string;
  file_size: number;
  sha256: string | null;
  extraction_status: ExtractionStatus;
  match_status: DocMatchStatus;
  detail: string;
}

export interface OrgVerificationInput {
  name: string;
  type?: string;
  reg_number: string;
  auth_id?: string;
  official_email: string;
  website?: string;
  address?: string;
  contact?: string;
  rep_name?: string;
  rep_email?: string;
  documents: Array<{
    doc_type: string;
    file_name: string;
    file_size?: number;
    file_data?: string; // base64 (optionally a data: URL)
  }>;
}

export interface OrgVerificationResult {
  status: OrgVerificationDecision;
  verificationMethod: string;
  verificationSource: string | null;
  verificationDate: string;
  documentVerificationStatus: 'VERIFIED' | 'PENDING' | 'FAILED';
  message: string;
  evidence: {
    checks: VerificationCheck[];
    documents: DocumentVerificationDetail[];
  };
}

// Documents the engine treats as mandatory for a complete submission.
export const REQUIRED_DOC_TYPES = ['ACCREDITATION_CERTIFICATE', 'AUTHORIZATION_LETTER'];

// ---- helpers ---------------------------------------------------------------

function stripDataUrl(b64: string): string {
  if (!b64) return '';
  const comma = b64.indexOf('base64,');
  return comma >= 0 ? b64.slice(comma + 'base64,'.length) : b64;
}

function decodeBase64(b64: string): Buffer | null {
  try {
    const buf = Buffer.from(stripDataUrl(b64), 'base64');
    return buf && buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

/** SHA-256 of a decoded document buffer. Returns null when the buffer is unusable. */
export function hashDocumentBuffer(buf: Buffer | null): string | null {
  if (!buf || buf.length === 0) return null;
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Extract text from a document. Text-based PDFs are parsed with pdf-parse.
 * Images and scanned (image-only) PDFs need a real OCR engine which is not
 * configured in this environment → 'UNAVAILABLE' (never a fake pass). A buffer
 * that cannot be decoded / is not a real document → 'CORRUPT'.
 */
export async function extractDocumentText(
  buf: Buffer | null,
  fileName: string,
): Promise<{ status: ExtractionStatus; text: string }> {
  if (!buf || buf.length === 0) return { status: 'CORRUPT', text: '' };

  const header = buf.subarray(0, 5).toString('latin1');
  const looksPdf = header === '%PDF-' || /\.pdf$/i.test(fileName || '');

  if (looksPdf) {
    try {
      const parsed = await pdfParse(buf);
      const text = ((parsed && parsed.text) || '').trim();
      // A real PDF with no extractable text is an image-only/scanned PDF → OCR needed.
      return text.length >= 20
        ? { status: 'EXTRACTED', text }
        : { status: 'UNAVAILABLE', text: '' };
    } catch {
      // pdf-parse throws on a declared-PDF that is actually malformed.
      return header === '%PDF-'
        ? { status: 'UNAVAILABLE', text: '' }
        : { status: 'CORRUPT', text: '' };
    }
  }

  // Image or other binary: OCR not configured in this environment.
  return { status: 'UNAVAILABLE', text: '' };
}

/** Does extracted document text corroborate the submitted name / reg number? */
function matchExtractedToSubmitted(text: string, input: OrgVerificationInput): DocMatchStatus {
  if (!text) return 'UNVERIFIED';
  const normText = normalizeName(text);
  const normTextReg = normalizeReg(text);

  const regTarget = normalizeReg(input.reg_number || '');
  const regHit = regTarget.length >= 4 && normTextReg.includes(regTarget);

  const nameTokens = normalizeName(input.name || '')
    .split(' ')
    .filter((t) => t.length >= 4);
  const nameHits = nameTokens.filter((t) => normText.includes(t)).length;
  const nameHit = nameTokens.length > 0 && nameHits >= Math.ceil(nameTokens.length / 2);

  return regHit || nameHit ? 'MATCH' : 'MISMATCH';
}

// ---- individual checks -----------------------------------------------------

function checkRegistrationInfo(input: OrgVerificationInput): VerificationCheck {
  const missing: string[] = [];
  if (!input.name?.trim()) missing.push('organization name');
  if (!input.reg_number?.trim()) missing.push('registration number');
  if (!input.official_email?.trim()) missing.push('official email');
  if (!input.rep_name?.trim()) missing.push('authorized representative name');
  if (!input.rep_email?.trim()) missing.push('representative email');

  if (missing.length > 0) {
    return {
      id: 'registration_info',
      label: 'Registration information completeness',
      status: 'FAIL',
      detail: `Missing mandatory information: ${missing.join(', ')}.`,
    };
  }
  return {
    id: 'registration_info',
    label: 'Registration information completeness',
    status: 'PASS',
    detail: 'All mandatory registration fields are present.',
  };
}

async function checkDocuments(
  input: OrgVerificationInput,
): Promise<{ check: VerificationCheck; documents: DocumentVerificationDetail[] }> {
  const provided = input.documents || [];

  // Process every provided document concurrently (hash + extraction).
  const documents: DocumentVerificationDetail[] = await Promise.all(
    provided.map(async (doc): Promise<DocumentVerificationDetail> => {
      const buf = doc.file_data ? decodeBase64(doc.file_data) : null;

      if (!doc.file_data) {
        return {
          doc_type: doc.doc_type,
          file_name: doc.file_name || '(none)',
          file_size: doc.file_size || 0,
          sha256: null,
          extraction_status: 'MISSING',
          match_status: 'UNVERIFIED',
          detail: 'No file content was provided for this document.',
        };
      }
      if (!buf) {
        return {
          doc_type: doc.doc_type,
          file_name: doc.file_name || '(unknown)',
          file_size: doc.file_size || 0,
          sha256: null,
          extraction_status: 'CORRUPT',
          match_status: 'UNVERIFIED',
          detail: 'Document content could not be decoded (invalid or corrupt file).',
        };
      }

      const sha256 = hashDocumentBuffer(buf);
      const { status: extraction, text } = await extractDocumentText(buf, doc.file_name || '');
      let match: DocMatchStatus = 'UNVERIFIED';
      let detail = '';

      if (extraction === 'EXTRACTED') {
        match = matchExtractedToSubmitted(text, input);
        detail =
          match === 'MATCH'
            ? 'Extracted document text matches the submitted organization identity.'
            : 'Extracted document text does NOT match the submitted name or registration number.';
      } else if (extraction === 'CORRUPT') {
        detail = 'Document is invalid or corrupt.';
      } else {
        detail =
          'Text could not be extracted automatically (image/scanned document — OCR not available in this environment); requires manual review.';
      }

      return {
        doc_type: doc.doc_type,
        file_name: doc.file_name || '(unknown)',
        file_size: doc.file_size || buf.length,
        sha256,
        extraction_status: extraction,
        match_status: match,
        detail,
      };
    }),
  );

  // Required documents that were not supplied at all.
  const providedTypes = new Set(
    documents.filter((d) => d.extraction_status !== 'MISSING').map((d) => d.doc_type),
  );
  const missingRequired = REQUIRED_DOC_TYPES.filter((t) => !providedTypes.has(t));

  // Aggregate the document check.
  const anyCorrupt = documents.some((d) => d.extraction_status === 'CORRUPT');
  const anyMismatch = documents.some((d) => d.match_status === 'MISMATCH');
  const anyUnverified = documents.some(
    (d) => d.extraction_status === 'UNAVAILABLE' && d.match_status === 'UNVERIFIED',
  );

  let status: CheckStatus;
  let detail: string;
  if (anyCorrupt) {
    status = 'FAIL';
    detail = 'One or more documents are invalid or corrupt.';
  } else if (anyMismatch) {
    status = 'FAIL';
    detail = 'Extracted document content does not match the submitted organization identity.';
  } else if (missingRequired.length > 0) {
    status = 'PENDING';
    detail = `Awaiting required document(s): ${missingRequired.join(', ')}.`;
  } else if (anyUnverified) {
    status = 'PENDING';
    detail =
      'Documents received but could not be automatically read (OCR unavailable); pending manual review.';
  } else {
    status = 'PASS';
    detail = 'All required documents were hashed and their content matches the submitted identity.';
  }

  return {
    check: { id: 'document_verification', label: 'Document verification (hash + extraction)', status, detail },
    documents,
  };
}

function checkOfficialSource(input: OrgVerificationInput): VerificationCheck {
  const rec = findRegistryRecord(input);

  if (!rec) {
    return {
      id: 'official_source',
      label: 'Official-source verification (accreditation registry)',
      status: 'PENDING',
      detail:
        'Organization was not found in the configured accreditation registry; official confirmation is unavailable in this environment.',
    };
  }

  const regMatches = normalizeReg(input.reg_number || '') === normalizeReg(rec.regNumber);
  const submittedName = normalizeName(input.name || '');
  const recName = normalizeName(rec.name);
  const nameConsistent =
    submittedName === recName ||
    submittedName.includes(recName) ||
    recName.includes(submittedName);

  // Strong match on registration number, OR a domain/name match with a consistent
  // legal name, confirms the official source. A domain match whose submitted legal
  // name contradicts the registry record is a FAIL (identity mismatch).
  if (regMatches || nameConsistent) {
    return {
      id: 'official_source',
      label: 'Official-source verification (accreditation registry)',
      status: 'PASS',
      detail: `Matched official record "${rec.name}" (${rec.regNumber}) in ${rec.source}.`,
    };
  }

  return {
    id: 'official_source',
    label: 'Official-source verification (accreditation registry)',
    status: 'FAIL',
    detail: `Submitted legal name does not match the official registry record for domain "${rec.domain}".`,
  };
}

function checkEmailDomain(input: OrgVerificationInput): VerificationCheck {
  const domain = extractDomain(input.official_email || '');
  if (!domain) {
    return {
      id: 'email_domain',
      label: 'Institutional email / domain verification',
      status: 'FAIL',
      detail: 'Official email is missing or malformed.',
    };
  }

  if (PUBLIC_EMAIL_PROVIDERS.includes(domain)) {
    return {
      id: 'email_domain',
      label: 'Institutional email / domain verification',
      status: 'FAIL',
      detail: `"${domain}" is a public email provider and cannot serve as an official institutional domain.`,
    };
  }

  const siteDomain = extractDomain(input.website || '');
  if (
    siteDomain &&
    domain !== siteDomain &&
    !domain.endsWith(siteDomain) &&
    !siteDomain.endsWith(domain)
  ) {
    return {
      id: 'email_domain',
      label: 'Institutional email / domain verification',
      status: 'PENDING',
      detail: `Email domain "${domain}" does not align with the stated website domain "${siteDomain}"; requires review.`,
    };
  }

  const institutional = RECOGNIZED_INSTITUTIONAL_SUFFIXES.some((suf) => domain.endsWith(suf));
  if (institutional) {
    return {
      id: 'email_domain',
      label: 'Institutional email / domain verification',
      status: 'PASS',
      detail: `"${domain}" is a recognized institutional domain.`,
    };
  }

  return {
    id: 'email_domain',
    label: 'Institutional email / domain verification',
    status: 'PENDING',
    detail: `"${domain}" is a custom domain that could not be confirmed as institutional; requires review.`,
  };
}

// ---- aggregation -----------------------------------------------------------

function aggregate(checks: VerificationCheck[]): OrgVerificationDecision {
  if (checks.some((c) => c.status === 'FAIL')) return 'VERIFICATION_FAILED';
  if (checks.some((c) => c.status === 'PENDING')) return 'PENDING_VERIFICATION';
  return 'VERIFIED';
}

function docStatusFromCheck(check: VerificationCheck): 'VERIFIED' | 'PENDING' | 'FAILED' {
  if (check.status === 'FAIL') return 'FAILED';
  if (check.status === 'PENDING') return 'PENDING';
  return 'VERIFIED';
}

function messageFor(status: OrgVerificationDecision): string {
  switch (status) {
    case 'VERIFIED':
      return 'Organization verified against all required checks. Proceed to owner device binding.';
    case 'PENDING_VERIFICATION':
      return 'Verification is pending. Some checks could not be automatically completed and require manual review or additional documents.';
    case 'VERIFICATION_FAILED':
      return 'Verification failed. One or more mandatory checks did not pass. Review the evidence below and resubmit.';
  }
}

/**
 * Run the full Stage-1 verification. Independent checks execute concurrently.
 * Returns a structured, evidence-backed result. This function performs NO
 * database writes — persistence is the endpoint's responsibility.
 */
export async function runOrganizationVerification(
  input: OrgVerificationInput,
): Promise<OrgVerificationResult> {
  const infoCheck = checkRegistrationInfo(input);

  // Independent checks run concurrently.
  const [docResult, officialCheck, emailCheck] = await Promise.all([
    checkDocuments(input),
    Promise.resolve(checkOfficialSource(input)),
    Promise.resolve(checkEmailDomain(input)),
  ]);

  const checks: VerificationCheck[] = [
    infoCheck,
    docResult.check,
    officialCheck,
    emailCheck,
  ];

  const status = aggregate(checks);

  // Append an informational decision row so the UI can show substep 5.
  checks.push({
    id: 'decision',
    label: 'Rule-based decision',
    status: status === 'VERIFIED' ? 'PASS' : status === 'PENDING_VERIFICATION' ? 'PENDING' : 'FAIL',
    detail: messageFor(status),
  });

  return {
    status,
    verificationMethod: 'RULE_BASED_ENGINE_V1',
    verificationSource: officialCheck.status === 'PASS' ? officialCheck.detail : null,
    verificationDate: new Date().toISOString(),
    documentVerificationStatus: docStatusFromCheck(docResult.check),
    message: messageFor(status),
    evidence: {
      checks,
      documents: docResult.documents,
    },
  };
}

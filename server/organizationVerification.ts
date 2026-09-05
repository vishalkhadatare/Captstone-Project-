export type OrganizationVerificationStatus =
  | 'VERIFIED'
  | 'PENDING_VERIFICATION'
  | 'VERIFICATION_FAILED';

export interface OrganizationVerificationDecision {
  status: OrganizationVerificationStatus;
  verificationMethod: string;
  verificationSource: string;
  verificationDate: string;
  documentVerificationStatus: 'VERIFIED' | 'PENDING' | 'FAILED';
  message: string;
}

export interface OrganizationVerificationInput {
  organizationName?: string;
  organizationType?: string;
  registrationId?: string;
  officialVerificationAvailable?: boolean;
  requiredDocumentsUploaded?: boolean;
  detailsMatch?: boolean;
  verificationSource?: string;
}

export function getOrganizationVerificationSource(organizationType?: string): string {
  const type = (organizationType || '').trim().toLowerCase();

  if (type.includes('llp')) return 'MCA / LLPIN verification';
  if (type.includes('msme') || type.includes('udyam')) return 'Udyam / MSME verification';
  if (type.includes('gst')) return 'GSTIN verification';
  if (type.includes('university') || type.includes('college')) return 'Institutional registration authority verification';
  if (type.includes('trust') || type.includes('society')) return 'Trust / Society registration authority verification';
  return 'MCA / CIN verification';
}

export function evaluateOrganizationVerification(input: OrganizationVerificationInput): OrganizationVerificationDecision {
  const organizationName = (input.organizationName || '').trim();
  const registrationId = (input.registrationId || '').trim();
  const organizationType = input.organizationType || 'Company';
  const officialVerificationAvailable = input.officialVerificationAvailable ?? false;
  const requiredDocumentsUploaded = input.requiredDocumentsUploaded ?? false;
  const detailsMatch = input.detailsMatch ?? true;
  const allowLocalDevelopmentAutoVerification = process.env.NODE_ENV === 'development' || process.env.DEV_AUTO_VERIFY_ORG === 'true';

  if (!organizationName || !registrationId) {
    return {
      status: 'VERIFICATION_FAILED',
      verificationMethod: 'Official Source + Document Verification',
      verificationSource: input.verificationSource || getOrganizationVerificationSource(organizationType),
      verificationDate: new Date().toISOString(),
      documentVerificationStatus: 'FAILED',
      message: 'Organization Verification Failed: required organization information is missing.',
    };
  }

  if (!detailsMatch) {
    return {
      status: 'VERIFICATION_FAILED',
      verificationMethod: 'Official Source + Document Verification',
      verificationSource: input.verificationSource || getOrganizationVerificationSource(organizationType),
      verificationDate: new Date().toISOString(),
      documentVerificationStatus: 'FAILED',
      message: 'Organization details could not be verified because the submitted information does not match the available registration information.',
    };
  }

  if (allowLocalDevelopmentAutoVerification) {
    return {
      status: 'VERIFIED',
      verificationMethod: 'Official Source + Document Verification',
      verificationSource: input.verificationSource || getOrganizationVerificationSource(organizationType),
      verificationDate: new Date().toISOString(),
      documentVerificationStatus: 'VERIFIED',
      message: '✓ Organization Verified',
    };
  }

  if (!requiredDocumentsUploaded) {
    return {
      status: 'PENDING_VERIFICATION',
      verificationMethod: 'Official Source + Document Verification',
      verificationSource: input.verificationSource || getOrganizationVerificationSource(organizationType),
      verificationDate: new Date().toISOString(),
      documentVerificationStatus: 'PENDING',
      message: 'We could not automatically verify all organization details. Please provide the required information or retry verification.',
    };
  }

  if (!officialVerificationAvailable) {
    return {
      status: 'PENDING_VERIFICATION',
      verificationMethod: 'Official Source + Document Verification',
      verificationSource: input.verificationSource || getOrganizationVerificationSource(organizationType),
      verificationDate: new Date().toISOString(),
      documentVerificationStatus: 'PENDING',
      message: 'We could not automatically verify all organization details. Please provide the required information or retry verification.',
    };
  }

  return {
    status: 'VERIFIED',
    verificationMethod: 'Official Source + Document Verification',
    verificationSource: input.verificationSource || getOrganizationVerificationSource(organizationType),
    verificationDate: new Date().toISOString(),
    documentVerificationStatus: 'VERIFIED',
    message: '✓ Organization Verified',
  };
}

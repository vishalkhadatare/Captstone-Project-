import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateOrganizationVerification } from './organizationVerification';

test('invalid registration is rejected', () => {
  const result = evaluateOrganizationVerification({
    organizationName: 'ABC Technologies Pvt Ltd',
    organizationType: 'Company',
    registrationId: '',
    officialVerificationAvailable: true,
    requiredDocumentsUploaded: true,
    detailsMatch: true,
  });

  assert.equal(result.status, 'VERIFICATION_FAILED');
  assert.match(result.message, /Organization Verification Failed|verification/i);
});

test('official source unavailable keeps the organization pending', () => {
  const result = evaluateOrganizationVerification({
    organizationName: 'ABC Technologies Pvt Ltd',
    organizationType: 'Company',
    registrationId: 'U72900DL2020PTC123456',
    officialVerificationAvailable: false,
    requiredDocumentsUploaded: true,
    detailsMatch: true,
  });

  assert.equal(result.status, 'PENDING_VERIFICATION');
  assert.match(result.message, /Verification Pending|required information/i);
});

test('matching official verification with documents is verified', () => {
  const result = evaluateOrganizationVerification({
    organizationName: 'ABC Technologies Pvt Ltd',
    organizationType: 'Company',
    registrationId: 'U72900DL2020PTC123456',
    officialVerificationAvailable: true,
    requiredDocumentsUploaded: true,
    detailsMatch: true,
    verificationSource: 'MCA / CIN verification',
  });

  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.verificationMethod, 'Official Source + Document Verification');
});

test('development mode auto-verifies organizations that are otherwise incomplete', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDevFlag = process.env.DEV_AUTO_VERIFY_ORG;
  process.env.NODE_ENV = 'development';
  delete process.env.DEV_AUTO_VERIFY_ORG;

  try {
    const result = evaluateOrganizationVerification({
      organizationName: 'ABC Technologies Pvt Ltd',
      organizationType: 'Company',
      registrationId: 'U72900DL2020PTC123456',
      officialVerificationAvailable: false,
      requiredDocumentsUploaded: false,
      detailsMatch: true,
    });

    assert.equal(result.status, 'VERIFIED');
    assert.match(result.message, /Organization Verified|Verified/i);
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (previousDevFlag === undefined) {
      delete process.env.DEV_AUTO_VERIFY_ORG;
    } else {
      process.env.DEV_AUTO_VERIFY_ORG = previousDevFlag;
    }
  }
});

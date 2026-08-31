import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  DEVICE_STATUS,
  canApproveOrRejectDevice,
  createDeviceChallenge,
  initialStatusForNewDevice,
  isLocalDevAutoApprovalEnabled,
  normalizeStoredStatus,
  resolveNewDeviceStatus,
  verifyDeviceChallengeSignature,
} from './deviceBinding.ts';

test('device challenge round-trip verifies a valid signature', () => {
  const challenge = createDeviceChallenge();
  const keyPair = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });

  const signature = crypto.sign(null, Buffer.from(challenge, 'utf8'), {
    key: keyPair.privateKey,
    dsaEncoding: 'ieee-p1363',
  });

  assert.equal(
    verifyDeviceChallengeSignature({
      challenge,
      signature: signature.toString('base64'),
      publicKeyPem: keyPair.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
    }),
    true,
  );
});

test('device challenge verification rejects a mismatched signature', () => {
  const challenge = createDeviceChallenge();
  const keyPair = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const otherKeyPair = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });

  const signature = crypto.sign(null, Buffer.from(challenge, 'utf8'), {
    key: otherKeyPair.privateKey,
    dsaEncoding: 'ieee-p1363',
  });

  assert.equal(
    verifyDeviceChallengeSignature({
      challenge,
      signature: signature.toString('base64'),
      publicKeyPem: keyPair.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
    }),
    false,
  );
});

test('device challenge verification rejects a non-P-256 public key', () => {
  const challenge = createDeviceChallenge();
  const keyPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const signature = crypto.sign('sha256', Buffer.from(challenge, 'utf8'), keyPair.privateKey);

  assert.equal(
    verifyDeviceChallengeSignature({
      challenge,
      signature: signature.toString('base64'),
      publicKeyPem: keyPair.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
    }),
    false,
  );
});

test('the founding org-owner device bootstraps as approved; every other device is pending', () => {
  // Root of trust: the first owner device in an org (no approved owner device yet) auto-approves.
  assert.equal(initialStatusForNewDevice({ role: 'ORG_OWNER', orgId: 'org-a', existingApprovedOrgOwnerDevices: 0 }), DEVICE_STATUS.APPROVED);
  // Additional owner devices still require explicit approval.
  assert.equal(initialStatusForNewDevice({ role: 'ORG_OWNER', orgId: 'org-a', existingApprovedOrgOwnerDevices: 1 }), DEVICE_STATUS.PENDING);
  // Non-owner roles always require approval, regardless of how many owner devices exist.
  assert.equal(initialStatusForNewDevice({ role: 'SME', orgId: 'org-a', existingApprovedOrgOwnerDevices: 0 }), DEVICE_STATUS.PENDING);
  assert.equal(initialStatusForNewDevice({ role: 'EXAM_MANAGER', orgId: 'org-a', existingApprovedOrgOwnerDevices: 99 }), DEVICE_STATUS.PENDING);
  assert.equal(normalizeStoredStatus('TRUSTED'), DEVICE_STATUS.APPROVED);
});

test('local development auto-approval bypasses the pending approval loop', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';

  try {
    assert.equal(isLocalDevAutoApprovalEnabled(), true);
    assert.equal(resolveNewDeviceStatus({ role: 'SME', orgId: 'org-a', existingApprovedOrgOwnerDevices: 0 }), DEVICE_STATUS.APPROVED);
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

test('device authority policy blocks self approval, unauthorized roles, and cross-organization access', () => {
  assert.equal(canApproveOrRejectDevice({ actorId: 'owner', actorRole: 'ORG_OWNER', actorOrgId: 'org-a', targetUserId: 'user', targetOrgId: 'org-a' }).allowed, true);
  assert.equal(canApproveOrRejectDevice({ actorId: 'owner', actorRole: 'ORG_OWNER', actorOrgId: 'org-a', targetUserId: 'owner', targetOrgId: 'org-a' }).reason, 'SELF_APPROVAL_FORBIDDEN');
  assert.equal(canApproveOrRejectDevice({ actorId: 'manager', actorRole: 'EXAM_MANAGER', actorOrgId: 'org-a', targetUserId: 'user', targetOrgId: 'org-a' }).reason, 'UNAUTHORIZED_DEVICE_ACCESS');
  assert.equal(canApproveOrRejectDevice({ actorId: 'auditor', actorRole: 'AUDITOR', actorOrgId: 'org-a', targetUserId: 'user', targetOrgId: 'org-b' }).reason, 'DEVICE_ORGANIZATION_MISMATCH');
});

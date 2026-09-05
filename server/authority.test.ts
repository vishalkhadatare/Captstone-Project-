import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canDelegateRole,
  canManageAuthority,
  evaluateDelegation,
  evaluateAuthorityManagement,
  getDelegatableRoles,
  getPermissionsForRole,
  hasPermission,
  isAuthorizationActive,
  planAuthorityAudit,
  DELEGATION_REASON,
  ROLE_PERMISSIONS,
} from './authority.ts';

// ---------------------------------------------------------------------------
// Allowed delegations (Task 4 tests 1–5)
// ---------------------------------------------------------------------------

test('1. ORG_OWNER -> EXAM_MANAGER delegation succeeds', () => {
  assert.equal(canDelegateRole('ORG_OWNER', 'EXAM_MANAGER'), true);
  const decision = evaluateDelegation({ actorRole: 'ORG_OWNER', actorOrgId: 'org-a', targetRole: 'EXAM_MANAGER', targetOrgId: 'org-a' });
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, DELEGATION_REASON.ALLOWED);
});

test('2. ORG_OWNER -> AUDITOR delegation succeeds', () => {
  assert.equal(canDelegateRole('ORG_OWNER', 'AUDITOR'), true);
  assert.equal(evaluateDelegation({ actorRole: 'ORG_OWNER', actorOrgId: 'org-a', targetRole: 'AUDITOR', targetOrgId: 'org-a' }).allowed, true);
});

test('3. EXAM_MANAGER -> SME delegation succeeds', () => {
  assert.equal(canDelegateRole('EXAM_MANAGER', 'SME'), true);
  assert.equal(evaluateDelegation({ actorRole: 'EXAM_MANAGER', actorOrgId: 'org-a', targetRole: 'SME', targetOrgId: 'org-a' }).allowed, true);
});

test('4. EXAM_MANAGER -> TRANSLATOR delegation succeeds', () => {
  assert.equal(canDelegateRole('EXAM_MANAGER', 'TRANSLATOR'), true);
  assert.equal(evaluateDelegation({ actorRole: 'EXAM_MANAGER', actorOrgId: 'org-a', targetRole: 'TRANSLATOR', targetOrgId: 'org-a' }).allowed, true);
});

test('5. EXAM_MANAGER -> CENTRE_OPERATOR delegation succeeds', () => {
  assert.equal(canDelegateRole('EXAM_MANAGER', 'CENTRE_OPERATOR'), true);
  assert.equal(evaluateDelegation({ actorRole: 'EXAM_MANAGER', actorOrgId: 'org-a', targetRole: 'CENTRE_OPERATOR', targetOrgId: 'org-a' }).allowed, true);
});

// ---------------------------------------------------------------------------
// Denied delegations (Task 4 tests 6–8)
// ---------------------------------------------------------------------------

test('6. SME -> EXAM_MANAGER delegation fails (privilege escalation)', () => {
  assert.equal(canDelegateRole('SME', 'EXAM_MANAGER'), false);
  const decision = evaluateDelegation({ actorRole: 'SME', actorOrgId: 'org-a', targetRole: 'EXAM_MANAGER', targetOrgId: 'org-a' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, DELEGATION_REASON.PRIVILEGE_ESCALATION);
  assert.equal(decision.isEscalation, true);
});

test('7. TRANSLATOR -> AUDITOR delegation fails (privilege escalation)', () => {
  assert.equal(canDelegateRole('TRANSLATOR', 'AUDITOR'), false);
  const decision = evaluateDelegation({ actorRole: 'TRANSLATOR', actorOrgId: 'org-a', targetRole: 'AUDITOR', targetOrgId: 'org-a' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, DELEGATION_REASON.PRIVILEGE_ESCALATION);
});

test('8. CENTRE_OPERATOR -> EXAM_MANAGER delegation fails (privilege escalation)', () => {
  assert.equal(canDelegateRole('CENTRE_OPERATOR', 'EXAM_MANAGER'), false);
  const decision = evaluateDelegation({ actorRole: 'CENTRE_OPERATOR', actorOrgId: 'org-a', targetRole: 'EXAM_MANAGER', targetOrgId: 'org-a' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, DELEGATION_REASON.PRIVILEGE_ESCALATION);
});

test('8b. AUDITOR -> EXAM_MANAGER and AUDITOR -> ORG_OWNER both fail', () => {
  assert.equal(canDelegateRole('AUDITOR', 'EXAM_MANAGER'), false);
  assert.equal(canDelegateRole('AUDITOR', 'ORG_OWNER'), false);
  assert.equal(evaluateDelegation({ actorRole: 'AUDITOR', actorOrgId: 'org-a', targetRole: 'ORG_OWNER', targetOrgId: 'org-a' }).allowed, false);
});

// ---------------------------------------------------------------------------
// Cross-organization isolation (Task 4 test 9)
// ---------------------------------------------------------------------------

test('9. cross-organization delegation fails even when the role pairing is otherwise valid', () => {
  const decision = evaluateDelegation({ actorRole: 'ORG_OWNER', actorOrgId: 'org-a', targetRole: 'EXAM_MANAGER', targetOrgId: 'org-b' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, DELEGATION_REASON.ORG_ISOLATION_VIOLATION);

  // Management (revoke/restore/approve) across organizations is likewise denied.
  const mgmt = evaluateAuthorityManagement({ actorRole: 'EXAM_MANAGER', actorOrgId: 'org-a', targetRole: 'SME', targetOrgId: 'org-b' });
  assert.equal(mgmt.allowed, false);
  assert.equal(mgmt.reason, DELEGATION_REASON.ORG_ISOLATION_VIOLATION);
});

// ---------------------------------------------------------------------------
// Self privilege escalation (Task 4 test 10)
// ---------------------------------------------------------------------------

test('10. self privilege escalation fails (no role may grant its own or a higher role)', () => {
  // Granting one's own role is an escalation attempt (equal authority is not delegatable).
  for (const role of ['ORG_OWNER', 'EXAM_MANAGER', 'SME', 'TRANSLATOR', 'CENTRE_OPERATOR', 'AUDITOR'] as const) {
    const decision = evaluateDelegation({ actorRole: role, actorOrgId: 'org-a', targetRole: role, targetOrgId: 'org-a' });
    assert.equal(decision.allowed, false, `${role} must not grant its own role`);
    assert.equal(decision.reason, DELEGATION_REASON.PRIVILEGE_ESCALATION, `${role} self-grant is an escalation`);
  }
  // Reaching above oneself is also an escalation.
  assert.equal(evaluateDelegation({ actorRole: 'EXAM_MANAGER', actorOrgId: 'org-a', targetRole: 'ORG_OWNER', targetOrgId: 'org-a' }).reason, DELEGATION_REASON.PRIVILEGE_ESCALATION);
  // ORG_OWNER skipping the chain to grant a leaf role directly is a hierarchy violation, not escalation.
  const skip = evaluateDelegation({ actorRole: 'ORG_OWNER', actorOrgId: 'org-a', targetRole: 'SME', targetOrgId: 'org-a' });
  assert.equal(skip.allowed, false);
  assert.equal(skip.reason, DELEGATION_REASON.ROLE_HIERARCHY_VIOLATION);
});

// ---------------------------------------------------------------------------
// Revocation is enforced by backend authorization (Task 4 test 11)
// ---------------------------------------------------------------------------

test('11. revoked / suspended / pending authority cannot perform restricted operations', () => {
  // An active, authorized user passes.
  assert.equal(isAuthorizationActive({ status: 'ACTIVE', authorization_status: 'AUTHORIZED' }), true);
  // A revoked user is rejected regardless of a still-valid session token.
  assert.equal(isAuthorizationActive({ status: 'SUSPENDED', authorization_status: 'REVOKED' }), false);
  assert.equal(isAuthorizationActive({ status: 'ACTIVE', authorization_status: 'REVOKED' }), false);
  assert.equal(isAuthorizationActive({ status: 'SUSPENDED', authorization_status: 'AUTHORIZED' }), false);
  // A not-yet-approved (pending) authority also cannot act.
  assert.equal(isAuthorizationActive({ status: 'ACTIVE', authorization_status: 'PENDING' }), false);

  // A revoked EXAM_MANAGER attempting to manage others is still gated at the policy layer,
  // but the decisive control is that the session is rejected before it reaches any handler.
  const mgmt = evaluateAuthorityManagement({ actorRole: 'EXAM_MANAGER', actorOrgId: 'org-a', targetRole: 'SME', targetOrgId: 'org-a' });
  assert.equal(mgmt.allowed, true); // policy allows the pairing…
  assert.equal(isAuthorizationActive({ status: 'SUSPENDED', authorization_status: 'REVOKED' }), false); // …but a revoked session never gets here.
});

// ---------------------------------------------------------------------------
// Audit events for important authority changes (Task 4 test 12)
// ---------------------------------------------------------------------------

test('12. audit events are planned for important authority changes', () => {
  const granted = evaluateDelegation({ actorRole: 'ORG_OWNER', actorOrgId: 'org-a', targetRole: 'EXAM_MANAGER', targetOrgId: 'org-a' });
  const grantPlan = planAuthorityAudit(granted, 'GRANT');
  assert.deepEqual(grantPlan.audit, ['AUTHORITY_GRANTED', 'ROLE_ASSIGNED']);
  assert.equal(grantPlan.security.length, 0);

  const revokePlan = planAuthorityAudit({ allowed: true, reason: DELEGATION_REASON.ALLOWED, isEscalation: false }, 'REVOKE');
  assert.deepEqual(revokePlan.audit, ['AUTHORITY_REVOKED']);

  const restorePlan = planAuthorityAudit({ allowed: true, reason: DELEGATION_REASON.ALLOWED, isEscalation: false }, 'RESTORE');
  assert.deepEqual(restorePlan.audit, ['AUTHORITY_RESTORED']);

  // A denied escalation records the unauthorized attempt AND raises a security event.
  const denied = evaluateDelegation({ actorRole: 'SME', actorOrgId: 'org-a', targetRole: 'EXAM_MANAGER', targetOrgId: 'org-a' });
  const deniedPlan = planAuthorityAudit(denied, 'GRANT');
  assert.deepEqual(deniedPlan.audit, ['UNAUTHORIZED_ROLE_ASSIGNMENT']);
  assert.equal(deniedPlan.security[0].event_type, 'PRIVILEGE_ESCALATION_ATTEMPT');
  assert.equal(deniedPlan.security[0].severity, 'HIGH');
});

// ---------------------------------------------------------------------------
// Supporting policy guarantees
// ---------------------------------------------------------------------------

test('delegatable role sets exactly match the specified hierarchy', () => {
  assert.deepEqual(getDelegatableRoles('ORG_OWNER'), ['EXAM_MANAGER', 'AUDITOR']);
  assert.deepEqual(getDelegatableRoles('EXAM_MANAGER'), ['SME', 'TRANSLATOR', 'CENTRE_OPERATOR']);
  assert.deepEqual(getDelegatableRoles('SME'), []);
  assert.deepEqual(getDelegatableRoles('TRANSLATOR'), []);
  assert.deepEqual(getDelegatableRoles('CENTRE_OPERATOR'), []);
  assert.deepEqual(getDelegatableRoles('AUDITOR'), []);
});

test('authority management follows the hierarchy and never reaches ORG_OWNER', () => {
  assert.equal(canManageAuthority('ORG_OWNER', 'EXAM_MANAGER'), true);
  assert.equal(canManageAuthority('ORG_OWNER', 'SME'), true);
  assert.equal(canManageAuthority('ORG_OWNER', 'ORG_OWNER'), false);
  assert.equal(canManageAuthority('EXAM_MANAGER', 'SME'), true);
  assert.equal(canManageAuthority('EXAM_MANAGER', 'EXAM_MANAGER'), false);
  assert.equal(canManageAuthority('EXAM_MANAGER', 'AUDITOR'), false);
  assert.equal(canManageAuthority('SME', 'TRANSLATOR'), false);
  assert.equal(canManageAuthority('AUDITOR', 'SME'), false);
});

test('least privilege: no role holds an unrestricted admin/wildcard permission', () => {
  for (const role of Object.keys(ROLE_PERMISSIONS)) {
    const perms = getPermissionsForRole(role);
    assert.ok(perms.length > 0, `${role} must have explicit permissions`);
    assert.ok(!perms.includes('*'), `${role} must not have wildcard permission`);
    assert.ok(!perms.some(p => p.endsWith(':*') || p === 'admin'), `${role} must not have admin/wildcard`);
  }
  // Spot-check least privilege boundaries.
  assert.equal(hasPermission('SME', 'questions:verify'), true);
  assert.equal(hasPermission('SME', 'paper:generate'), false);
  assert.equal(hasPermission('CENTRE_OPERATOR', 'delivery:print'), true);
  assert.equal(hasPermission('CENTRE_OPERATOR', 'authority:delegate'), false);
  assert.equal(hasPermission('AUDITOR', 'audit:view'), true);
  assert.equal(hasPermission('AUDITOR', 'authority:delegate'), false);
});

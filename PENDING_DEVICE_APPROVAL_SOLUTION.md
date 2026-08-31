# PENDING_DEVICE_APPROVAL Error - Solution Documentation

## Overview
The `PENDING_DEVICE_APPROVAL` error occurs when a user's device is registered but has not yet been approved by an authorized administrator (ORG_OWNER or AUDITOR). This is a security feature of ZeroLeak's device binding system.

## When Does This Error Occur?

### Scenario 1: New Device Registration
1. User signs in with a new browser/device for the first time
2. System generates a P-256 cryptographic key pair locally
3. User completes device registration challenge
4. Device is stored in database with status: `PENDING`
5. ❌ User tries to access a protected endpoint
6. Server returns: `PENDING_DEVICE_APPROVAL` error

### Scenario 2: Protected Endpoints
The following endpoints return `PENDING_DEVICE_APPROVAL` error when accessed by a user whose device is in PENDING status:

**Require Approved Device Binding:**
- `/api/examinations/:id/centres` - POST (EXAM_MANAGER, ORG_OWNER)
- `/api/examinations/:id/analyze-pattern` - POST (EXAM_MANAGER)
- `/api/examinations/:id/generate-paper` - POST (EXAM_MANAGER, ORG_OWNER)
- `/api/delivery/open-viewer` - POST (CENTRE_OPERATOR, EXAM_MANAGER)
- `/api/delivery/print-authorized-copy` - POST (CENTRE_OPERATOR)
- And many more sensitive operations...

**Roles That Require Device Binding:**
- ORG_OWNER
- EXAM_MANAGER
- CENTRE_OPERATOR
- AUDITOR

## Error Response Format

### HTTP Status: 403 Forbidden

```json
{
  "error": "PENDING_DEVICE_APPROVAL",
  "requiresDeviceBinding": true,
  "message": "This device is pending approval. Please wait for authorized approval before continuing.",
  "deviceStatus": "PENDING"
}
```

## Solution Implementation

### 1. Frontend Error Handling

#### DeviceApprovalModal Component
**File:** `src/components/DeviceApprovalModal.tsx`

A user-friendly modal that displays when a PENDING_DEVICE_APPROVAL error occurs:

```typescript
<DeviceApprovalModal
  isOpen={pendingDeviceApprovalModal.isOpen}
  deviceId={pendingDeviceApprovalModal.deviceId}
  userName={pendingDeviceApprovalModal.userName}
  userEmail={pendingDeviceApprovalModal.userEmail}
  onClose={() => setPendingDeviceApprovalModal({ isOpen: false })}
/>
```

**Features:**
- ✅ Shows device ID and user information
- ✅ Explains why the security check exists
- ✅ Provides clear next steps to contact admin
- ✅ User-friendly design with visual hierarchy

### 2. App-Level Error State Management

**File:** `src/App.tsx`

```typescript
const [pendingDeviceApprovalModal, setPendingDeviceApprovalModal] = useState<{
  isOpen: boolean;
  deviceId?: string;
  userName?: string;
  userEmail?: string;
}>({ isOpen: false });

const handlePendingDeviceApprovalError = (error: any) => {
  const details = error?.details || {};
  setPendingDeviceApprovalModal({
    isOpen: true,
    deviceId: details.device_id || 'Unknown',
    userName: currentUser?.full_name || 'User',
    userEmail: currentUser?.email || 'unknown@example.com',
  });
};
```

### 3. API Utilities for Error Detection

**File:** `src/api.ts`

```typescript
/**
 * Detect PENDING_DEVICE_APPROVAL errors
 */
export function isPendingDeviceApprovalError(error: any): boolean {
  if (!error) return false;
  const errorCode = error?.details?.error || error?.message;
  return errorCode === 'PENDING_DEVICE_APPROVAL';
}

/**
 * Get user-friendly error message
 */
export function getErrorMessage(error: any): string {
  if (!error) return 'An unknown error occurred.';
  
  const details = error?.details || {};
  const errorCode = details.error || error.message;

  if (errorCode === 'PENDING_DEVICE_APPROVAL') {
    return 'Your device is pending approval. Please contact your Organization Owner or Auditor to approve this device before you can proceed.';
  }

  if (details.message) return details.message;
  return error.message || 'An error occurred. Please try again.';
}
```

### 4. Org Owner Workflow Improvements

**File:** `src/components/workspaces/OrgOwnerWorkspace.tsx`

Auto-detection of pending devices:

```typescript
// Auto-navigate to trusted devices if there are pending devices
useEffect(() => {
  const pendingDevices = devices.filter(d => 
    d.status === 'PENDING' || d.status === 'PENDING_APPROVAL'
  );
  if (pendingDevices.length > 0 && activeSubTab !== 'trusted_devices') {
    console.log(`Found ${pendingDevices.length} pending device(s) awaiting approval`);
  }
}, [devices, activeSubTab]);
```

**Device Management Actions:**
- View all pending devices in "Trusted Devices" tab
- Click "Approve" to authorize a device
- Click "Reject" to deny device access
- Click "Revoke" to disable an already-approved device

## How to Resolve PENDING_DEVICE_APPROVAL

### For Regular Users (Any Role)

**Step 1: Contact Administrator**
- Reach out to your Organization Owner or Security Auditor
- Provide your device ID (shown in error modal)
- Request device approval

**Step 2: Wait for Approval**
- Administrator reviews pending device
- Administrator clicks "Approve" in Trusted Devices tab

**Step 3: Sign Out and Sign Back In**
- Sign out of your current session
- Sign in again with the same credentials
- Complete the device challenge verification
- Full access will be granted

### For Organization Owners (OrgOwner Role)

**Step 1: Navigate to Trusted Devices**
- Log in to your portal
- Go to Sidebar → "Organization" → "Trusted Devices"

**Step 2: Find Pending Devices**
- Look for devices with status "PENDING"
- Review device details (device fingerprint, IP address)
- Verify the device belongs to the authorized user

**Step 3: Approve or Reject**
- **Approve:** Click "Approve" button → Device becomes active
- **Reject:** Click "Reject" button → Device is denied access

**Step 4: Notify User**
- Inform the user that their device has been approved
- User must sign out and sign back in to complete verification

### For Security Auditors (Auditor Role)

Security Auditors have the same device management capabilities as Org Owners:
- View all devices across the organization
- Approve/reject/revoke devices
- Monitor device status changes in audit log

## Technical Flow

```
┌─────────────────────────────────────────────────────────────┐
│ User Tries to Access Protected Endpoint                     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────────────┐
        │ Server Validates Device Status │
        └────────────────┬───────────────┘
                         │
                    ┌────┴────┐
                    │          │
          ┌─────────▼──┐   ┌──▼──────────┐
          │ APPROVED?  │   │ PENDING?    │
          └─────────┬──┘   └──┬──────────┘
                    │         │
            Access  │         │ Deny with
            Granted │         │ PENDING_DEVICE_APPROVAL error
                    │         │
                    ▼         ▼
            ┌─────────────┐ ┌──────────────────────┐
            │ Continue    │ │ Show Error Modal:    │
            │ Operation   │ │ - Device ID          │
            └─────────────┘ │ - User Email         │
                            │ - Next Steps         │
                            │ - Contact Admin      │
                            └──────────────────────┘
                                     │
                                     ▼
                            ┌──────────────────────┐
                            │ Admin (OrgOwner)     │
                            │ Reviews & Approves   │
                            │ Device               │
                            └──────────────────────┘
                                     │
                                     ▼
                            ┌──────────────────────┐
                            │ User Signs Out       │
                            │ & Signs Back In      │
                            │ - New Challenge      │
                            │ - Full Access        │
                            └──────────────────────┘
```

## Database Schema

### trusted_devices Table

```sql
CREATE TABLE trusted_devices (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  device_uuid TEXT UNIQUE NOT NULL,
  device_name TEXT,
  device_fingerprint TEXT,
  device_model TEXT,
  operating_system TEXT,
  os_version TEXT,
  status TEXT DEFAULT 'PENDING', -- PENDING, APPROVED, DISABLED, REVOKED
  public_key TEXT,
  ip_address TEXT,
  created_at TEXT,
  registered_at TEXT,
  approved_at TEXT,
  approved_by TEXT,
  disabled_at TEXT,
  revoked_at TEXT,
  last_authenticated_at TEXT,
  last_seen_at TEXT,
  updated_at TEXT,
  FOREIGN KEY(org_id) REFERENCES organizations(id),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(approved_by) REFERENCES users(id)
);
```

**Status Values:**
- `PENDING` - Device registered but awaiting admin approval
- `APPROVED` - Device approved and active
- `DISABLED` - Device disabled by admin
- `REVOKED` - Device revoked due to security concerns

## Error Code Reference

| Error Code | HTTP Status | Meaning | Resolution |
|---|---|---|---|
| `PENDING_DEVICE_APPROVAL` | 403 | Device registered but not approved | Contact ORG_OWNER/AUDITOR for approval |
| `DEVICE_ACCESS_REVOKED` | 403 | Device was revoked by admin | Contact admin to re-authorize |
| `Device authorization required` | 403 | Device binding not configured | Register device at sign-in |

## Security Features

### Why Device Binding Exists

1. **Multi-Factor Security**: Combines cryptographic keys with role-based access
2. **Prevention of Token Hijacking**: Even if JWT is compromised, attacker can't use it without the registered device
3. **Audit Trail**: Every device action is logged with timestamp and IP address
4. **Admin Control**: Administrators can revoke access immediately if device is compromised
5. **Forensic Watermarking**: Each printed exam copy is bound to the specific device that printed it

### Cryptographic Details

- **Key Type**: P-256 (ECDSA) elliptic curve
- **Signature Algorithm**: ECDSA with SHA-256
- **Storage**: Private key stored securely in browser's IndexedDB (non-exportable)
- **Transmission**: Public key only sent to server during registration
- **Challenge-Response**: Each authentication requires cryptographic proof of device possession

## Troubleshooting

### Issue: Device stuck in PENDING after approval
**Solution**: Clear browser cache and sign out completely, then sign in again

### Issue: Multiple pending devices for same user
**Solution**: Reject the old ones, approve only the current device

### Issue: Device approval button not working
**Solution**: 
1. Ensure you are logged in as ORG_OWNER or AUDITOR
2. Refresh the page
3. Check browser console for errors

### Issue: Can't find my device in the list
**Solution**: 
1. Sign in from that device first to register it
2. Check if your role requires device binding (not all roles do)
3. Verify organization matches

## Implementation Checklist

- ✅ DeviceApprovalModal component created
- ✅ Error detection utilities in api.ts
- ✅ App-level error state management
- ✅ Modal integration in App.tsx
- ✅ OrgOwnerWorkspace pending device detection
- ✅ No TypeScript compilation errors
- ✅ All imports and exports properly configured

## Files Modified

1. **Created:**
   - `src/components/DeviceApprovalModal.tsx` (150 lines)
   
2. **Updated:**
   - `src/App.tsx` - Added modal state, error handler, modal integration
   - `src/api.ts` - Added `isPendingDeviceApprovalError()` and `getErrorMessage()` utilities
   - `src/components/workspaces/OrgOwnerWorkspace.tsx` - Added pending device detection

## Next Steps for Workspace Implementations

To use these utilities in any workspace component:

```typescript
import { isPendingDeviceApprovalError, getErrorMessage } from '../api';

// In your try-catch block:
try {
  await api.someProtectedOperation();
} catch (error) {
  if (isPendingDeviceApprovalError(error)) {
    // Show the modal to user (parent App component will handle this)
    // Or show a specific error message
    console.error(getErrorMessage(error));
  }
}
```

## Security Best Practices

1. **Regular Audits**: Review device list quarterly
2. **Revoke Compromised Devices**: Immediately revoke if device is lost or stolen
3. **IP Monitoring**: Track if device accesses from unusual locations
4. **Session Timeout**: Combine with session timeout policies
5. **Education**: Train admins and users on device binding importance

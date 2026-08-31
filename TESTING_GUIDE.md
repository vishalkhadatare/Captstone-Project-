# PENDING_DEVICE_APPROVAL - Manual Testing Guide

## Quick Start Testing

### Prerequisite: Application Running
```bash
# Terminal 1: Start the dev server
cd d:\Projects\AI_ZeroLeak\0leakexam-main
npm run dev
# Server runs on http://localhost:3000
```

## Scenario 1: Test Error Detection & Modal Display

### Test Setup (Org Owner Path)
1. **Sign In as Organization Owner**
   - Open http://localhost:3000 in browser
   - Click "Authorized Operator Sign In" button
   - Email: `owner@nbte.edu.in`
   - Password: `Password123!`
   - This is a NEW device (pending approval)

2. **Trigger Protected Operation**
   - After successful login, navigate to "Organization" → "Examinations"
   - Try to create a new examination by clicking "Create New Exam"
   - **Expected Result:** PENDING_DEVICE_APPROVAL error → Modal appears

### What You Should See in Modal

```
┌─────────────────────────────────────────────────┐
│  ⏰ Device Approval Required                   │
├─────────────────────────────────────────────────┤
│                                                  │
│  Your device is waiting for approval from your │
│  Organization Owner or Security Auditor.       │
│                                                  │
│  Device ID: abc123-def456-ghi789              │
│  User: Owner Name                              │
│  Email: owner@nbte.edu.in                      │
│                                                  │
│  What happened:                                │
│  ✓ Device registered and recognized           │
│  ✓ Account identity verified                   │
│  ⏳ Awaiting administrator approval            │
│                                                  │
│  Next Steps:                                   │
│  1. Contact your Organization Owner or         │
│     Security Auditor                           │
│  2. Provide your Device ID shown above        │
│  3. Wait for approval (usually within 5 min)  │
│  4. Sign out and sign back in                 │
│                                                  │
│  Why This Security Check:                      │
│  Device binding protects exam papers from      │
│  unauthorized access and ensures that only     │
│  trusted devices can manage sensitive content. │
│                                                  │
│                                                  │
│         [✓ Understood, Go Back]               │
└─────────────────────────────────────────────────┘
```

## Scenario 2: Test Device Approval Workflow

### As Organization Owner
1. **In Same Browser, Open New Tab**
   - Create a second "organization admin" role account (if available)
   - OR use same account in a new incognito window
   
2. **Navigate to Device Management**
   - Sidebar → "Organization" → "Trusted Devices"
   - Filter/view "PENDING" devices tab
   - You should see the device from Scenario 1

3. **Approve the Device**
   - Find device with user's name
   - Click "Approve" button
   - Confirm: Status changes to "APPROVED"
   - Note: Approval timestamp should update

### Back in Original Tab
4. **Sign Out and Sign In Again**
   - Click logout button
   - Navigate to http://localhost:3000
   - Sign in with same credentials
   - Complete new device challenge
   
5. **Retry Protected Operation**
   - Go to "Organization" → "Examinations"
   - Try to create exam again
   - **Expected Result:** ✅ Operation succeeds (no PENDING error)

## Scenario 3: Test Error Detection Code

### In Browser Console (F12 → Console tab)

```javascript
// Test 1: Check if error detector works
const testError = {
  details: {
    error: 'PENDING_DEVICE_APPROVAL',
    device_id: 'test-device-123',
    message: 'Device pending approval'
  }
};

// Import from your app (if you add these to window global)
// In production, these utilities are in src/api.ts

// Manual test: This is what the error looks like
console.log('Test Error Object:', testError);
console.log('Error Code:', testError.details.error);
console.log('Is PENDING error:', testError.details.error === 'PENDING_DEVICE_APPROVAL');
```

## Scenario 4: Test API Response Directly

### Using cURL/PowerShell (Without Valid Token)
```powershell
# This will show authentication error (expected)
curl -X GET "http://localhost:3000/api/auth/me" `
  -H "Authorization: Bearer invalid-token" `
  -H "x-device-fingerprint: TEST-DEVICE"

# Response: 403 Forbidden (Session token invalid or expired)
```

### Using Node.js REPL (if available)
```javascript
// In Node.js REPL or script
const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/examinations',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer invalid-token',
    'x-device-fingerprint': 'TEST-DEVICE'
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', JSON.parse(data));
  });
});

req.on('error', (e) => console.error(e));
req.end();
```

## Scenario 5: Test Code Integration

### Verify DeviceApprovalModal Component
```bash
# Check file exists and has correct content
ls -la src/components/DeviceApprovalModal.tsx
```

### Verify API Utilities
```bash
# Check that functions are exported
grep -n "export function isPendingDeviceApprovalError" src/api.ts
grep -n "export function getErrorMessage" src/api.ts
```

### Verify App.tsx Integration  
```bash
# Check modal is imported and used
grep -n "DeviceApprovalModal" src/App.tsx
grep -n "handlePendingDeviceApprovalError" src/App.tsx
```

### Check Compilation
```bash
# In terminal at project root
npm run build  # or npx tsc --noEmit

# Should show: ✅ No errors (or compatible TypeScript warnings only)
```

## Test Data

### Pre-Seeded Users in Database

| Role | Email | Password | Org | Notes |
|------|-------|----------|-----|-------|
| ORG_OWNER | owner@nbte.edu.in | Password123! | NBTE | Can approve devices |
| EXAM_MANAGER | manager@nbte.edu.in | Password123! | NBTE | Requires device binding |
| SME | sme@nbte.edu.in | Password123! | NBTE | No device binding required |
| TRANSLATOR | translator@nbte.edu.in | Password123! | NBTE | No device binding required |
| CENTRE_OPERATOR | operator@nbte.edu.in | Password123! | NBTE | Requires device binding |

**Roles Requiring Device Binding:**
- ORG_OWNER - can approve/manage devices
- EXAM_MANAGER - must use approved device for sensitive operations
- CENTRE_OPERATOR - must use approved device
- AUDITOR - can approve/manage devices globally

**Roles NOT Requiring Device Binding:**
- SME - Subject Matter Expert
- TRANSLATOR - can work without device approval

## Expected Behaviors

### ✅ Success Case
1. User signs in with new device
2. Device registers with status PENDING
3. User tries protected operation
4. PENDING_DEVICE_APPROVAL error returned
5. Modal displays with guidance
6. Admin approves device in Trusted Devices tab
7. User signs out/in again
8. Device now has APPROVED status
9. Protected operation succeeds

### ❌ Error Handling Test
- Try accessing endpoints with invalid token → 401 error
- Try accessing endpoints with valid token but PENDING device → 403 PENDING_DEVICE_APPROVAL
- Try accessing endpoints with valid token and APPROVED device → 200 success
- Try accessing endpoints with revoked device → 403 DEVICE_ACCESS_REVOKED

## Debugging Tips

### If Modal Doesn't Appear
1. Open browser DevTools (F12)
2. Check Console tab for errors
3. Look for error logs about `handlePendingDeviceApprovalError`
4. Verify Redux/state is updating: Look for state changes in React DevTools

### If Device Not in Pending List
1. Check browser local storage for device ID
2. Check server database: `sqlite zeroleak_data.sqlite`
3. Query: `SELECT id, device_uuid, status FROM trusted_devices;`

### If Operation Succeeds (Should Fail)
1. Device might already be approved
2. Try new Incognito/Private browser window to get fresh device
3. Check device status in database

## File Locations for Reference

```
d:\Projects\AI_ZeroLeak\0leakexam-main\
├── src/
│   ├── App.tsx ← Main app with modal state
│   ├── api.ts ← Error detection utilities
│   ├── components/
│   │   └── DeviceApprovalModal.tsx ← Error modal component
│   └── workspaces/
│       └── OrgOwnerWorkspace.tsx ← Device approval interface
├── server/
│   ├── server.ts ← API endpoints (see lines 189, 683, etc.)
│   └── deviceBinding.ts ← Device status logic
└── zeroleak_data.sqlite ← Database file
```

## Common Issues & Fixes

| Issue | Solution |
|-------|----------|
| Server not running | Run `npm run dev` in terminal |
| Port 3000 already in use | Run `lsof -i :3000` then kill process |
| Device status not updating | Restart dev server, clear browser cache |
| Modal appears but is empty | Check browser console for errors, verify state passed correctly |
| Can't find users in dropdown | Restart server, check database seeding |
| Can't approve device | Verify you're logged in as ORG_OWNER or AUDITOR |

## Summary

The PENDING_DEVICE_APPROVAL solution provides:
✅ User-friendly error modal explaining the security requirement
✅ Clear next steps and guidance
✅ Admin interface to approve/reject/revoke devices  
✅ Automatic device detection for pending approvals
✅ Utility functions for other workspace components to handle the error
✅ No breaking changes to existing code
✅ Full TypeScript type safety
✅ Accessible UI design with proper contrast

Happy testing! 🎯

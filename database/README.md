# ZeroLeak Examination Security System - Database Architecture & Setup

This directory contains the official database schema, migrations, and setup guidelines for **ZeroLeak Exam Security Platform**.

## 1. Prerequisites
- **PostgreSQL 14+** (Recommended: PostgreSQL 16 or 18)
- Node.js 18+
- psql CLI (optional, for manual administration)

---

## 2. Quick Setup

### Step 1: Create Database
In PostgreSQL:
```sql
CREATE DATABASE zero_leak;
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env` and configure your credentials:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=zero_leak
DB_USER=postgres
DB_PASSWORD=YourSecurePassword
DATABASE_URL=postgresql://postgres:YourSecurePassword@localhost:5432/zero_leak
```

### Step 3: Apply Schema
The schema is automatically verified and applied on backend startup.
Alternatively, to apply manually via `psql`:
```bash
psql -h localhost -U postgres -d zero_leak -f database/schema.sql
```

---

## 3. Database Schema Overview (38 Core Tables)

### Institutional Identity & Accreditation
1. `organizations` - University/testing agency registration, accreditation status, verification method, domain verification.
2. `aicte_universities` - Top NIRF/AICTE premier institutions reference directory.
3. `authoritative_institutions` - All-India institutional regulatory directory.
4. `organization_verifications` - Audit history of all status transitions and approvals.
5. `organization_documents` - Verification proofs, NAAC/NBA accreditations, and Cloudinary URLs.
6. `authorized_representatives` - Official signatories and legal representatives.

### Access Control & Institutional Roles
7. `authorized_users` - Institutional staff authorized by Organization Owner:
   - **SME (Subject Matter Expert)**: Question vetting & creation enclave.
   - **TRANSLATOR (Linguistic Translator)**: Multi-language question paper translation.
   - **CENTRE_OPERATOR (Centre Superintendent)**: Secure exam centre printing & paper release.
   - **EXAM_MANAGER (Examination Controller)**: Question compilation & paper generation.
   - **AUDITOR (Security & Vigilance Auditor)**: Compliance monitoring and audit trail inspection.
8. `users` - Primary authentication credentials, bcrypt password hashes, and session telemetry.
9. `trusted_devices` - Cryptographic terminal identities (ECDSA-P256 hardware attestation).
10. `device_challenges` - Cryptographic nonces and challenges for multi-factor device binding.
11. `device_replacement_requests` - Approval workflow for lost or upgraded devices.
12. `system_settings` - Global administrative security policies.
13. `device_events` - Device lifecycle telemetry.

### Examination & Question Security Pipeline
14. `examinations` - Exam schedule, blueprint marks, unlock timers, and security modes.
15. `examination_configurations` - Section blueprints and theory patterns.
16. `examination_centres` - Approved testing centres and print quota limits.
17. `questions` - Question bank (MCQs, Theory, LaTeX math, cropped visual figures & diagrams).
18. `question_papers` - Uploaded master question papers and extraction telemetry.
19. `question_verifications` - SME vetting, syllabus alignment, and sign-offs.
20. `question_assignments` - Delegated vetting tasks assigned to SMEs and Translators.
21. `question_translations` - Regional language translations (Hindi, Marathi, Gujarati, etc.).
22. `question_quarantine` - Flagged or leaked question isolation.

### Cryptographic Paper Encryption & Distribution
23. `paper_versions` - Dynamic paper versions generated with zero-leak shuffling.
24. `paper_questions` - Question-to-version mapping.
25. `paper_validation_results` - Automated syllabus and marks distribution validation.
26. `encrypted_papers` - AES-256-GCM ciphertexts with RSA key encapsulation.
27. `key_shares` - Shamir's Secret Sharing (k-of-n quorum key distribution).
28. `paper_release_events` - Cryptographic unlock events at examination centres.
29. `print_copies` - Watermarked, serialized physical copy audit trail (`COPY-000001`...).

### Live Telemetry, Proctoring & Surveillance
30. `audit_events` - Immutable SHA-256 chained transaction audit log.
31. `security_events` - Real-time anomaly detection and risk scoring.
32. `regeneration_events` - Emergency paper invalidation and regeneration records.
33. `notifications` - Broadcast alerts across role workspaces.
34. `exam_attempts` - Candidate exam attempts and automated scoring.
35. `proctor_sessions` - Candidate telemetry (webcam, audio levels, tab switches).
36. `authority_proctor_sessions` - Work-on-Camera surveillance for confidential enclaves.
37. `proctor_events` - Real-time security alerts and shoulder-surfing flags.
38. `proctor_settings` - Configurable penalty risk scores and violation thresholds.

---

## 4. Dual Sync Engine Architecture
ZeroLeak uses a **Unified Dual Sync Engine**:
- **In-Memory SQLite Engine**: High-performance synchronous query layer for ultra-low latency response.
- **PostgreSQL Write-Through Engine**: Asynchronously writes all transactions (`INSERT`, `UPDATE`, `DELETE`) to PostgreSQL.
- **Bi-directional Startup Hydration**: Automatically syncs PostgreSQL database records into the in-memory cache on startup, guaranteeing that all registered users, authorized staff, accreditation records, and exams are instantly accessible.


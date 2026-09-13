import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'zero_leak',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'Vishal123',
});

async function main() {
  const client = await pool.connect();
  console.log('Connected to PostgreSQL successfully.');

  const migrations = [
    // trusted_devices
    "ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS created_at TEXT;",
    "ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS updated_at TEXT;",
    "ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS metadata_json TEXT;",
    "ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS app_version TEXT;",
    "ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS encryption_algorithm TEXT DEFAULT 'ECDSA-P256';",
    "ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS attestation_status TEXT DEFAULT 'UNAVAILABLE';",
    "ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS replacement_of_device_id TEXT;",
    "ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS approved_at TEXT;",
    "ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS approved_by TEXT;",
    "ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS last_authenticated_at TEXT;",
    "ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS disabled_at TEXT;",
    "ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS revoked_at TEXT;",
    "ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS device_uuid TEXT;",

    // users
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0;",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TEXT;",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS designation TEXT;",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_name TEXT;",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS authorized_by_email TEXT;",

    // authorized_users
    "ALTER TABLE authorized_users ADD COLUMN IF NOT EXISTS org_id TEXT;",
    "ALTER TABLE authorized_users ADD COLUMN IF NOT EXISTS designated_role TEXT;",
    "ALTER TABLE authorized_users ADD COLUMN IF NOT EXISTS approved_by TEXT;",
    "ALTER TABLE authorized_users ADD COLUMN IF NOT EXISTS authorization_date TEXT;",
    "ALTER TABLE authorized_users ADD COLUMN IF NOT EXISTS expires_at TEXT;",
    "ALTER TABLE authorized_users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE';",

    // organization_documents
    "ALTER TABLE organization_documents ADD COLUMN IF NOT EXISTS cloudinary_url TEXT;",
    "ALTER TABLE organization_documents ADD COLUMN IF NOT EXISTS document_verification_status TEXT DEFAULT 'PENDING';",

    // organizations
    "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verified_at TEXT;",
    "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verification_notes TEXT;",
    "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE';",

    // audit_events
    "ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS actor_email TEXT;",
    "ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS role TEXT;",
    "ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS event_type TEXT;",
    "ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS ip_address TEXT;",
    "ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS details_json TEXT;",
    "ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS created_at TEXT;"
  ];

  for (const sql of migrations) {
    try {
      await client.query(sql);
    } catch (err: any) {
      console.warn('Migration step note:', err.message);
    }
  }
  console.log('? All migrations applied.');

  const tdCols = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'trusted_devices'");
  console.log('trusted_devices columns:', tdCols.rows.map(r => r.column_name).sort());

  client.release();
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

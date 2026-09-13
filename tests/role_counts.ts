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
  const counts = await client.query('SELECT role, count(*) FROM users GROUP BY role ORDER BY count DESC');
  console.log('PostgreSQL users count by role:');
  console.table(counts.rows);

  const authCounts = await client.query('SELECT assigned_role, count(*) FROM authorized_users GROUP BY assigned_role ORDER BY count DESC');
  console.log('PostgreSQL authorized_users count by assigned_role:');
  console.table(authCounts.rows);

  client.release();
  await pool.end();
}
main();

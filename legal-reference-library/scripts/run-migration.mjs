#!/usr/bin/env node
import pg from 'pg'
import { readFileSync } from 'fs'
import { config } from 'dotenv'

// Load .env.local
config({ path: '.env.local' })

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('Missing DATABASE_URL in .env.local')
  process.exit(1)
}

async function runMigration(sqlFile) {
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  })

  try {
    const sql = readFileSync(sqlFile, 'utf8')
    console.log(`Connecting to database...`)
    await client.connect()
    console.log(`Running migration: ${sqlFile}`)

    const result = await client.query(sql)
    console.log('Migration completed successfully!')
    console.log('Result:', result.command || 'OK')

  } catch (error) {
    console.error('Migration error:', error.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

const sqlFile = process.argv[2]
if (!sqlFile) {
  console.log('Usage: node scripts/run-migration.mjs <sql-file>')
  console.log('Example: node scripts/run-migration.mjs supabase/content_stor_add.sql')
  process.exit(1)
}

runMigration(sqlFile)

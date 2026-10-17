import { createClient } from '@supabase/supabase-js'

/**
 * Supabase client — implementation of "1.2 Supabase project setup" (piano.md).
 *
 * Configuration is read from two environment variables that must be present in
 * `.env.local` (project root):
 *
 *   VITE_SUPABASE_URL              -> project URL
 *   VITE_SUPABASE_PUBLISHABLE_KEY  -> publishable ("anon") key
 *
 * Only the publishable key is used here. The service-role key must never be
 * imported into frontend code.
 *
 * Environment values are never logged, echoed, or included in error messages.
 */

const REQUIRED_ENV_VARS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
] as const

type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number]

// Vite injects `import.meta.env` at build time. A variable that is not defined
// in any env file is `undefined` (never `null`), so we normalise to string.
const env = import.meta.env as unknown as Record<string, string | undefined>

function readEnvVar(name: RequiredEnvVar): string {
  const value = env[name]
  return typeof value === 'string' ? value.trim() : ''
}

const config: Record<RequiredEnvVar, string> = {
  VITE_SUPABASE_URL: '',
  VITE_SUPABASE_PUBLISHABLE_KEY: '',
}

const missingEnvVars: string[] = []

for (const name of REQUIRED_ENV_VARS) {
  const value = readEnvVar(name)
  if (value === '') {
    missingEnvVars.push(name)
  } else {
    config[name] = value
  }
}

if (missingEnvVars.length > 0) {
  throw new Error(
    [
      '[supabase] Missing or empty required environment variable(s):',
      `  ${missingEnvVars.join(', ')}`,
      '',
      'Add them to `.env.local` in the project root (values are in the Supabase',
      'dashboard under Project Settings > API keys), then restart the dev server:',
      'Vite reads env files only at startup.',
      '',
      'Variable values are intentionally not printed.',
    ].join('\n'),
  )
}

/**
 * Single shared Supabase client instance for the whole app.
 * `createClient` keeps its default auth options (session persistence,
 * token auto-refresh, session detection in the URL).
 */
export const supabase = createClient(
  config.VITE_SUPABASE_URL,
  config.VITE_SUPABASE_PUBLISHABLE_KEY,
)

export default supabase

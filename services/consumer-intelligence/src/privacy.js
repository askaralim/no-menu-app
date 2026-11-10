import { fail } from './errors.js'

export async function assertNotErased(client, user, installation, session) {
  if (user && (await client.query('SELECT 1 FROM ci.erased_subjects WHERE user_key=$1', [user])).rowCount) fail(403, 'SUBJECT_ERASED')
  if (installation && session && (await client.query('SELECT 1 FROM ci.erased_sessions WHERE installation_id=$1 AND session_id=$2', [installation, session])).rowCount) fail(403, 'SESSION_ERASED')
}
export function withoutSubjects(payload, subjects) {
  return Object.fromEntries(Object.entries(payload).map(([key, rows]) => [key, rows.filter(row => !subjects.has(row.user_key))]))
}

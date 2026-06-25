/**
 * Verify Supabase project connection and schema.
 * Usage: node --env-file=.env scripts/check-supabase.mjs
 */
const url = process.env.VITE_SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_ANON_KEY;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TABLES = [
  'bills', 'clients', 'vendors', 'templates', 'products', 'items', 'inventory_entries',
  'expenses', 'recurring', 'receipts', 'purchases', 'business_profiles', 'user_settings',
];

function fail(msg) {
  console.error('✗', msg);
  process.exitCode = 1;
}

function ok(msg) {
  console.log('✓', msg);
}

async function tableExists(name) {
  const res = await fetch(`${url}/rest/v1/${name}?select=id&limit=0`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  });
  if (res.status === 200) return true;
  const body = await res.json().catch(() => ({}));
  return body.code !== 'PGRST205';
}

async function main() {
  console.log('Supabase setup check\n');

  if (!url || !anon) {
    fail('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
    return;
  }
  ok(`URL: ${url}`);

  if (!svc) {
    console.log('! SUPABASE_SERVICE_ROLE_KEY not set (optional for scripts)');
  }

  const missing = [];
  for (const t of TABLES) {
    if (await tableExists(t)) ok(`Table: ${t}`);
    else {
      missing.push(t);
      fail(`Table missing: ${t}`);
    }
  }

  if (missing.length) {
    console.log('\n→ Run schema in SQL Editor:');
    console.log(`  https://supabase.com/dashboard/project/${url.match(/https:\/\/([^.]+)/)?.[1]}/sql/new`);
    console.log('  Paste full contents of supabase/schema.sql → Run\n');
  }

  if (svc) {
    const ur = await fetch(`${url}/auth/v1/admin/users`, {
      headers: { apikey: svc, Authorization: `Bearer ${svc}` },
    });
    const data = await ur.json();
    if (ur.ok && Array.isArray(data.users)) {
      ok(`Auth users: ${data.users.length}`);
      data.users.forEach((u) =>
        console.log(`    ${u.email} — ${u.email_confirmed_at ? 'verified' : 'needs confirm'}`)
      );
      if (!data.users.length) {
        console.log('\n→ Create account at http://localhost:3000 or enable Email auth in Dashboard');
      }
    }
  }

  if (!missing.length) {
    console.log('\nAll set. Run: npm run dev');
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

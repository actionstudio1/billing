import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://rzeptkazqjiflnzcrnwr.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/confirm-user.mjs user@email.com');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listErr) {
  console.error('List users failed:', listErr.message);
  process.exit(1);
}

const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (!user) {
  console.error(`No user found for ${email}`);
  process.exit(1);
}

const { data, error } = await admin.auth.admin.updateUserById(user.id, {
  email_confirm: true,
});

if (error) {
  console.error('Confirm failed:', error.message);
  process.exit(1);
}

console.log(`Confirmed: ${data.user.email} — you can Sign In now.`);

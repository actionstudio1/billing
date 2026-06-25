import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://rzeptkazqjiflnzcrnwr.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('Usage: node scripts/fix-user.mjs user@email.com NewPassword');
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
  password,
});

if (error) {
  console.error('Update failed:', error.message);
  process.exit(1);
}

console.log(`Fixed: ${data.user.email}`);
console.log('- Email confirmed');
console.log('- Password reset');
console.log('You can Sign In now.');

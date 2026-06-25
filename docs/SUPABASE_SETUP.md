# Supabase Setup — billing app for retail shop

**Project ID:** `rzeptkazqjiflnzcrnwr`  
**Region:** ap-northeast-1  
**Dashboard:** https://supabase.com/dashboard/project/rzeptkazqjiflnzcrnwr

## 1. Run database schema (one time — required)

1. Open [SQL Editor](https://supabase.com/dashboard/project/rzeptkazqjiflnzcrnwr/sql/new)
2. Paste **entire** contents of `supabase/schema.sql` → **Run**
3. New query → paste `supabase/add_vendors_table.sql` → **Run** (if not already in schema.sql)

## 2. Enable email auth (instant sign-up)

1. **Authentication** → **Providers** → **Email** → **Enable**
2. **Authentication** → **Sign In / Providers** → **Email** → turn **OFF** “Confirm email”
3. Stuck user? Confirm from terminal:
   ```bash
   node --env-file=.env scripts/confirm-user.mjs vishalwork@satyammall.in
   ```

## 3. `.env` (already configured for this project)

```env
VITE_SUPABASE_URL=https://rzeptkazqjiflnzcrnwr.supabase.co
VITE_SUPABASE_ANON_KEY=<anon JWT from Dashboard → Settings → API>
VITE_USE_SUPABASE=true
SUPABASE_SERVICE_ROLE_KEY=<service_role JWT — server/scripts only, never commit>
```

Use the **anon** and **service_role** JWT keys from **Project Settings → API** (the `eyJ...` tokens), not the `sb_publishable_` keys.

## 4. Run the app

```bash
npm install
npm run dev
```

Open http://localhost:3000 → **Create Account** with `vishalwork@satyammall.in` (or Sign In).

## 5. Deploy (Vercel / Netlify)

Environment variables:

| Name | Value |
|------|--------|
| `VITE_SUPABASE_URL` | `https://rzeptkazqjiflnzcrnwr.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | anon JWT only |
| `VITE_USE_SUPABASE` | `true` |

Do **not** put `service_role` on the frontend host.

## 6. Local mode (no cloud)

Set `VITE_USE_SUPABASE=false` in `.env`, then `npm run dev`.

## Security

- Never commit `.env` to GitHub
- Rotate keys if they were shared in chat
- Only `anon` key in browser / Vercel

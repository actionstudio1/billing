import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, Lock, LogIn, UserPlus } from 'lucide-react';

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('signup');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('error');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!cancelled) {
        setSession(s);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!cancelled) {
        setSession(s);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setMessage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        if (err) {
          if (err.message?.toLowerCase().includes('invalid login')) {
            throw new Error('Wrong email or password. Try again or create a new account.');
          }
          throw err;
        }
      } else {
        const trimmedEmail = email.trim().toLowerCase();
        if (!trimmedEmail.includes('@')) {
          throw new Error('Please enter a valid email address (e.g. you@company.com)');
        }
        const { data, error: err } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (err) {
          if (err.message?.toLowerCase().includes('already registered')) {
            throw new Error('This email is already registered. Use Sign In instead.');
          }
          throw err;
        }

        if (data.session) {
          setMessageType('success');
          setMessage('Account created! Opening app…');
          return;
        }

        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (!signInErr && signInData.session) return;

        const needsConfirm = signInErr?.message?.toLowerCase().includes('email not confirmed');
        setMessageType(needsConfirm ? 'info' : 'error');
        setMessage(
          needsConfirm
            ? 'Account created — email not verified yet. Check inbox/spam for the Supabase link, then Sign In. Or disable “Confirm email” in Supabase → Authentication → Email.'
            : (signInErr?.message || 'Account created. Please Sign In with your email and password.'),
        );
        setMode('signin');
      }
    } catch (err) {
      setMessageType('error');
      setMessage(err.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      </div>
    );
  }

  if (!session) {
    const msgColor = messageType === 'success' ? '#16a34a' : messageType === 'info' ? '#2563eb' : '#dc2626';

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', padding: '1.5rem',
      }}>
        <div style={{
          width: '100%', maxWidth: 400, background: 'var(--card-bg)', borderRadius: 12,
          padding: '2rem', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: '1px solid var(--border)',
        }}>
          <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.5rem', color: 'var(--primary)' }}>
            GST Billing
          </h1>
          <p style={{ margin: '0 0 1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {mode === 'signup' ? 'Create a new account to start billing' : 'Sign in to your account'}
          </p>

          <form onSubmit={handleSubmit}>
            <label style={{ display: 'block', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Email</span>
              <div style={{ position: 'relative', marginTop: 4 }}>
                <Mail size={16} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-muted)' }} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@company.com"
                  style={{ width: '100%', padding: '0.6rem 0.6rem 0.6rem 2.25rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                />
              </div>
            </label>

            <label style={{ display: 'block', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Password (min 6 chars)</span>
              <div style={{ position: 'relative', marginTop: 4 }}>
                <Lock size={16} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-muted)' }} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  placeholder="••••••••"
                  style={{ width: '100%', padding: '0.6rem 0.6rem 0.6rem 2.25rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                />
              </div>
            </label>

            {message && (
              <p style={{ color: msgColor, fontSize: '0.85rem', marginBottom: '0.75rem', lineHeight: 1.45 }}>
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              style={{
                width: '100%', padding: '0.7rem', borderRadius: 8, border: 'none',
                background: 'var(--primary)', color: '#fff', fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {mode === 'signin' ? <><LogIn size={18} /> Sign In</> : <><UserPlus size={18} /> Create Account</>}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {mode === 'signin' ? (
              <>No account? <button type="button" onClick={() => { setMode('signup'); setMessage(''); }} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline' }}>Create new account</button></>
            ) : (
              <>Already registered? <button type="button" onClick={() => { setMode('signin'); setMessage(''); }} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline' }}>Sign in</button></>
            )}
          </p>

          {mode === 'signin' && email && (
            <p style={{ textAlign: 'center', marginTop: '0.5rem', fontSize: '0.8rem' }}>
              <button type="button" onClick={resetForm} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}>
                Use a different email
              </button>
            </p>
          )}
        </div>
      </div>
    );
  }

  return children;
}

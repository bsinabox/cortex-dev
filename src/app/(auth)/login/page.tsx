'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

type Mode = 'password' | 'magic' | 'forgot';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [mode, setMode] = useState<Mode>('password');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createBrowserClient();

  // Load saved email on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cortex-dev-email');
      if (saved) {
        setEmail(saved);
        setRememberMe(true);
      }
    } catch {}
  }, []);

  function switchMode(newMode: Mode) {
    setMode(newMode);
    setError(null);
    setMessage(null);
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (rememberMe) {
        localStorage.setItem('cortex-dev-email', email);
      } else {
        localStorage.removeItem('cortex-dev-email');
      }
    } catch {}

    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    router.push('/pipeline');
    router.refresh();
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (rememberMe) {
        localStorage.setItem('cortex-dev-email', email);
      }
    } catch {}

    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/pipeline`,
      },
    });

    if (err) {
      setError(err.message);
    } else {
      setMessage('Check your email for the login link.');
    }
    setLoading(false);
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });

    if (err) {
      setError(err.message);
    } else {
      setMessage('Password reset email sent. Check your inbox.');
    }
    setLoading(false);
  }

  const handleSubmit =
    mode === 'password'
      ? handlePasswordLogin
      : mode === 'magic'
        ? handleMagicLink
        : handleForgotPassword;

  const submitLabel =
    mode === 'password'
      ? loading ? 'Signing in…' : 'Sign in'
      : mode === 'magic'
        ? loading ? 'Sending…' : 'Send magic link'
        : loading ? 'Sending…' : 'Send reset email';

  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-8">
      {/* Header */}
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[10px] bg-[var(--primary)]">
          <svg className="h-7 w-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <path d="M15.5 8.5a5.5 5.5 0 1 0 0 7" />
            <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
          Cortex Dev
        </h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          {mode === 'forgot' ? 'Reset your password' : mode === 'magic' ? 'Sign in with a link' : 'Conductor Operations'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email */}
        <div>
          <label
            htmlFor="email"
            className="mb-1.5 block text-sm font-medium text-[var(--foreground)]"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition-colors focus:border-[var(--primary)]"
          />
        </div>

        {/* Password (only in password mode) */}
        {mode === 'password' && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label
                htmlFor="password"
                className="text-sm font-medium text-[var(--foreground)]"
              >
                Password
              </label>
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="text-xs font-medium text-[var(--primary)] hover:opacity-80"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--background)] px-3 py-2 pr-10 text-sm text-[var(--foreground)] outline-none transition-colors focus:border-[var(--primary)]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Remember me */}
        <div className="flex items-center gap-2">
          <input
            id="remember"
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--border)] accent-[var(--primary)]"
          />
          <label htmlFor="remember" className="text-sm text-[var(--muted-foreground)]">
            Remember my email
          </label>
        </div>

        {/* Error */}
        {error && (
          <p className="rounded-[6px] bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        {/* Success message */}
        {message && (
          <p className="rounded-[6px] bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            {message}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-[8px] bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </form>

      {/* Mode switcher */}
      <div className="mt-5 space-y-2 border-t border-[var(--border)] pt-4 text-center">
        {mode === 'password' && (
          <button
            type="button"
            onClick={() => switchMode('magic')}
            className="text-sm text-[var(--primary)] hover:opacity-80"
          >
            Sign in with a magic link instead
          </button>
        )}
        {mode === 'magic' && (
          <button
            type="button"
            onClick={() => switchMode('password')}
            className="text-sm text-[var(--primary)] hover:opacity-80"
          >
            Sign in with password instead
          </button>
        )}
        {mode === 'forgot' && (
          <button
            type="button"
            onClick={() => switchMode('password')}
            className="text-sm text-[var(--primary)] hover:opacity-80"
          >
            Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}

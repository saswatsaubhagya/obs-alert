'use client';

import { useActionState } from 'react';
import { loginAction } from '../actions';

export default function Login() {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="panel" style={{ width: 340, margin: '14vh auto', display: 'grid', gap: 14 }}>
      <h1 style={{ fontSize: 22 }}>Log in</h1>
      <label>
        Email
        <input name="email" type="email" placeholder="you@example.com" required />
      </label>
      <label>
        Password
        <input name="password" type="password" placeholder="••••••••" required minLength={8} />
      </label>
      {state?.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? 'Logging in…' : 'Log in'}
      </button>
      <a href="/signup" style={{ fontSize: 13, textAlign: 'center' }}>
        Create an account
      </a>
    </form>
  );
}

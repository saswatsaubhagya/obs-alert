'use client';

import { useActionState } from 'react';
import { signupAction } from '../actions';

export default function Signup() {
  const [state, action, pending] = useActionState(signupAction, null);
  return (
    <form action={action} className="panel" style={{ width: 340, margin: '14vh auto', display: 'grid', gap: 14 }}>
      <h1 style={{ fontSize: 22 }}>Create account</h1>
      <label>
        Email
        <input name="email" type="email" placeholder="you@example.com" required />
      </label>
      <label>
        Password
        <input name="password" type="password" placeholder="8+ characters" required minLength={8} />
      </label>
      {state?.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Sign up'}
      </button>
      <a href="/login" style={{ fontSize: 13, textAlign: 'center' }}>
        I already have an account
      </a>
    </form>
  );
}

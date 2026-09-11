'use client';

import { useActionState } from 'react';
import { signupAction } from '../actions';

export default function Signup() {
  const [state, action, pending] = useActionState(signupAction, null);
  return (
    <form action={action} style={{ maxWidth: 320, margin: '10vh auto', display: 'grid', gap: 10 }}>
      <h1>Create account</h1>
      <input name="email" type="email" placeholder="you@example.com" required />
      <input name="password" type="password" placeholder="password (8+ chars)" required minLength={8} />
      {state?.error && <p style={{ color: 'crimson' }}>{state.error}</p>}
      <button disabled={pending}>Sign up</button>
      <a href="/login">I already have an account</a>
    </form>
  );
}

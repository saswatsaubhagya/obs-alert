'use client';

import { useActionState } from 'react';
import { loginAction } from '../actions';

export default function Login() {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} style={{ maxWidth: 320, margin: '10vh auto', display: 'grid', gap: 10 }}>
      <h1>Log in</h1>
      <input name="email" type="email" placeholder="you@example.com" required />
      <input name="password" type="password" placeholder="password" required minLength={8} />
      {state?.error && <p style={{ color: 'crimson' }}>{state.error}</p>}
      <button disabled={pending}>Log in</button>
      <a href="/signup">Create an account</a>
    </form>
  );
}

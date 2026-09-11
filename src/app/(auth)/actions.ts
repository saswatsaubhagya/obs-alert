'use server';

import { redirect } from 'next/navigation';
import { signIn } from '@/auth';
import { createUser } from '@/lib/auth-user';

export async function signupAction(_prev: unknown, form: FormData) {
  const email = String(form.get('email') ?? '');
  const password = String(form.get('password') ?? '');
  const r = await createUser(email, password);
  if ('error' in r) return { error: r.error };
  try {
    await signIn('credentials', { email, password, redirect: false });
  } catch {
    // The account exists at this point; only sign-in failed. Send the user to
    // log in themselves rather than surfacing a 500 for an account that was
    // actually created successfully.
    return { error: 'account created — please log in' };
  }
  redirect('/dashboard');
}

export async function loginAction(_prev: unknown, form: FormData) {
  try {
    await signIn('credentials', {
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
      redirect: false,
    });
  } catch {
    return { error: 'invalid email or password' };
  }
  redirect('/dashboard');
}

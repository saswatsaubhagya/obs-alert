'use server';

import { redirect } from 'next/navigation';
import { signIn } from '@/auth';
import { createUser } from '@/lib/auth-user';

export async function signupAction(_prev: unknown, form: FormData) {
  const email = String(form.get('email') ?? '');
  const password = String(form.get('password') ?? '');
  const r = await createUser(email, password);
  if ('error' in r) return { error: r.error };
  await signIn('credentials', { email, password, redirect: false });
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

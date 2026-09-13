import { redirect } from 'next/navigation';
import { auth } from '@/auth';

// Already signed in? /login and /signup have nothing to offer — go to the app.
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await auth()) redirect('/dashboard');
  return children;
}

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { redirect } from 'next/navigation';
import { verifyCredentials } from '@/lib/auth-user';

export const { handlers, auth, signIn, signOut } = NextAuth({
  // JWT sessions: the Credentials provider cannot use database sessions, and this
  // keeps session reads off the DB on every dashboard request.
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (c) =>
        verifyCredentials(String(c.email ?? ''), String(c.password ?? '')),
    }),
  ],
  callbacks: {
    // Without this, `auth` used directly as middleware defaults to
    // authorized === true and never redirects — it would be a silent no-op.
    authorized: ({ auth }) => !!auth?.user,
    jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      return session;
    },
  },
});

export async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect('/login');
  return id;
}

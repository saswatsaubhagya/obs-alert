import { beforeEach, expect, test, vi } from 'vitest';

// requireUserId() is the guard every tenant boundary in the app sits behind.
// We mock next-auth itself (rather than @/auth, which defines requireUserId
// alongside the auth() it calls) so requireUserId's real logic runs against a
// controllable session.
const authMock = vi.fn();

vi.mock('next-auth', () => ({
  default: () => ({
    handlers: {},
    auth: authMock,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('next-auth/providers/credentials', () => ({
  default: (config: unknown) => config,
}));

beforeEach(() => {
  authMock.mockReset();
});

test('returns the user id when a session is present', async () => {
  authMock.mockResolvedValue({ user: { id: 'user-123' } });
  const { requireUserId } = await import('@/auth');
  await expect(requireUserId()).resolves.toBe('user-123');
});

test('redirects to /login when no session is present', async () => {
  authMock.mockResolvedValue(null);
  const { requireUserId } = await import('@/auth');
  await expect(requireUserId()).rejects.toMatchObject({
    digest: expect.stringContaining('NEXT_REDIRECT;replace;/login'),
  });
});

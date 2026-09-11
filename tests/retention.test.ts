import { beforeEach, expect, test } from 'vitest';
import prisma from '@/lib/db';
import { pruneAlertLogs } from '@/lib/retention';
import { makeUser, resetDb } from './helpers/db';

beforeEach(resetDb);

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

test('deletes logs older than the window and keeps the rest', async () => {
  const { user } = await makeUser();
  for (const [age, text] of [[40, 'old'], [31, 'stale'], [29, 'recent'], [0, 'now']] as const) {
    await prisma.alertLog.create({
      data: {
        userId: user.id,
        eventTypeKey: 'follow',
        payload: {},
        renderedText: text,
        source: 'api',
        createdAt: daysAgo(age),
      },
    });
  }

  expect(await pruneAlertLogs(30)).toBe(2);
  const left = await prisma.alertLog.findMany({ select: { renderedText: true } });
  expect(left.map((r) => r.renderedText).sort()).toEqual(['now', 'recent']);
});

test('pruning an empty table deletes nothing', async () => {
  expect(await pruneAlertLogs(30)).toBe(0);
});

test('defaults to a 30 day window', async () => {
  const { user } = await makeUser();
  await prisma.alertLog.create({
    data: {
      userId: user.id,
      eventTypeKey: 'follow',
      payload: {},
      renderedText: 'old',
      source: 'api',
      createdAt: daysAgo(31),
    },
  });
  expect(await pruneAlertLogs()).toBe(1);
});

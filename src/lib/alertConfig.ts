// Plain module (no 'use server'): pure(ish) functions taking userId explicitly,
// so they are unit-testable without dragging in next/cache or Auth.js.
// Mirrors src/lib/settings.ts.
import prisma from './db';
import { BUILT_IN, type Style } from './eventTypes';
import { sendAlert, type Source } from './sendAlert';

export type ConfigPatch = Partial<{
  enabled: boolean;
  template: string;
  titleTemplate: string | null;
  style: Style;
  durationMs: number;
  imageUrl: string | null;
  soundUrl: string | null;
  soundVolume: number;
  minAmount: number | null;
  locale: string;
}>;

export async function saveConfigFor(userId: string, eventTypeKey: string, patch: ConfigPatch) {
  const t = BUILT_IN[eventTypeKey];
  if (!t) throw new Error('unknown event type');
  await prisma.alertConfig.upsert({
    where: { userId_eventTypeKey: { userId, eventTypeKey } },
    update: patch,
    create: {
      userId,
      eventTypeKey,
      template: t.defaults.template,
      titleTemplate: t.defaults.titleTemplate,
      style: t.defaults.style,
      durationMs: t.defaults.durationMs,
      ...patch,
    },
  });
  return { ok: true as const };
}

// Samples cover every field name used across BUILT_IN. `message` is included
// here because sendFromDashboard/sendAlert still accept and log it as a
// payload field — only the editor's template variable chips (Ruling 11)
// exclude it, because renderAlert never lets it feed text/title.
const SAMPLES: Record<string, string | number> = {
  name: 'TestViewer',
  amount: 500,
  currency: 'USD',
  message: 'this is a test alert',
  months: 3,
  tier: '1',
  viewers: 42,
};

export function sampleValues(eventTypeKey: string): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const f of BUILT_IN[eventTypeKey].fields) {
    if (SAMPLES[f.name] !== undefined) out[f.name] = SAMPLES[f.name];
  }
  return out;
}

export async function sendFromDashboard(userId: string, body: unknown, source: Source) {
  return sendAlert(userId, body, source);
}

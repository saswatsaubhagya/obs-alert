import prisma from './db';
import { BASE_STYLE, BUILT_IN, EVENT_TYPE_KEYS, type Style } from './eventTypes';
import { publish } from './hub';
import { renderAlert, type RenderConfig } from './render';
import { validatePayload } from './validate';

export type Source = 'api' | 'dashboard' | 'test';

export type SendResult =
  | { status: 200; body: { ok: true; alertId: string; delivered: number } }
  | { status: 202; body: { ok: true; delivered: 0; skipped: 'disabled' | 'below_min_amount' } }
  | { status: 400; body: { error: string; type?: string; known?: string[] } };

/** The user's saved config for a type, or the built-in defaults when unsaved. */
export async function effectiveConfig(userId: string, eventTypeKey: string) {
  const t = BUILT_IN[eventTypeKey];
  const row = await prisma.alertConfig.findUnique({
    where: { userId_eventTypeKey: { userId, eventTypeKey } },
  });
  const style: Style = { ...BASE_STYLE, ...t.defaults.style, ...((row?.style as Partial<Style>) ?? {}) };
  return {
    enabled: row?.enabled ?? true,
    minAmount: row?.minAmount ?? null,
    render: {
      template: row?.template ?? t.defaults.template,
      titleTemplate: row ? row.titleTemplate : t.defaults.titleTemplate,
      style,
      durationMs: row?.durationMs ?? t.defaults.durationMs,
      imageUrl: row?.imageUrl ?? null,
      soundUrl: row?.soundUrl ?? null,
      soundVolume: row?.soundVolume ?? 80,
      locale: row?.locale ?? 'en-US',
    } satisfies RenderConfig,
  };
}

export async function sendAlert(userId: string, body: unknown, source: Source): Promise<SendResult> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { status: 400, body: { error: 'body must be a JSON object' } };
  }
  const { type, ...rest } = body as Record<string, unknown>;
  const key = typeof type === 'string' ? type : '';
  if (!BUILT_IN[key]) {
    return { status: 400, body: { error: 'unknown event type', known: EVENT_TYPE_KEYS } };
  }

  const parsed = validatePayload(BUILT_IN[key].fields, rest);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error, type: key } };

  const config = await effectiveConfig(userId, key);
  if (!config.enabled) {
    return { status: 202, body: { ok: true, delivered: 0, skipped: 'disabled' } };
  }
  if (
    config.minAmount !== null &&
    typeof parsed.values.amount === 'number' &&
    parsed.values.amount < config.minAmount
  ) {
    return { status: 202, body: { ok: true, delivered: 0, skipped: 'below_min_amount' } };
  }

  const alert = renderAlert({ eventTypeKey: key, values: parsed.values, config: config.render });
  const delivered = publish(userId, alert);

  await prisma.alertLog.create({
    data: {
      userId,
      eventTypeKey: key,
      payload: parsed.values,
      renderedText: alert.text,
      source,
      deliveredTo: delivered,
    },
  });

  return { status: 200, body: { ok: true, alertId: alert.id, delivered } };
}

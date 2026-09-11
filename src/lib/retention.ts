import prisma from './db';

export async function pruneAlertLogs(days = 30): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const { count } = await prisma.alertLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return count;
}

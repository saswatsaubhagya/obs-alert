import { PrismaClient, Prisma } from '@prisma/client';
import { BUILT_IN } from '../src/lib/eventTypes';

const prisma = new PrismaClient();

async function main() {
  for (const [key, t] of Object.entries(BUILT_IN)) {
    await prisma.eventType.upsert({
      where: { key },
      update: { label: t.label, fields: t.fields as unknown as Prisma.InputJsonValue },
      create: { key, label: t.label, fields: t.fields as unknown as Prisma.InputJsonValue },
    });
  }
  console.log(`seeded ${Object.keys(BUILT_IN).length} event types`);
}

main().finally(() => prisma.$disconnect());

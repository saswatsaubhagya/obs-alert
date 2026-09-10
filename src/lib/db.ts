// ponytail: module-global client, the standard Next.js pattern — dev hot reload
// would otherwise open a new pool per reload.
import { PrismaClient } from '@prisma/client';

const g = globalThis as unknown as { prisma?: PrismaClient };
const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') g.prisma = prisma;

export default prisma;

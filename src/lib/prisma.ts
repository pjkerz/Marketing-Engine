import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

let prismaInstance: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient({
      log: process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['warn', 'error'],
    });
  }
  return prismaInstance;
}

export async function closePrisma(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    logger.info({ module: 'prisma' }, 'Prisma disconnected');
    prismaInstance = null;
  }
}

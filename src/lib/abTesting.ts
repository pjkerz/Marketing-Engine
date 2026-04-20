import { AbTest } from '@prisma/client';
import { getPrisma } from './prisma';

export function assignVariant(sessionId: string, test: AbTest): string {
  const variants = test.variants as Array<{ id: string }>;
  if (!variants?.length) return '';
  // Deterministic: same sessionId always gets same variant
  const idx = parseInt(sessionId.slice(-4), 16) % variants.length;
  return variants[idx]?.id ?? variants[0]!.id;
}

export async function trackVariantEvent(
  testId: string,
  variantId: string,
  eventType: 'impression' | 'click' | 'conversion',
): Promise<void> {
  const prisma = getPrisma();
  const increment = {
    impression: { impressions: { increment: 1 } },
    click: { clicks: { increment: 1 } },
    conversion: { conversions: { increment: 1 } },
  }[eventType];

  const result = await prisma.abTestResult.upsert({
    where: { testId_variantId: { testId, variantId } },
    update: increment,
    create: { testId, variantId, impressions: 0, clicks: 0, conversions: 0, conversionRate: 0 },
  });

  // Recalculate conversion rate
  if (result.clicks > 0) {
    await prisma.abTestResult.update({
      where: { testId_variantId: { testId, variantId } },
      data: { conversionRate: result.conversions / result.clicks },
    });
  }
}

export async function getActiveTest(
  businessId: string,
  type: string,
): Promise<AbTest | null> {
  const prisma = getPrisma();
  return prisma.abTest.findFirst({
    where: { businessId, type, status: 'running' },
  });
}

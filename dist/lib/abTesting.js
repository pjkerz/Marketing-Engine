"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignVariant = assignVariant;
exports.trackVariantEvent = trackVariantEvent;
exports.getActiveTest = getActiveTest;
const prisma_1 = require("./prisma");
function assignVariant(sessionId, test) {
    const variants = test.variants;
    if (!variants?.length)
        return '';
    // Deterministic: same sessionId always gets same variant
    const idx = parseInt(sessionId.slice(-4), 16) % variants.length;
    return variants[idx]?.id ?? variants[0].id;
}
async function trackVariantEvent(testId, variantId, eventType) {
    const prisma = (0, prisma_1.getPrisma)();
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
async function getActiveTest(businessId, type) {
    const prisma = (0, prisma_1.getPrisma)();
    return prisma.abTest.findFirst({
        where: { businessId, type, status: 'running' },
    });
}
//# sourceMappingURL=abTesting.js.map
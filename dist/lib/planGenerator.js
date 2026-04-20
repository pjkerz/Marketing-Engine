"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateWeekPlan = generateWeekPlan;
exports.getMondayOf = getMondayOf;
const prisma_1 = require("./prisma");
const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
function getMondayOf(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday = 0 offset
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}
async function generateWeekPlan(affiliateId, businessId, weekStartDate) {
    const prisma = (0, prisma_1.getPrisma)();
    // Check if plan already exists
    const existing = await prisma.affiliateContentPlan.findUnique({
        where: { affiliateId_weekStartDate: { affiliateId, weekStartDate } },
        include: { slots: true },
    });
    if (existing)
        return { planId: existing.id, slotsCreated: existing.slots.length };
    // Read instance settings
    const instance = await prisma.affiliateInstance.findUnique({ where: { affiliateId } });
    const weeklyTarget = instance?.weeklyPostTarget ?? 5;
    const platforms = instance?.preferredPlatforms?.length
        ? instance.preferredPlatforms
        : ['linkedin'];
    const preferredTimes = (instance?.preferredPostTimes ?? {});
    // Check for posting_time optimisation rule
    const optRule = await prisma.optimisationRule.findUnique({
        where: { businessId_ruleType: { businessId, ruleType: 'posting_time' } },
    });
    const optTimes = optRule?.active ? optRule.config : {};
    // Distribute weeklyTarget slots across platforms and 7 days
    const slots = [];
    let dayIndex = 0;
    for (let i = 0; i < weeklyTarget; i++) {
        const platform = platforms[i % platforms.length];
        const dayOffset = dayIndex % 7;
        dayIndex++;
        const slotDate = new Date(weekStartDate);
        slotDate.setDate(slotDate.getDate() + dayOffset);
        // Determine preferred time for this platform
        const times = optTimes[platform] ?? preferredTimes[platform] ?? ['09:00'];
        const timeStr = times[i % times.length] ?? '09:00';
        const [hours, minutes] = timeStr.split(':').map(Number);
        slotDate.setHours(hours ?? 9, minutes ?? 0, 0, 0);
        slots.push({ platform, scheduledDate: slotDate });
    }
    // Create plan + slots
    const plan = await prisma.affiliateContentPlan.create({
        data: {
            affiliateId,
            businessId,
            weekStartDate,
            status: 'draft',
            slots: {
                create: slots.map(s => ({
                    businessId,
                    platform: s.platform,
                    scheduledDate: s.scheduledDate,
                    status: 'empty',
                })),
            },
        },
        include: { slots: true },
    });
    return { planId: plan.id, slotsCreated: plan.slots.length };
}
//# sourceMappingURL=planGenerator.js.map
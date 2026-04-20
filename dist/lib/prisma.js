"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrisma = getPrisma;
exports.closePrisma = closePrisma;
const client_1 = require("@prisma/client");
const logger_1 = require("./logger");
let prismaInstance = null;
function getPrisma() {
    if (!prismaInstance) {
        prismaInstance = new client_1.PrismaClient({
            log: process.env.NODE_ENV === 'development'
                ? ['query', 'info', 'warn', 'error']
                : ['warn', 'error'],
        });
    }
    return prismaInstance;
}
async function closePrisma() {
    if (prismaInstance) {
        await prismaInstance.$disconnect();
        logger_1.logger.info({ module: 'prisma' }, 'Prisma disconnected');
        prismaInstance = null;
    }
}
//# sourceMappingURL=prisma.js.map
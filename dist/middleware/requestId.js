"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestId = requestId;
const crypto_1 = require("crypto");
function requestId(req, _res, next) {
    req.requestId = `req_${(0, crypto_1.randomBytes)(8).toString('hex')}`;
    req.startTime = Date.now();
    next();
}
//# sourceMappingURL=requestId.js.map
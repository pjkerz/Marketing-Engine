"use strict";
// Sendible REST API client stub
// TODO: implement when Sendible REST API launches
// API base: https://api.sendible.com/api/v1/
// Auth: Basic auth with SENDIBLE_USERNAME:SENDIBLE_API_KEY
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendibleClient = void 0;
class SendibleClient {
    async createPost(params) {
        // TODO: POST https://api.sendible.com/api/v1/message.json
        // Body: { profile_ids: [params.profileId], message: params.message,
        //         scheduled_date: params.scheduleTime, media_urls: [params.mediaUrl] }
        void params;
        throw new Error('Sendible REST API not yet available — use CSV export instead');
    }
    async getProfiles() {
        // TODO: GET https://api.sendible.com/api/v1/services.json
        throw new Error('Sendible REST API not yet available');
    }
}
exports.sendibleClient = new SendibleClient();
//# sourceMappingURL=sendibleClient.js.map
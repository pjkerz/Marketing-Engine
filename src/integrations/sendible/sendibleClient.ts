// Sendible REST API client stub
// TODO: implement when Sendible REST API launches
// API base: https://api.sendible.com/api/v1/
// Auth: Basic auth with SENDIBLE_USERNAME:SENDIBLE_API_KEY

export interface SendiblePost {
  profileId: string;
  message: string;
  scheduleTime: string; // ISO datetime
  mediaUrl?: string;
}

export interface SendibleProfile {
  id: string;
  platform: string;
  name: string;
}

class SendibleClient {
  async createPost(params: SendiblePost): Promise<{ id: string; status: string }> {
    // TODO: POST https://api.sendible.com/api/v1/message.json
    // Body: { profile_ids: [params.profileId], message: params.message,
    //         scheduled_date: params.scheduleTime, media_urls: [params.mediaUrl] }
    void params;
    throw new Error('Sendible REST API not yet available — use CSV export instead');
  }

  async getProfiles(): Promise<SendibleProfile[]> {
    // TODO: GET https://api.sendible.com/api/v1/services.json
    throw new Error('Sendible REST API not yet available');
  }
}

export const sendibleClient = new SendibleClient();

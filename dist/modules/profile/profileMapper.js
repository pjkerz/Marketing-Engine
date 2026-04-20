"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROFILE_DEFAULTS = void 0;
exports.applyDefaults = applyDefaults;
exports.PROFILE_DEFAULTS = {
    humor: 0.2,
    ctaStrength: 'soft',
    desiredEmotion: 'curiosity',
    goal: 'signups',
    format: 'framework',
    voice: 'operator',
    controversy: 'balanced',
    platforms: ['linkedin'],
};
function applyDefaults(profile) {
    return {
        ...profile,
        humor: profile.humor ?? exports.PROFILE_DEFAULTS.humor,
        ctaStrength: profile.ctaStrength ?? exports.PROFILE_DEFAULTS.ctaStrength,
        desiredEmotion: profile.desiredEmotion ?? exports.PROFILE_DEFAULTS.desiredEmotion,
        goal: profile.goal ?? exports.PROFILE_DEFAULTS.goal,
        format: profile.format ?? exports.PROFILE_DEFAULTS.format,
        voice: profile.voice ?? exports.PROFILE_DEFAULTS.voice,
        controversy: profile.controversy ?? exports.PROFILE_DEFAULTS.controversy,
        platforms: profile.platforms?.length ? profile.platforms : exports.PROFILE_DEFAULTS.platforms,
    };
}
//# sourceMappingURL=profileMapper.js.map
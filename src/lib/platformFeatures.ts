export interface FeatureFlags {
  communityEnabled: boolean;
  liveSessionsEnabled: boolean;
  announcementsEnabled: boolean;
  paymentsEnabled: boolean;
}

export const defaultFeatureFlags: FeatureFlags = {
  communityEnabled: true,
  liveSessionsEnabled: true,
  announcementsEnabled: true,
  paymentsEnabled: true,
};

export function extractFeatureFlags(settingsValue: any): FeatureFlags {
  const src = settingsValue?.features || {};
  return {
    communityEnabled: typeof src.communityEnabled === 'boolean' ? src.communityEnabled : true,
    liveSessionsEnabled: typeof src.liveSessionsEnabled === 'boolean' ? src.liveSessionsEnabled : true,
    announcementsEnabled: typeof src.announcementsEnabled === 'boolean' ? src.announcementsEnabled : true,
    paymentsEnabled: typeof src.paymentsEnabled === 'boolean' ? src.paymentsEnabled : true,
  };
}

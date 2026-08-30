import { SaaSProfile, ContentAsset, DistributionChannel } from '@/core/contracts/schemas';

export class DistributionPlanner {
  static planDistribution(
    saasProfile: SaaSProfile,
    asset: ContentAsset,
    requestedChannels?: DistributionChannel[]
  ): {
    eligibleChannels: DistributionChannel[];
    schedulingRules: { publishMode: 'now' | 'schedule'; scheduledAt?: string };
  } {
    const candidateChannels = requestedChannels && requestedChannels.length > 0
      ? requestedChannels
      : (['website', 'webhook'] as DistributionChannel[]);

    const eligibleChannels: DistributionChannel[] = [];

    for (const channel of candidateChannels) {
      if (channel === 'linkedin' && asset.bodyMarkdown.length < 50) {
        continue;
      }
      eligibleChannels.push(channel);
    }

    return {
      eligibleChannels,
      schedulingRules: {
        publishMode: 'now'
      }
    };
  }
}

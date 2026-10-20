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
    // Fail-closed gate: Only assets explicitly and freshly validated as 'READY' are eligible for distribution.
    // Missing, undefined, null, unknown, malformed, or 'REJECTED' status strictly yields zero eligible channels.
    if (!asset || asset.validationStatus !== 'READY' || !asset.bodyMarkdown || asset.bodyMarkdown.trim().length === 0) {
      return {
        eligibleChannels: [],
        schedulingRules: {
          publishMode: 'now'
        }
      };
    }

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

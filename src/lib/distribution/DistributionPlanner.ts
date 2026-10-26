import { SaaSProfile, ContentAsset, DistributionChannel } from '@/core/contracts/schemas';
import { ArtifactLifecycleBoundary } from '@/lib/content/ArtifactLifecycleBoundary';

export class DistributionPlanner {
  static planDistribution(
    saasProfile: SaaSProfile,
    asset: ContentAsset,
    requestedChannels?: DistributionChannel[]
  ): {
    eligibleChannels: DistributionChannel[];
    schedulingRules: { publishMode: 'now' | 'schedule'; scheduledAt?: string };
  } {
    // Phase R5: Fail-closed boundary gate: Only assets explicitly and freshly validated as 'READY' are eligible.
    // Missing, undefined, null, unknown, malformed, 'REJECTED', 'REVIEW_REQUIRED', or stale status strictly yields zero eligible channels.
    const boundaryCheck = ArtifactLifecycleBoundary.verifyPublishableArtifact(asset, { saasProfile });
    if (!boundaryCheck.isEligible) {
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

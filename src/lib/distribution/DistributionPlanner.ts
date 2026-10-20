import { SaaSProfile, ContentAsset, DistributionChannel } from '@/core/contracts/schemas';
import { ContentEvidenceValidator } from '@/lib/intelligence/ContentEvidenceValidator';

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

    // Phase 4: Strict entity isolation between asset target brand and distribution profile
    if (asset.targetBrand && saasProfile?.name) {
      const normAssetBrand = asset.targetBrand.toLowerCase().trim();
      const normProfileBrand = saasProfile.name.toLowerCase().trim();
      if (
        normAssetBrand !== normProfileBrand &&
        !normProfileBrand.includes(normAssetBrand) &&
        !normAssetBrand.includes(normProfileBrand)
      ) {
        return {
          eligibleChannels: [],
          schedulingRules: {
            publishMode: 'now'
          }
        };
      }
    }

    // Phase 4: Stale validation detection via content fingerprinting.
    // If the body content was modified after validation, the validation approval is stale and invalidated.
    if (asset.validationFingerprint) {
      const currentFingerprint = ContentEvidenceValidator.computeValidationFingerprint(
        asset.bodyMarkdown,
        asset.targetBrand || saasProfile?.name
      );
      if (asset.validationFingerprint !== currentFingerprint) {
        return {
          eligibleChannels: [],
          schedulingRules: {
            publishMode: 'now'
          }
        };
      }
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

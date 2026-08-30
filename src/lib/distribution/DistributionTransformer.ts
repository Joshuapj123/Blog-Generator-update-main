import { ContentAsset, DistributionChannel } from '@/core/contracts/schemas';

export class DistributionTransformer {
  static transform(asset: ContentAsset, channel: DistributionChannel): any {
    switch (channel) {
      case 'website':
      case 'wordpress':
      case 'webhook':
        return {
          title: asset.title,
          slug: asset.slug || asset.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          body: asset.bodyMarkdown,
          metaTitle: asset.metaTitle || asset.title,
          metaDescription: asset.metaDescription || '',
          targetKeyword: asset.targetKeyword || '',
          publishedAt: new Date().toISOString()
        };
      case 'linkedin':
        return {
          text: `🚀 Just Published: ${asset.title}\n\n${asset.metaDescription || 'Check out our latest deep-dive.'}\n\nRead the full article at: https://resumecraft.io/blog/${asset.slug || ''}`
        };
      case 'twitter':
        return {
          text: `New post alert! 🚀 "${asset.title}"\n\n${(asset.metaDescription || '').substring(0, 150)}...\n\nRead more here: https://resumecraft.io/blog/${asset.slug || ''}`
        };
      default:
        return {
          title: asset.title,
          content: asset.bodyMarkdown
        };
    }
  }
}

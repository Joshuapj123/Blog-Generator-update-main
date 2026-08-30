import { ArticleBlueprint, SectionBlock } from '@/types/article';

export function renderMarkdown(text: string) {
  return (text || '')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

export function triggerDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function slugify(str: string) {
  return (str || 'article')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export function md(text: string) {
  return (text || '').replace(/\*\*(.*?)\*\*/g, '**$1**').trim();
}

export function markdownTableToHtml(mdTable: string): string {
  if (!mdTable) return '';
  const lines = mdTable.trim().split('\n');
  if (lines.length < 2) return '';
  
  let html = '<div class="table-container" style="overflow-x: auto; margin: 1.5rem 0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border-radius: 0.5rem; border: 1px solid #e5e7eb;">';
  html += '<table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">';
  
  let hasHeaders = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) continue;
    
    // Check if it's separator
    if (i === 1 && line.replace(/[\s|:-]/g, '').length === 0) {
      continue;
    }
    
    const cells = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
    
    if (!hasHeaders) {
      html += '<thead style="background-color: #f9fafb; border-bottom: 2px solid #e5e7eb;"><tr>';
      cells.forEach(cell => {
        html += `<th style="padding: 0.75rem 1rem; font-weight: 600; color: #374151;">${cell}</th>`;
      });
      html += '</tr></thead><tbody>';
      hasHeaders = true;
    } else {
      html += '<tr style="border-bottom: 1px solid #e5e7eb;">';
      cells.forEach(cell => {
        html += `<td style="padding: 0.75rem 1rem; color: #4b5563;">${cell}</td>`;
      });
      html += '</tr>';
    }
  }
  
  if (hasHeaders) {
    html += '</tbody>';
  }
  
  html += '</table></div>';
  return html;
}

export function toMarkdown(bp: Partial<ArticleBlueprint>, secs: SectionBlock[]): string {
  const lines: string[] = [];
  lines.push(`# ${bp.title || 'Untitled'}`);
  lines.push('');
  if (bp.slug) lines.push(`> **Slug:** /${bp.slug}\n`);
  if (bp.intent) lines.push(`> **Intent:** ${bp.intent}\n`);
  lines.push('');

  if (bp.intro) {
    lines.push(md(bp.intro.hook));
    lines.push('');
    if (bp.intro.thesis) lines.push(`> ${bp.intro.thesis}`);
    if (bp.intro.business_context) lines.push(`*${bp.intro.business_context}*`);
    lines.push('');
  }

  const isDefaultMetaText = (text: string, heading?: string): boolean => {
    if (!text) return true;
    const t = text.trim().toLowerCase();
    const cleanT = t.endsWith('.') ? t.slice(0, -1) : t;

    if (cleanT.includes("this section details key execution processes and guidelines")) return true;
    if (cleanT.includes("key execution processes and guidelines")) return true;
    if (cleanT.includes("factual research on")) return true;
    if (cleanT.startsWith("factual research")) return true;
    if (cleanT.includes("takeaway for")) return true;
    if (cleanT.startsWith("takeaway for")) return true;

    if (heading) {
      const hNorm = heading.trim().toLowerCase();
      const cleanHNorm = hNorm.endsWith('.') ? hNorm.slice(0, -1) : hNorm;
      if (cleanT === `factual research on ${cleanHNorm}`) return true;
      if (cleanT === `takeaway for ${cleanHNorm}`) return true;
    }
    return false;
  };

  for (const sec of secs) {
    const level = (sec as any).level === 'H3' ? '###' : '##';
    lines.push(`${level} ${sec.heading}`);
    lines.push('');
    if (sec.what_it_is) lines.push(md(sec.what_it_is) + '\n');
    if (sec.why_it_works && !isDefaultMetaText(sec.why_it_works)) lines.push(md(sec.why_it_works) + '\n');
    if (sec.experience_or_data_point && !isDefaultMetaText(sec.experience_or_data_point, sec.heading)) {
      lines.push(`> **Expert Insight:** ${sec.experience_or_data_point}\n`);
    }
    if (sec.example_brands?.length) lines.push(`**Examples:** ${sec.example_brands.join(', ')}\n`);
    if (Array.isArray(sec.copy_formula) && sec.copy_formula.length) {
      lines.push('**Copy Formula:**');
      sec.copy_formula.forEach((f) => lines.push(`- ${f}`));
      lines.push('');
    }
    if ((sec as any).markdown_table) {
      lines.push((sec as any).markdown_table);
      lines.push('');
    }
    if (sec.takeaway && !isDefaultMetaText(sec.takeaway, sec.heading)) lines.push(`✅ **Takeaway:** ${sec.takeaway}\n`);
    if ((sec as any).outbound_authority_link?.resolved_url) {
      lines.push(`📎 [${(sec as any).outbound_authority_link.resolved_title || 'Source'}](${(sec as any).outbound_authority_link.resolved_url})\n`);
    }
    // Media reference (YouTube or Image)
    const media = (sec as any).rich_media_query;
    if (media) {
      if (media.type === 'image') {
        if (media.image_url) {
          lines.push(`![${media.alt_text || media.suggested_search_query || 'Section Image'}](${media.image_url})\n`);
          if (media.alt_text) lines.push(`*Image: ${media.alt_text}*\n`);
        } else if (media.image_prompt) {
          lines.push(`🖼️ **Image Prompt:** *${media.image_prompt}*\n`);
        }
      } else {
        if (media.youtube_video_id) {
          lines.push(`🎬 **YouTube Reference:** [${media.suggested_search_query || 'Watch Video'}](https://www.youtube.com/watch?v=${media.youtube_video_id})\n`);
        } else if (media.suggested_search_query) {
          lines.push(`🎬 **YouTube Search:** ${media.suggested_search_query}\n`);
        }
      }
    }
  }

  if (bp.cta) {
    lines.push('---');
    lines.push(`## ${bp.cta.heading}`);
    lines.push('');
    lines.push(bp.cta.description || '');
    lines.push('');
    lines.push(`**[${bp.cta.button_text}]**`);
  }

  return lines.join('\n');
}

export function toHtml(bp: Partial<ArticleBlueprint>, secs: SectionBlock[]): string {
  const render = (t: string) =>
    (t || '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n\n/g, '</p><p>');

  const isDefaultMetaText = (text: string, heading?: string): boolean => {
    if (!text) return true;
    const t = text.trim().toLowerCase();
    const cleanT = t.endsWith('.') ? t.slice(0, -1) : t;

    if (cleanT.includes("this section details key execution processes and guidelines")) return true;
    if (cleanT.includes("key execution processes and guidelines")) return true;
    if (cleanT.includes("factual research on")) return true;
    if (cleanT.startsWith("factual research")) return true;
    if (cleanT.includes("takeaway for")) return true;
    if (cleanT.startsWith("takeaway for")) return true;

    if (heading) {
      const hNorm = heading.trim().toLowerCase();
      const cleanHNorm = hNorm.endsWith('.') ? hNorm.slice(0, -1) : hNorm;
      if (cleanT === `factual research on ${cleanHNorm}`) return true;
      if (cleanT === `takeaway for ${cleanHNorm}`) return true;
    }
    return false;
  };

  const sectionsHtml = secs.map((sec) => {
    const tag = (sec as any).level === 'H3' ? 'h3' : 'h2';
    const media = (sec as any).rich_media_query;
    let mediaEmbed = '';
    if (media) {
      if (media.type === 'image') {
        if (media.image_url) {
          mediaEmbed = `<div class="image-embed" style="margin: 1.5rem 0; text-align: center;">
            <img src="${media.image_url}" alt="${media.alt_text || media.suggested_search_query || 'Section Image'}" style="max-width: 100%; height: auto; border-radius: 0.75rem; border: 1px solid #e5e7eb;" />
            ${media.alt_text ? `<div style="font-size: 0.8rem; color: #6b7280; margin-top: 0.5rem; font-style: italic;">${media.alt_text}</div>` : ''}
          </div>`;
        } else if (media.image_prompt) {
          mediaEmbed = `<div class="image-embed-placeholder" style="margin: 1.5rem 0; padding: 1.5rem; background: #f9fafb; border-radius: 0.75rem; border: 1px dashed #d1d5db; text-align: center; font-size: 0.85rem; color: #6b7280;">
            🖼️ <strong>Image Prompt:</strong> <em>${media.image_prompt}</em>
          </div>`;
        }
      } else {
        mediaEmbed = media.youtube_video_id
          ? `<div class="yt-embed"><div class="yt-label">🎬 YouTube Reference${media.suggested_search_query ? ` — ${media.suggested_search_query}` : ''}</div><div class="yt-wrapper"><iframe src="https://www.youtube.com/embed/${media.youtube_video_id}" title="${media.suggested_search_query || 'YouTube video'}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div></div>`
          : media.suggested_search_query
            ? `<div class="yt-embed"><div class="yt-label">🎬 YouTube Search: <em>${media.suggested_search_query}</em></div></div>`
            : '';
      }
    }
    const whyItWorksHtml = sec.why_it_works && !isDefaultMetaText(sec.why_it_works)
      ? `<p>${render(sec.why_it_works)}</p>`
      : '';
    const experienceHtml = sec.experience_or_data_point && !isDefaultMetaText(sec.experience_or_data_point, sec.heading)
      ? `<blockquote><strong>Expert Insight:</strong> ${sec.experience_or_data_point}</blockquote>`
      : '';
    const takeawayHtml = sec.takeaway && !isDefaultMetaText(sec.takeaway, sec.heading)
      ? `<div class="takeaway">✅ ${sec.takeaway}</div>`
      : '';

    return `
    <section class="section">
      <${tag}>${sec.heading}</${tag}>
      <p>${render(sec.what_it_is)}</p>
      ${whyItWorksHtml}
      ${experienceHtml}
      ${sec.example_brands?.length ? `<p><strong>Examples:</strong> ${sec.example_brands.join(', ')}</p>` : ''}
      ${Array.isArray(sec.copy_formula) && sec.copy_formula.length ? `<ul>${sec.copy_formula.map((f) => `<li>${f}</li>`).join('')}</ul>` : ''}
      ${(sec as any).markdown_table ? markdownTableToHtml((sec as any).markdown_table) : ''}
      ${takeawayHtml}
      ${(sec as any).outbound_authority_link?.resolved_url ? `<p>📎 <a href="${(sec as any).outbound_authority_link.resolved_url}" target="_blank">${(sec as any).outbound_authority_link.resolved_title || 'Source'}</a></p>` : ''}
      ${mediaEmbed}
    </section>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${bp.title_tag || bp.title || 'Article'}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 780px; margin: 0 auto; padding: 2rem; line-height: 1.7; color: #1a1a1a; }
    h1 { font-size: 2.4rem; font-weight: 800; margin-bottom: 0.5rem; }
    h2 { font-size: 1.6rem; font-weight: 700; margin-top: 2.5rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.4rem; }
    h3 { font-size: 1.25rem; font-weight: 600; margin-top: 2rem; color: #374151; }
    blockquote { border-left: 4px solid #3b82f6; background: #eff6ff; padding: 0.75rem 1rem; margin: 1rem 0; border-radius: 0 0.5rem 0.5rem 0; }
    .takeaway { background: #ecfdf5; border-left: 4px solid #10b981; padding: 0.75rem 1rem; margin: 1rem 0; border-radius: 0 0.5rem 0.5rem 0; font-weight: 600; }
    .intro-hook { font-size: 1.2rem; color: #374151; font-weight: 600; }
    .thesis { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 0.75rem 1rem; margin: 1rem 0; border-radius: 0 0.5rem 0.5rem 0; }
    .cta { text-align: center; background: linear-gradient(135deg, #eff6ff, #ecfdf5); border: 1px solid #bfdbfe; border-radius: 1rem; padding: 2rem; margin-top: 3rem; }
    .cta h2 { border: none; }
    .btn { display: inline-block; background: #2563eb; color: #fff; padding: 0.75rem 2rem; border-radius: 0.5rem; text-decoration: none; font-weight: 700; margin-top: 1rem; }
    .meta { font-size: 0.8rem; color: #9ca3af; font-family: monospace; background: #f9fafb; padding: 0.4rem 0.75rem; border-radius: 0.375rem; display: inline-block; margin-bottom: 0.5rem; }
    a { color: #2563eb; }
    ul { padding-left: 1.5rem; }
    .section { margin-bottom: 2rem; }
    .yt-embed { margin: 1.5rem 0; border-radius: 0.75rem; overflow: hidden; border: 1px solid #e5e7eb; }
    .yt-label { background: linear-gradient(90deg, #2563eb, #7c3aed); color: #fff; font-size: 0.8rem; font-weight: 600; padding: 0.5rem 1rem; }
    .yt-wrapper { position: relative; padding-bottom: 56.25%; height: 0; }
    .yt-wrapper iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
  </style>
</head>
<body>
  ${bp.slug ? `<span class="meta">/${bp.slug}</span>` : ''}
  <h1>${bp.title || 'Untitled'}</h1>
  ${bp.intent ? `<span class="meta">${bp.intent}</span>` : ''}
  ${bp.intro ? `
  <p class="intro-hook">${render(bp.intro.hook)}</p>
  <div class="thesis"><strong>Thesis:</strong> ${bp.intro.thesis}</div>
  ${bp.intro.business_context ? `<p><em>${bp.intro.business_context}</em></p>` : ''}
  ` : ''}
  ${sectionsHtml}
  ${bp.cta ? `
  <div class="cta">
    <h2>${bp.cta.heading}</h2>
    <p>${bp.cta.description}</p>
    <a class="btn" href="${bp.cta.url || '#'}">${bp.cta.button_text}</a>
  </div>` : ''}
</body>
</html>`;
}

export function toPlainText(bp: Partial<ArticleBlueprint>, secs: SectionBlock[]): string {
  const strip = (t: string) => (t || '').replace(/\*\*(.*?)\*\*/g, '$1').trim();
  const lines: string[] = [];
  lines.push((bp.title || 'Untitled').toUpperCase());
  lines.push('='.repeat(60));
  lines.push('');
  if (bp.intro) {
    lines.push(strip(bp.intro.hook));
    lines.push('');
    if (bp.intro.thesis) lines.push('THESIS: ' + bp.intro.thesis);
    if (bp.intro.business_context) lines.push(bp.intro.business_context);
    lines.push('');
  }
  for (const sec of secs) {
    lines.push((sec as any).level === 'H3' ? `  » ${sec.heading}` : `\n${sec.heading.toUpperCase()}`);
    lines.push('-'.repeat(40));
    if (sec.what_it_is) lines.push(strip(sec.what_it_is));
    if (sec.why_it_works) lines.push(strip(sec.why_it_works));
    if (sec.experience_or_data_point) lines.push('INSIGHT: ' + sec.experience_or_data_point);
    if (sec.example_brands?.length) lines.push('Examples: ' + sec.example_brands.join(', '));
    if (sec.takeaway) lines.push('Takeaway: ' + sec.takeaway);
    if ((sec as any).markdown_table) {
      lines.push((sec as any).markdown_table);
    }
    const media = (sec as any).rich_media_query;
    if (media) {
      if (media.type === 'image') {
        if (media.image_url) {
          lines.push(`Image: ${media.image_url} [Alt: ${media.alt_text || ''}]`);
        } else if (media.image_prompt) {
          lines.push(`Image Prompt: ${media.image_prompt}`);
        }
      } else {
        if (media.youtube_video_id) {
          lines.push(`YouTube Reference: https://www.youtube.com/watch?v=${media.youtube_video_id}  [${media.suggested_search_query || ''}]`);
        } else if (media.suggested_search_query) {
          lines.push(`YouTube Search: ${media.suggested_search_query}`);
        }
      }
    }
    lines.push('');
  }
  if (bp.cta) {
    lines.push('─'.repeat(60));
    lines.push(bp.cta.heading.toUpperCase());
    lines.push(bp.cta.description || '');
  }
  return lines.join('\n');
}

import * as fuzzball from 'fuzzball';

export function isFuzzyMatch(keyword: string, target: string, threshold = 75): boolean {
  if (!keyword || !target) return false;
  // fuzzball.token_set_ratio returns a score from 0 to 100
  const score = fuzzball.token_set_ratio(keyword, target);
  return score >= threshold;
}

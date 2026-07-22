// Stage 7: Content generator — article / social / video script / newsletter
// per angle, limited to each brand's configured channels.
import { askJSON } from '../lib/claude.js';
import { store } from '../lib/store.js';

const FORMAT_SPECS = {
  article: 'SEO blog article, 700-900 words, H2 subheads, cite the source story, end with brand CTA.',
  linkedin: 'LinkedIn post, 150-250 words, strong hook first line, line breaks for scannability, 3 hashtags max.',
  x: 'X/Twitter post, under 280 characters, punchy, no hashtag stuffing.',
  facebook: 'Facebook post, 80-150 words, conversational, ends with a question.',
  instagram: 'Instagram caption, 100-150 words, hook first line, emoji-light, 5 hashtags.',
  video_script: '60-second talking-head video script with [HOOK], [BODY], [CTA] markers. Spoken-word style.',
  newsletter: 'Newsletter section, 200-300 words, subject line + body, personal tone.',
};

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    body: { type: 'string' },
    seo: {
      type: 'object',
      properties: {
        meta_description: { type: 'string' },
        keywords: { type: 'array', items: { type: 'string' } },
        slug: { type: 'string' },
      },
      required: ['meta_description', 'keywords', 'slug'],
      additionalProperties: false,
    },
  },
  required: ['title', 'body', 'seo'],
  additionalProperties: false,
};

// Prototype scope: two formats per brand to keep demo output readable.
const MAX_FORMATS_PER_BRAND = 2;

export async function generateContent(story, angle) {
  const brand = angle.brandConfig;
  const formats = brand.channels.slice(0, MAX_FORMATS_PER_BRAND);
  const drafts = [];

  for (const format of formats) {
    const result = await askJSON({
      system: `You are the content writer for ${brand.name}. Voice: ${brand.voice}\nBanned claims: ${brand.banned_claims.join('; ')}\nOnly state facts present in the verified claims. Attribute the news to its source.`,
      user: [
        `Story: ${story.headline}`,
        `Verified claims: ${JSON.stringify(story.verification?.claims || [])}`,
        `Source URLs: ${(story.source_urls || []).join(', ')}`,
        `Angle: ${angle.angle}`,
        `Hook: ${angle.hook}`,
        `CTA: ${brand.cta}`,
        '',
        `Write: ${FORMAT_SPECS[format]}`,
      ].join('\n'),
      schema: SCHEMA,
      maxTokens: 8000,
      mock: () => mockContent(brand, angle, format, story),
    });

    const [row] = await store.insert('content', {
      story_id: story.id,
      angle_id: angle.id,
      brand: brand.key,
      format,
      ...result,
      status: 'draft',
    });
    drafts.push(row);
    console.log(`[generate] ${brand.key}/${format}: "${result.title.slice(0, 60)}"`);
  }
  return drafts;
}

function mockContent(brand, angle, format, story) {
  const title = `${angle.hook}`;
  const bodies = {
    article: `## ${angle.hook}\n\nThis week's news — "${story.headline}" — matters more than the headlines suggest.\n\n${angle.angle}\n\n${angle.rationale}\n\n### What it means for you\n\nIf you're planning research or AI evaluation work this quarter, the supply of qualified humans just became your critical path.\n\n*Source: ${(story.source_urls || [])[0] || 'industry reports'}*\n\n**${brand.cta}**\n\n[mock draft — DRY_RUN]`,
    linkedin: `${angle.hook}\n\n${angle.angle}\n\nHere's what most people are missing: ${angle.rationale}\n\n${brand.cta}\n\n#MarketResearch #AI #HumanInTheLoop\n\n[mock draft — DRY_RUN]`,
    x: `${angle.hook.slice(0, 200)} [mock]`,
    facebook: `${angle.hook}\n\n${angle.angle}\n\nWhat's your take? [mock draft — DRY_RUN]`,
    instagram: `${angle.hook}\n\n${angle.angle}\n\n#research #AI #insights #humanfeedback #data [mock]`,
    video_script: `[HOOK] ${angle.hook}\n\n[BODY] ${angle.angle} ${angle.rationale}\n\n[CTA] ${brand.cta}\n\n[mock draft — DRY_RUN]`,
    newsletter: `Subject: ${angle.hook}\n\n${angle.angle}\n\n${angle.rationale}\n\n${brand.cta}\n\n[mock draft — DRY_RUN]`,
  };
  return {
    title,
    body: bodies[format] || bodies.linkedin,
    seo: {
      meta_description: angle.angle.slice(0, 155),
      keywords: ['market research', 'AI training data', 'human in the loop'],
      slug: story.headline.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60),
    },
  };
}

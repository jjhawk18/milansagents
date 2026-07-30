// Try to parse one RSS feed; exit 0 with "OK" if it has items.
import Parser from 'rss-parser';

const url = process.argv[2];
const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; newsjack-pipeline)' },
});

try {
  const feed = await parser.parseURL(url);
  if (!feed.items?.length) throw new Error('feed parsed but has no items');
  console.log(`OK    ${url}  →  ${feed.title ?? 'untitled'} (${feed.items.length} items)`);
} catch (err) {
  console.log(`DEAD  ${url}  →  ${String(err.message).slice(0, 80)}`);
  process.exit(1);
}

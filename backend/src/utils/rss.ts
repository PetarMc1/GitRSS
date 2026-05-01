import type { RssFeedOptions, RssItem } from '../types/rss.js';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderItem(item: RssItem): string {
  const description = item.description ? `<description>${escapeXml(item.description)}</description>` : '';

  return [
    '<item>',
    `<title>${escapeXml(item.title)}</title>`,
    `<link>${escapeXml(item.link)}</link>`,
    `<guid>${escapeXml(item.guid)}</guid>`,
    `<pubDate>${item.pubDate.toUTCString()}</pubDate>`,
    description,
    '</item>',
  ].join('');
}

export function generateRssXml(options: RssFeedOptions): string {
  const items = options.items.map(renderItem).join('');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '<channel>',
    `<title>${escapeXml(options.title)}</title>`,
    `<description>${escapeXml(options.description)}</description>`,
    `<link>${escapeXml(options.link)}</link>`,
    ...[items],
    '</channel>',
    '</rss>',
  ].join('');
}

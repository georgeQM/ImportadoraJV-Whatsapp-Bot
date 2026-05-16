'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const { getCachedContent, upsertCrawlCache } = require('../db/queries');

const WEBSITE_URL = process.env.WEBSITE_URL || 'https://importadorajv.com';
const CRAWL_INTERVAL_HOURS = parseInt(process.env.CRAWL_INTERVAL_HOURS || '24', 10);
const MAX_CHARS = 16000;

const NOISE_SELECTORS = [
  'nav', 'header', 'footer', 'script', 'style', 'noscript',
  '.cookie-banner', '.advertisement', '.ads', '[aria-hidden="true"]',
].join(', ');

async function fetchPage(url) {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ImportadoraJV-Bot/2.0)' },
    });

    const $ = cheerio.load(response.data);

    const title = $('title').text().trim();
    const metaDesc = $('meta[name="description"]').attr('content') || '';

    $(NOISE_SELECTORS).remove();

    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

    return [
      title    ? `[Página: ${title}]`       : '',
      metaDesc ? `[Descripción: ${metaDesc}]` : '',
      bodyText,
    ].filter(Boolean).join('\n');
  } catch (err) {
    console.warn(`[crawler] Failed to fetch ${url}:`, err.message);
    return null;
  }
}

function extractProductUrls(html) {
  const $ = cheerio.load(html);
  const urls = new Set();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    if (href.includes('/producto/') || href.includes('/product/')) {
      const absolute = href.startsWith('http')
        ? href
        : new URL(href, WEBSITE_URL).toString();
      urls.add(absolute);
    }
  });

  return Array.from(urls);
}

async function scrape() {
  console.log('[crawler] Starting scrape of', WEBSITE_URL);

  let homepageHtml = null;
  try {
    const resp = await axios.get(WEBSITE_URL, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ImportadoraJV-Bot/2.0)' },
    });
    homepageHtml = resp.data;
  } catch (err) {
    console.error('[crawler] Homepage fetch failed:', err.message);
    return null;
  }

  const productUrls = extractProductUrls(homepageHtml);
  console.log(`[crawler] Found ${productUrls.length} product URLs`);

  const homepageText = await fetchPage(WEBSITE_URL);
  const sections = homepageText ? [`=== PÁGINA PRINCIPAL ===\n${homepageText}`] : [];

  for (const url of productUrls.slice(0, 8)) {
    const text = await fetchPage(url);
    if (text) {
      const slug = url.split('/').pop();
      sections.push(`=== PRODUCTO: ${slug} ===\n${text}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  const combined = sections.join('\n\n');
  const truncated = combined.length > MAX_CHARS
    ? combined.slice(0, MAX_CHARS) + '\n[...contenido truncado]'
    : combined;

  console.log(`[crawler] Scrape complete. Content: ${truncated.length} chars`);
  return truncated;
}

async function runCrawl() {
  try {
    const fresh = await scrape();
    if (fresh) {
      upsertCrawlCache(fresh);
      console.log('[crawler] Cache updated.');
      return fresh;
    }
  } catch (err) {
    console.error('[crawler] Unexpected error during crawl:', err.message);
  }

  const cached = getCachedContent();
  if (cached) {
    console.warn('[crawler] Scrape failed — using cached content.');
    return cached;
  }

  console.error('[crawler] No cached content available. AI context will be empty.');
  return null;
}

function scheduleCrawl() {
  const intervalMs = CRAWL_INTERVAL_HOURS * 60 * 60 * 1000;
  setInterval(() => {
    runCrawl().catch(err =>
      console.error('[crawler] Scheduled crawl error:', err.message)
    );
  }, intervalMs);
  console.log(`[crawler] Scheduled every ${CRAWL_INTERVAL_HOURS}h`);
}

module.exports = { runCrawl, scheduleCrawl };

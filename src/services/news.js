import Parser from "rss-parser";
import { config } from "../config.js";
import { NEWS_SOURCES } from "../sources.js";

const parser = new Parser({ timeout: 10000 });

function normalizeText(value = "") {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function fingerprint(item) {
  return normalizeText(item.title).split(" ").filter((w) => w.length > 3).slice(0, 12).sort().join("|");
}

function score(item) {
  const ageHours = Math.max(0, (Date.now() - new Date(item.publishedAt).getTime()) / 3600000);
  const freshness = Math.max(0, 48 - ageHours);
  return freshness + (item.sourceWeight ?? 0);
}

export async function collectNews() {
  const cutoff = Date.now() - config.newsLookbackHours * 3600000;
  const collected = [];

  const results = await Promise.allSettled(NEWS_SOURCES.map(async (source) => {
    const feed = await parser.parseURL(source.rss);
    return (feed.items ?? []).map((item) => ({
      title: item.title?.trim(),
      summary: item.contentSnippet?.trim() ?? "",
      url: item.link,
      publishedAt: item.isoDate ?? item.pubDate,
      source: source.name,
      sourceWeight: source.weight ?? 0
    }));
  }));

  for (const result of results) {
    if (result.status === "fulfilled") collected.push(...result.value);
    else console.warn("[Acontece Já] fonte indisponível:", result.reason?.message ?? result.reason);
  }

  const seenUrls = new Set();
  const seenTitles = new Set();

  return collected
    .filter((item) => item.title && item.url && item.publishedAt)
    .filter((item) => new Date(item.publishedAt).getTime() >= cutoff)
    .filter((item) => {
      const key = fingerprint(item);
      if (seenUrls.has(item.url) || seenTitles.has(key)) return false;
      seenUrls.add(item.url);
      seenTitles.add(key);
      return true;
    })
    .map((item) => ({ ...item, score: score(item) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, config.newsLimit);
}

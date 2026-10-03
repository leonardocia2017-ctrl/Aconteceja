import Parser from "rss-parser";
import { config } from "../config.js";
import { NEWS_SOURCES } from "../sources.js";
import { normalize, rankStories, diversify } from "./editorial.js";

const parser = new Parser({ timeout: 10000 });

export async function collectNews() {
  const cutoff = Date.now() - config.newsLookbackHours * 3600000;
  const collected = [];
  const results = await Promise.allSettled(NEWS_SOURCES.map(async (source) => {
    const feed = await parser.parseURL(source.rss);
    return (feed.items ?? []).map((item) => ({
      title: item.title?.trim(), summary: item.contentSnippet?.trim() ?? "", url: item.link,
      publishedAt: item.isoDate ?? item.pubDate, source: source.name
    }));
  }));
  for (const result of results) {
    if (result.status === "fulfilled") collected.push(...result.value);
    else console.warn("[Acontece Já] fonte indisponível:", result.reason?.message ?? result.reason);
  }
  const seenUrls=new Set(), seenTitles=new Set();
  const valid=collected.filter(i=>i.title&&i.url&&i.publishedAt)
    .filter(i=>new Date(i.publishedAt).getTime()>=cutoff)
    .filter(i=>{const key=normalize(i.title); if(seenUrls.has(i.url)||seenTitles.has(key)) return false; seenUrls.add(i.url);seenTitles.add(key);return true;});
  return diversify(rankStories(valid), config.newsLimit);
}

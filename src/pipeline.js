import { config } from "./config.js";
import { collectNews } from "./services/news.js";
import { preparePost } from "./services/editor.js";
import { createMedia } from "./services/media.js";
import { publishPost } from "./services/publisher.js";
export async function runPipeline() {
  console.log("[Acontece Já] iniciando pipeline");
  const articles = await collectNews();
  for (const article of articles) {
    const post = await preparePost(article);
    const media = await createMedia(post);
    await publishPost({ ...post, media }, { dryRun: config.dryRun });
  }
  console.log(`[Acontece Já] concluído: ${articles.length} item(ns)`);
}

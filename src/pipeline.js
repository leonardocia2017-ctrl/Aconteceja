import { config } from "./config.js";
import { collectNews } from "./services/news.js";
import { preparePost } from "./services/editor.js";
import { createMedia } from "./services/media.js";
import { publishPost } from "./services/publisher.js";

export async function runPipeline() {
  console.log("[Acontece Já] iniciando pipeline");
  const articles = await collectNews();
  let prepared=0, blocked=0;
  for (const article of articles) {
    try {
      const post = await preparePost(article);
      const media = await createMedia({ ...post, category: article.category, source: article.source });
      await publishPost({ ...post, category: article.category, source: article.source, media }, { dryRun: config.dryRun });
      prepared++;
    } catch (error) {
      blocked++;
      console.error("[Acontece Já] item bloqueado:", article.title, error.message);
    }
  }
  console.log(`[Acontece Já] concluído: ${prepared} preparado(s), ${blocked} bloqueado(s)`);
}

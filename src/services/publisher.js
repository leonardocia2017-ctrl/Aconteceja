import { assertPublishableMedia } from "./media.js";

export async function publishPost(post, { dryRun = true } = {}) {
  assertPublishableMedia(post.media);
  if (dryRun) {
    console.log("[DRY RUN] publicação validada com mídia:", post.title, post.media.path);
    return { status: "dry-run", mediaValidated: true };
  }
  throw new Error("Publicador ainda não configurado. Mantenha DRY_RUN=true até integrar o Metricool.");
}

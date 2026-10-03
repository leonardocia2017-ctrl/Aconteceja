export async function publishPost(post, { dryRun = true } = {}) {
  if (dryRun) { console.log("[DRY RUN] publicação preparada:", post.title); return { status: "dry-run" }; }
  throw new Error("Publicador ainda não configurado. Mantenha DRY_RUN=true até integrar o Metricool.");
}

import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { assertPublishableMedia } from "./media.js";

function requireConfig() {
  const missing = [];
  if (!config.metricoolToken) missing.push("METRICOOL_TOKEN");
  if (!config.metricoolUserId) missing.push("METRICOOL_USER_ID");
  if (!config.metricoolBlogId) missing.push("METRICOOL_BLOG_ID");
  if (!config.metricoolMediaBaseUrl) missing.push("METRICOOL_MEDIA_BASE_URL");
  if (missing.length) throw new Error(`Publicação bloqueada: configuração Metricool ausente: ${missing.join(", ")}.`);
}

export async function materializeMediaForMetricool(media) {
  assertPublishableMedia(media);
  const bytes = await readFile(media.path);
  if (bytes.length !== media.size) throw new Error("Publicação bloqueada: tamanho da mídia mudou após validação.");
  const base = config.metricoolMediaBaseUrl.replace(/\/$/, "");
  const filename = path.basename(media.path);
  if (!/^https:\/\//i.test(base)) throw new Error("Publicação bloqueada: METRICOOL_MEDIA_BASE_URL deve ser HTTPS.");
  return { ...media, filename, publicUrl: `${base}/${encodeURIComponent(filename)}`, bytes };
}

export async function publishPost(post, { dryRun = true } = {}) {
  const media = await materializeMediaForMetricool(post.media);
  if (dryRun) {
    console.log("[DRY RUN] publicação validada com mídia:", post.title, media.path, media.publicUrl);
    return { status: "dry-run", mediaValidated: true, mediaUrl: media.publicUrl };
  }

  requireConfig();
  if (!config.metricoolAutoPublish) throw new Error("Publicação bloqueada: METRICOOL_AUTO_PUBLISH não está habilitado.");

  // Segurança: não fingir upload/publicação. A URL só é utilizável depois que
  // a camada de armazenamento configurada em METRICOOL_MEDIA_BASE_URL
  // materializar o mesmo filename e confirmar HTTP 200 + image/jpeg.
  throw new Error(
    "Publicação bloqueada: ponte de armazenamento ainda precisa confirmar upload e HTTP 200 image/jpeg antes do Metricool."
  );
}

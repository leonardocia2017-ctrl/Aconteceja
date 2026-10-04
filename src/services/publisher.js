import { readFile } from "node:fs/promises";
import path from "node:path";
import { Storage } from "@google-cloud/storage";
import { config } from "../config.js";
import { assertPublishableMedia } from "./media.js";

function requireMediaConfig() {
  const missing=[];
  if (!config.metricoolMediaBucket) missing.push("METRICOOL_MEDIA_BUCKET");
  if (!config.metricoolMediaBaseUrl) missing.push("METRICOOL_MEDIA_BASE_URL");
  if (missing.length) throw new Error(`Publicação bloqueada: configuração de mídia ausente: ${missing.join(", ")}.`);
}
export async function materializeMediaForMetricool(media,{upload=false}={}) {
  assertPublishableMedia(media);
  const bytes=await readFile(media.path);
  if (bytes.length!==media.size) throw new Error("Publicação bloqueada: tamanho da mídia mudou após validação.");
  const filename=path.basename(media.path);
  const base=config.metricoolMediaBaseUrl.replace(/\/$/,"");
  if (!/^https:\/\//i.test(base)) throw new Error("Publicação bloqueada: METRICOOL_MEDIA_BASE_URL deve ser HTTPS.");
  const publicUrl=`${base}/${encodeURIComponent(filename)}`;
  if (!upload) return {...media,filename,publicUrl,bytes};
  requireMediaConfig();
  const storage=new Storage();
  await storage.bucket(config.metricoolMediaBucket).file(filename).save(bytes,{resumable:false,contentType:"image/jpeg",metadata:{cacheControl:"public,max-age=86400"}});
  const response=await fetch(publicUrl,{redirect:"follow"});
  const contentType=(response.headers.get("content-type")??"").toLowerCase();
  if (!response.ok || !contentType.startsWith("image/jpeg")) throw new Error(`Publicação bloqueada: mídia externa não validada (HTTP ${response.status}, ${contentType||"sem content-type"}).`);
  const remote=Buffer.from(await response.arrayBuffer());
  if (remote.length!==bytes.length) throw new Error("Publicação bloqueada: mídia externa difere do JPG materializado.");
  return {...media,filename,publicUrl,bytes};
}
export async function publishPost(post,{dryRun=true}={}) {
  const media=await materializeMediaForMetricool(post.media,{upload:!dryRun});
  if (dryRun) {
    console.log("[DRY RUN] publicação validada com mídia:",post.title,media.path,media.publicUrl);
    return {status:"dry-run",mediaValidated:true,mediaUrl:media.publicUrl};
  }
  if (!config.metricoolAutoPublish) throw new Error("Publicação bloqueada: METRICOOL_AUTO_PUBLISH não está habilitado.");
  return {status:"media-ready",mediaValidated:true,mediaUrl:media.publicUrl};
}

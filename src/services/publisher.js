import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { assertPublishableMedia } from "./media.js";

const OWNER="leonardocia2017-ctrl";
const REPO="Aconteceja";
const MEDIA_BRANCH="media";
const MEDIA_DIR="media";

function githubToken() {
  const token=process.env.GITHUB_TOKEN;
  if (!token) throw new Error("Publicação bloqueada: GITHUB_TOKEN ausente para materializar a mídia.");
  return token;
}

async function githubApi(url,options={}) {
  const response=await fetch(url,{
    ...options,
    headers:{
      Accept:"application/vnd.github+json",
      Authorization:`Bearer ${githubToken()}`,
      "X-GitHub-Api-Version":"2022-11-28",
      ...(options.headers??{})
    }
  });
  return response;
}

async function ensureMediaBranch() {
  const refUrl=`https://api.github.com/repos/${OWNER}/${REPO}/git/ref/heads/${MEDIA_BRANCH}`;
  let response=await githubApi(refUrl);
  if (response.ok) return;
  if (response.status!==404) throw new Error(`Publicação bloqueada: não foi possível consultar branch de mídia (HTTP ${response.status}).`);
  const main=await githubApi(`https://api.github.com/repos/${OWNER}/${REPO}/git/ref/heads/main`);
  if (!main.ok) throw new Error(`Publicação bloqueada: não foi possível consultar main (HTTP ${main.status}).`);
  const mainJson=await main.json();
  response=await githubApi(`https://api.github.com/repos/${OWNER}/${REPO}/git/refs`,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ref:`refs/heads/${MEDIA_BRANCH}`,sha:mainJson.object.sha})
  });
  if (!response.ok && response.status!==422) throw new Error(`Publicação bloqueada: não foi possível criar branch de mídia (HTTP ${response.status}).`);
}

async function uploadToGitHub(filename,bytes) {
  await ensureMediaBranch();
  const repoPath=`${MEDIA_DIR}/${filename}`;
  const apiUrl=`https://api.github.com/repos/${OWNER}/${REPO}/contents/${repoPath}`;
  const existing=await githubApi(`${apiUrl}?ref=${MEDIA_BRANCH}`);
  let sha;
  if (existing.ok) sha=(await existing.json()).sha;
  else if (existing.status!==404) throw new Error(`Publicação bloqueada: falha ao consultar mídia existente (HTTP ${existing.status}).`);
  const response=await githubApi(apiUrl,{
    method:"PUT",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      message:`media: materialize ${filename}`,
      content:bytes.toString("base64"),
      branch:MEDIA_BRANCH,
      ...(sha?{sha}:{})
    })
  });
  if (!response.ok) throw new Error(`Publicação bloqueada: upload GitHub falhou (HTTP ${response.status}).`);
  return `https://raw.githubusercontent.com/${OWNER}/${REPO}/refs/heads/${MEDIA_BRANCH}/${MEDIA_DIR}/${encodeURIComponent(filename)}`;
}

export async function materializeMediaForMetricool(media,{upload=false}={}) {
  assertPublishableMedia(media);
  const bytes=await readFile(media.path);
  if (bytes.length!==media.size) throw new Error("Publicação bloqueada: tamanho da mídia mudou após validação.");
  const filename=path.basename(media.path);
  if (!upload) return {...media,filename,bytes};
  const publicUrl=await uploadToGitHub(filename,bytes);
  let response;
  for (let attempt=0;attempt<5;attempt++) {
    response=await fetch(publicUrl,{redirect:"follow",cache:"no-store"});
    if (response.ok) break;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  const contentType=(response?.headers.get("content-type")??"").toLowerCase();
  if (!response?.ok || !contentType.startsWith("image/jpeg")) throw new Error(`Publicação bloqueada: mídia GitHub não validada (HTTP ${response?.status??"?"}, ${contentType||"sem content-type"}).`);
  const remote=Buffer.from(await response.arrayBuffer());
  if (remote.length!==bytes.length) throw new Error("Publicação bloqueada: mídia externa difere do JPG materializado.");
  return {...media,filename,publicUrl,bytes};
}

export async function publishPost(post,{dryRun=true}={}) {
  if (dryRun) {
    assertPublishableMedia(post.media);
    console.log("[DRY RUN] publicação validada com mídia:",post.title,post.media.path);
    return {status:"dry-run",mediaValidated:true};
  }
  const media=await materializeMediaForMetricool(post.media,{upload:true});
  if (!config.metricoolAutoPublish) throw new Error("Publicação bloqueada: METRICOOL_AUTO_PUBLISH não está habilitado.");
  return {status:"media-ready",mediaValidated:true,mediaUrl:media.publicUrl};
}

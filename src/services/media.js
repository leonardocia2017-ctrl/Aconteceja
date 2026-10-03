import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT_DIR = path.resolve("output/media");

function escapeXml(value="") {
  return value.replace(/[<>&'"]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"}[c]));
}

function wrap(text, max=32) {
  const words=(text ?? "").trim().split(/\s+/), lines=[]; let line="";
  for (const word of words) {
    const next=line ? `${line} ${word}` : word;
    if (next.length>max && line) { lines.push(line); line=word; } else line=next;
  }
  if (line) lines.push(line);
  return lines.slice(0,6);
}

export async function createMedia(post) {
  await mkdir(OUT_DIR,{recursive:true});
  const lines=wrap(post.title);
  if (!lines.length) throw new Error("Título ausente: mídia não pode ser criada.");
  const title=lines.map((l,i)=>`<tspan x="80" dy="${i===0?0:76}">${escapeXml(l)}</tspan>`).join("");
  const svg=`<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1350" fill="#101114"/>
    <text x="80" y="110" font-family="Arial,sans-serif" font-size="44" font-weight="700" fill="white">ACONTECE JÁ</text>
    <text x="80" y="230" font-family="Arial,sans-serif" font-size="30" fill="#d7d7d7">${escapeXml((post.category ?? "GERAL").toUpperCase())}</text>
    <text x="80" y="420" font-family="Arial,sans-serif" font-size="62" font-weight="700" fill="white">${title}</text>
    <text x="80" y="1260" font-family="Arial,sans-serif" font-size="28" fill="#bdbdbd">Fonte: ${escapeXml(post.source ?? "Fonte original")}</text>
  </svg>`;
  const slug=Buffer.from(post.sourceUrl ?? post.title).toString("base64url").slice(0,24);
  const filePath=path.join(OUT_DIR,`${slug}.jpg`);
  await sharp(Buffer.from(svg)).jpeg({quality:90}).toFile(filePath);
  const info=await stat(filePath);
  if (!info.isFile() || info.size<1000) throw new Error("Arquivo de mídia inválido.");
  return {type:"image/jpeg",path:filePath,width:1080,height:1350,size:info.size,alt:post.title};
}

export function assertPublishableMedia(media) {
  if (!media || media.type!=="image/jpeg" || !media.path || !media.size) throw new Error("Publicação bloqueada: mídia JPG válida é obrigatória.");
  return true;
}

import { mkdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";

const OUT_DIR = path.resolve("output/media");

function escapeXml(value="") {
  return value.replace(/[<>&'"]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"}[c]));
}

function wrap(text, max=30) {
  const words=(text ?? "").trim().split(/\s+/), lines=[]; let line="";
  for (const word of words) {
    const next=line ? `${line} ${word}` : word;
    if (next.length>max && line) { lines.push(line); line=word; } else line=next;
  }
  if (line) lines.push(line);
  return lines.slice(0,6);
}

const ACCENTS={politica:"#D94A4A",economia:"#35A56F",tecnologia:"#4C8DFF",esportes:"#F0A33A",entretenimento:"#B56CFF",clima:"#35A9C9",mundo:"#E06F47",geral:"#E5E7EB"};

export async function createMedia(post) {
  await mkdir(OUT_DIR,{recursive:true});
  const lines=wrap(post.title);
  if (!lines.length) throw new Error("Título ausente: mídia não pode ser criada.");
  const category=(post.category ?? "geral").toLowerCase();
  const accent=ACCENTS[category] ?? ACCENTS.geral;
  const title=lines.map((l,i)=>`<tspan x="80" dy="${i===0?0:72}">${escapeXml(l)}</tspan>`).join("");
  const svg=`<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B0D12"/><stop offset="1" stop-color="#171B24"/></linearGradient></defs>
    <rect width="1080" height="1350" fill="url(#bg)"/>
    <rect x="0" y="0" width="18" height="1350" fill="${accent}"/>
    <rect x="80" y="76" width="62" height="8" rx="4" fill="${accent}"/>
    <text x="80" y="142" font-family="Arial,sans-serif" font-size="46" font-weight="700" fill="white">ACONTECE JÁ</text>
    <rect x="80" y="205" width="240" height="54" rx="27" fill="${accent}"/>
    <text x="106" y="242" font-family="Arial,sans-serif" font-size="25" font-weight="700" fill="#0B0D12">${escapeXml(category.toUpperCase())}</text>
    <text x="80" y="400" font-family="Arial,sans-serif" font-size="58" font-weight="700" fill="white">${title}</text>
    <line x1="80" y1="1190" x2="1000" y2="1190" stroke="#3A3F4B" stroke-width="2"/>
    <text x="80" y="1250" font-family="Arial,sans-serif" font-size="27" fill="#B9C0CC">Fonte: ${escapeXml(post.source ?? "Fonte original")}</text>
    <text x="1000" y="1250" text-anchor="end" font-family="Arial,sans-serif" font-size="24" fill="#7F8794">aconteceja</text>
  </svg>`;
  const slug=createHash("sha256").update(post.sourceUrl ?? post.title).digest("hex");
  const filePath=path.join(OUT_DIR,`${slug}.jpg`);
  await sharp(Buffer.from(svg)).jpeg({quality:92}).toFile(filePath);
  const info=await stat(filePath);
  if (!info.isFile() || info.size<1000) throw new Error("Arquivo de mídia inválido.");
  return {type:"image/jpeg",path:filePath,width:1080,height:1350,size:info.size,alt:post.title};
}

export function assertPublishableMedia(media) {
  if (!media || media.type!=="image/jpeg" || !media.path || !media.size) throw new Error("Publicação bloqueada: mídia JPG válida é obrigatória.");
  return true;
}

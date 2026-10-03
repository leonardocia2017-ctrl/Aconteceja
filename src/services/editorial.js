const CATEGORY_RULES = {
  politica: ["governo","congresso","senado","camara","presidente","eleicao","eleitoral","ministro","prefeito","governador"],
  economia: ["economia","mercado","inflacao","juros","dolar","ibovespa","emprego","pib","banco","bancos","credito","financeiro"],
  tecnologia: ["tecnologia","inteligencia artificial","software","aplicativo","internet","google","apple","microsoft","computador","chip"],
  esportes: ["futebol","brasileirao","libertadores","copa","gol","jogo","selecao","formula 1","tenis"],
  entretenimento: ["cinema","filme","serie","musica","show","festival","ator","atriz","cantor"],
  clima: ["clima","el nino","la nina","chuva","tempestade","furacao","ciclone","seca","calor","frio","meteorologia"],
  mundo: ["eua","estados unidos","europa","china","ucrania","russia","israel","onu","internacional"]
};

const STOP = new Set(["para","com","uma","das","dos","que","por","sobre","apos","mais","como","seu","sua","aos","nas","nos"]);

export function normalize(value="") {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
}

function tokens(title) {
  return new Set(normalize(title).split(" ").filter(w => w.length > 3 && !STOP.has(w)));
}

function containsTerm(text, term) {
  const normalizedTerm=normalize(term);
  return (` ${text} `).includes(` ${normalizedTerm} `);
}

export function similarity(a,b) {
  const A=tokens(a), B=tokens(b);
  if (!A.size || !B.size) return 0;
  const intersection=[...A].filter(x=>B.has(x)).length;
  const union=new Set([...A,...B]).size;
  return intersection/union;
}

export function categorize(item) {
  const text=normalize(`${item.title} ${item.summary ?? ""}`);
  let best={category:"geral",hits:0};
  for (const [category,terms] of Object.entries(CATEGORY_RULES)) {
    const hits=terms.filter(term=>containsTerm(text,term)).length;
    if (hits>best.hits) best={category,hits};
  }
  return best.category;
}

export function clusterStories(items, threshold=0.34) {
  const clusters=[];
  for (const item of items) {
    const found=clusters.find(c=>c.some(other=>similarity(item.title,other.title)>=threshold));
    if (found) found.push(item); else clusters.push([item]);
  }
  return clusters;
}

export function rankStories(items, now=Date.now()) {
  return clusterStories(items).map(cluster => {
    const sorted=[...cluster].sort((a,b)=>new Date(b.publishedAt)-new Date(a.publishedAt));
    const lead=sorted[0];
    const sources=[...new Set(cluster.map(x=>x.source))];
    const age=Math.max(0,(now-new Date(lead.publishedAt).getTime())/3600000);
    const freshness=Math.max(0,36-age);
    const corroboration=Math.min(18,(sources.length-1)*6);
    const completeness=(lead.summary?.length ?? 0)>=80 ? 4 : 0;
    return {...lead,category:categorize(lead),corroboratingSources:sources,score:Number((freshness+corroboration+completeness).toFixed(2))};
  }).sort((a,b)=>b.score-a.score);
}

export function diversify(items, limit=10) {
  const selected=[], counts=new Map();
  for (const item of items) {
    const n=counts.get(item.category) ?? 0;
    if (n>=3) continue;
    selected.push(item); counts.set(item.category,n+1);
    if (selected.length>=limit) break;
  }
  return selected;
}

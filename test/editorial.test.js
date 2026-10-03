import test from "node:test";
import assert from "node:assert/strict";
import { categorize, similarity, rankStories, diversify } from "../src/services/editorial.js";

test("categoriza economia",()=>assert.equal(categorize({title:"Banco Central mantém juros",summary:"economia"}),"economia"));
test("detecta manchetes relacionadas",()=>assert.ok(similarity("Temporal forte atinge Belo Horizonte nesta sexta","Temporal atinge Belo Horizonte e causa transtornos")>0.25));
test("premia confirmação por fontes distintas",()=>{
 const now=Date.now(), date=new Date(now-3600000).toISOString();
 const ranked=rankStories([
  {title:"Temporal forte atinge Belo Horizonte nesta sexta",summary:"Resumo suficientemente detalhado sobre o acontecimento em Belo Horizonte para teste.",url:"a",source:"Fonte A",publishedAt:date},
  {title:"Temporal atinge Belo Horizonte nesta sexta e causa transtornos",summary:"Outro resumo",url:"b",source:"Fonte B",publishedAt:date}
 ],now);
 assert.equal(ranked[0].corroboratingSources.length,2);
});
test("limita excesso de uma categoria",()=>{
 const items=Array.from({length:5},(_,i)=>({category:"esportes",score:10-i}));
 assert.equal(diversify(items,10).length,3);
});

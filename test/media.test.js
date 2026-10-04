import test from "node:test";
import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import sharp from "sharp";
import { assertPublishableMedia, createMedia } from "../src/services/media.js";

test("bloqueia publicação sem mídia",()=>assert.throws(()=>assertPublishableMedia(null),/mídia JPG válida/));
test("bloqueia mídia pendente",()=>assert.throws(()=>assertPublishableMedia({type:"pending"}),/mídia JPG válida/));
test("aceita JPG materializado",()=>assert.equal(assertPublishableMedia({type:"image/jpeg",path:"output/x.jpg",size:2048}),true));

test("notícias com o mesmo prefixo de URL preservam JPGs distintos", async () => {
  const paths = new Set();
  try {
    const first = await createMedia({ title: "Primeira notícia", sourceUrl: "https://g1.globo.com/teste/regressao-primeira", source: "Teste" });
    paths.add(first.path);
    const original = await readFile(first.path);
    const second = await createMedia({ title: "Segunda notícia", sourceUrl: "https://g1.globo.com/teste/regressao-segunda", source: "Teste" });
    paths.add(second.path);
    assert.notEqual(first.path, second.path);
    assert.deepEqual(await readFile(first.path), original);
    assert.notDeepEqual(await readFile(second.path), original);
    for (const filePath of paths) {
      const metadata = await sharp(filePath).metadata();
      assert.equal(metadata.format, "jpeg");
      assert.equal(metadata.width, 1080);
      assert.equal(metadata.height, 1350);
    }
  } finally {
    await Promise.all([...paths].map(filePath => rm(filePath, { force: true })));
  }
});

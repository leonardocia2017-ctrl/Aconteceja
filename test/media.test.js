import test from "node:test";
import assert from "node:assert/strict";
import { assertPublishableMedia } from "../src/services/media.js";

test("bloqueia publicação sem mídia",()=>assert.throws(()=>assertPublishableMedia(null),/mídia JPG válida/));
test("bloqueia mídia pendente",()=>assert.throws(()=>assertPublishableMedia({type:"pending"}),/mídia JPG válida/));
test("aceita JPG materializado",()=>assert.equal(assertPublishableMedia({type:"image/jpeg",path:"output/x.jpg",size:2048}),true));

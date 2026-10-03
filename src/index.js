import { runPipeline } from "./pipeline.js";
runPipeline().catch((error) => { console.error("[Acontece Já] falha:", error); process.exitCode = 1; });

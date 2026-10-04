export const config = {
  dryRun: (process.env.DRY_RUN ?? "true").toLowerCase() !== "false",
  newsLookbackHours: Number(process.env.NEWS_LOOKBACK_HOURS ?? 24),
  newsLimit: Number(process.env.NEWS_LIMIT ?? 10),
  metricoolToken: process.env.METRICOOL_TOKEN ?? "",
  metricoolUserId: process.env.METRICOOL_USER_ID ?? "",
  metricoolBlogId: process.env.METRICOOL_BLOG_ID ?? "",
  metricoolMediaBaseUrl: process.env.METRICOOL_MEDIA_BASE_URL ?? "",
  metricoolMediaBucket: process.env.METRICOOL_MEDIA_BUCKET ?? "",
  metricoolAutoPublish: (process.env.METRICOOL_AUTO_PUBLISH ?? "false").toLowerCase() === "true"
};

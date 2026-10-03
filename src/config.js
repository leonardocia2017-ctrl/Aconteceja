export const config = {
  dryRun: (process.env.DRY_RUN ?? "true").toLowerCase() !== "false",
  newsApiKey: process.env.NEWS_API_KEY ?? "",
  metricoolToken: process.env.METRICOOL_TOKEN ?? "",
  metricoolUserId: process.env.METRICOOL_USER_ID ?? "",
  metricoolBlogId: process.env.METRICOOL_BLOG_ID ?? ""
};

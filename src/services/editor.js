export async function preparePost(article) {
  return { title: article.title, caption: article.summary ?? article.title, sourceUrl: article.url, publishedAt: article.publishedAt ?? new Date().toISOString() };
}

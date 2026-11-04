// Hidden marker so the next deploy finds the comment it posted.
const MARKER = "<!-- colorup-preview -->";
const URL_PATTERN = /https:\/\/pr-\d+-colorup\.stephen-jcombs\.workers\.dev/;

export function previewUrl(pr) {
  return `https://pr-${pr}-colorup.stephen-jcombs.workers.dev`;
}

export function commentBody(url) {
  return `${MARKER}\n${url}`;
}

function urlIn(body) {
  return body.match(URL_PATTERN)?.[0] ?? null;
}

// A comment that is the preview link, not a review that happens to mention it.
function previewComment(comments) {
  return (
    comments.find((comment) => comment.body.includes(MARKER)) ??
    comments.find((comment) => {
      const url = urlIn(comment.body);
      return url !== null && comment.body.replaceAll(url, "").trim() === "";
    })
  );
}

export function commentUpdate(comments, url) {
  const existing = previewComment(comments);
  const body = commentBody(url);
  if (!existing) return { action: "create", body };
  if (urlIn(existing.body) === url) return { action: "skip", id: existing.id };
  return { action: "update", id: existing.id, body };
}

export async function publishPreviewComment({ repository, pr, token, fetch = globalThis.fetch }) {
  const url = previewUrl(pr);
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const comments = [];
  for (let page = 1; page <= 5; page++) {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/issues/${pr}/comments?per_page=100&page=${page}`,
      { headers },
    );
    if (!response.ok) throw new Error(`Listing preview comments failed (${response.status})`);
    const batch = await response.json();
    comments.push(...batch);
    if (batch.length < 100) break;
  }
  const plan = commentUpdate(comments, url);
  if (plan.action === "skip") return plan;
  const response = await fetch(
    plan.action === "create"
      ? `https://api.github.com/repos/${repository}/issues/${pr}/comments`
      : `https://api.github.com/repos/${repository}/issues/comments/${plan.id}`,
    {
      method: plan.action === "create" ? "POST" : "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ body: plan.body }),
    },
  );
  if (!response.ok) throw new Error(`Saving the preview comment failed (${response.status})`);
  return plan;
}

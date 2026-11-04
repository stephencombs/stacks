import { expect, it } from "vite-plus/test";

import {
  commentBody,
  commentUpdate,
  previewUrl,
  publishPreviewComment,
} from "./preview-comment.mjs";

const url = previewUrl(35);
const previous = previewUrl(4);

it("creates a comment when none has the preview URL", () => {
  const plan = commentUpdate([{ id: 1, body: `See ${url} once the deploy finishes.` }], url);
  expect(plan).toEqual({ action: "create", body: commentBody(url) });
});

it("leaves the existing comment when the URL is unchanged", () => {
  expect(commentUpdate([{ id: 7, body: commentBody(url) }], url)).toEqual({
    action: "skip",
    id: 7,
  });
  expect(commentUpdate([{ id: 8, body: `${url}\n` }], url)).toEqual({ action: "skip", id: 8 });
});

it("updates the same comment when the URL changes", () => {
  const plan = commentUpdate([{ id: 7, body: commentBody(previous) }], url);
  expect(plan).toEqual({ action: "update", id: 7, body: commentBody(url) });
});

it("does not write when the preview URL is unchanged", async () => {
  const calls: { input: string; method: string }[] = [];
  const fetch = async (input: string, init?: { method?: string }) => {
    calls.push({ input, method: init?.method ?? "GET" });
    return {
      ok: true,
      json: async () => [{ id: 7, body: commentBody(url) }],
    };
  };
  const plan = await publishPreviewComment({
    repository: "acme/stacks",
    pr: 35,
    token: "token",
    fetch,
  });
  expect(plan.action).toBe("skip");
  expect(calls.map((call) => call.method)).toEqual(["GET"]);
});

it("updates the marked comment rather than a newer mention", () => {
  const plan = commentUpdate(
    [
      { id: 3, body: commentBody(previous) },
      { id: 9, body: url },
    ],
    url,
  );
  expect(plan).toEqual({ action: "update", id: 3, body: commentBody(url) });
});

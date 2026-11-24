/**
 * An https link keeps its token in the fragment, `/t#token`. The app's routes read the path form,
 * `t/token`, which the scheme links use, so the fragment form is rewritten to it.
 */
export const linkAddress = (path: string) => {
  const [, kind, token] = /^\/?(t|invite|join|claim)(?:\?[^#]*)?#([^/?#]+)$/.exec(path) ?? [];

  return kind ? `${kind}/${token}` : path;
};

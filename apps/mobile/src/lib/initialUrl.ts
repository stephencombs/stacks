export async function getInitialURL(
  lookup: () => Promise<string | null>,
  onTimeout: () => void,
  onError: (error: unknown) => void,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      lookup().catch((error: unknown) => {
        onError(error);
        return null;
      }),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          onTimeout();
          resolve(null);
        }, 1_500);
      }),
    ]);
  } catch (error) {
    onError(error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

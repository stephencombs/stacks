export async function getInitialURL(
  lookup: () => Promise<string | null>,
  onTimeout: () => void,
  onError: (error: Error) => void,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      lookup().catch((error) => {
        onError(error instanceof Error ? error : new Error(String(error)));

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
    onError(error instanceof Error ? error : new Error(String(error)));

    return null;
  } finally {
    clearTimeout(timer);
  }
}

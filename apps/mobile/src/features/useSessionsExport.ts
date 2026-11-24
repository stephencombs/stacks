import { describeError } from "@stacks/client-runtime/errors";
import { exportPersonalSessionsCsv, personalCsvFilename } from "@stacks/client-runtime/export";
import { useRecordingHome } from "@stacks/client-runtime/recordingReact";
import { useState } from "react";

import { shareCsv } from "../lib/share";

/** Every finished session on this phone as a CSV file for the share sheet. */
export function useSessionsExport() {
  const { home } = useRecordingHome();
  const count = home?.finished.length ?? 0;

  const [state, setState] = useState<{ pending: boolean; error: string | null }>({
    pending: false,
    error: null,
  });

  const run = async () => {
    if (state.pending || !home || count === 0) return;
    setState({ pending: true, error: null });

    try {
      await shareCsv(personalCsvFilename(), exportPersonalSessionsCsv(home.finished));
      setState({ pending: false, error: null });
    } catch (error) {
      setState({ pending: false, error: describeError(error) });
    }
  };

  return { count, run, ...state };
}

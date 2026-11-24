import { useState } from "react";

import { Button } from "../components/ui/Button";
import { contactName } from "../lib/contactName";
import { pickContact } from "../../modules/contact-picker/src";

/**
 * Fills a name field from the system contact picker. The picker hands back only the name of the
 * contact the user chooses, so there's no permission to ask for, and the name stays editable.
 */
export function ChooseFromContacts({
  onName,
  onError,
}: {
  onName: (name: string) => void;
  onError: (message: string) => void;
}) {
  const [picking, setPicking] = useState(false);

  const choose = async () => {
    setPicking(true);

    try {
      const raw = await pickContact();
      const name = raw === null ? null : contactName(raw);

      if (name !== null) onName(name);
    } catch {
      onError("Couldn't open Contacts. Type their name instead.");
    } finally {
      setPicking(false);
    }
  };

  return (
    <Button
      label="Choose from Contacts"
      variant="secondary"
      className="self-start"
      disabled={picking}
      onPress={() => void choose()}
    />
  );
}

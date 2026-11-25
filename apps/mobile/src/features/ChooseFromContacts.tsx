import { useState } from "react";
import { View } from "react-native";

import { Button } from "../components/ui/Button";
import { contactName } from "../lib/contactName";
import { discardContactPick } from "../lib/contactPhotos";
import { photoUri, pickContact } from "../../modules/contact-picker/src";
import { ContactPhotoPreview, type ContactPhotoDraft } from "./ContactPhoto";

/**
 * Fills a name field from the system contact picker. The picker hands back only the name and
 * photo of the contact the user chooses, so there's no permission to ask for, and the name stays
 * editable. A photo goes to `photo`, which previews it and saves it once the player exists.
 */
export function ChooseFromContacts({
  onName,
  onError,
  photo,
}: {
  onName: (name: string) => void;
  onError: (message: string) => void;
  photo: ContactPhotoDraft;
}) {
  const [picking, setPicking] = useState(false);

  const choose = async () => {
    setPicking(true);

    try {
      const picked = await pickContact();

      if (picked === null) return;
      const name = contactName(picked.name);

      if (name === null) {
        const uri = photoUri(picked.photo);

        if (uri !== null) discardContactPick(uri);

        return;
      }

      onName(name);
      photo.accept(picked.photo);
    } catch {
      onError("Couldn't open Contacts. Type their name instead.");
    } finally {
      setPicking(false);
    }
  };

  return (
    <View className="gap-2">
      <Button
        label="Choose from Contacts"
        variant="secondary"
        className="self-start"
        disabled={picking}
        onPress={() => void choose()}
      />
      <ContactPhotoPreview draft={photo} />
    </View>
  );
}

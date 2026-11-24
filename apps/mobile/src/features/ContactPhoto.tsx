import type { PlayerId } from "@stacks/contracts";
import { useState } from "react";
import { Image, Platform, View } from "react-native";

import { Button } from "../components/ui/Button";
import { Text } from "../components/ui/Text";
import {
  discardContactPick,
  linkContactPhoto,
  markContactPhotosUnavailable,
  removeContactPhoto,
  useContactPhoto,
  useContactPhotosAvailable,
} from "../lib/contactPhotos";
import { photoUri, pickContact, type ContactPhoto } from "../../modules/contact-picker/src";
import { PlayerChip } from "./PlayerChip";

const NO_PHOTO = "This contact has no photo.";

/**
 * A photo picked while adding someone, held in a temporary file until the player exists. Saving
 * links it to the new player's ID; closing the sheet or dropping it deletes the file.
 */
export function useContactPhotoDraft() {
  const [uri, setUri] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const replace = (next: string | null) => {
    if (uri !== null) discardContactPick(uri);
    setUri(next);
  };

  const drop = () => {
    replace(null);
    setNote(null);
  };

  return {
    uri,
    note,
    drop,
    accept: (photo: ContactPhoto) => {
      const picked = photoUri(photo);

      if (picked !== null) {
        replace(picked);
        setNote(null);

        return;
      }

      replace(null);
      setNote(photo === "none" ? NO_PHOTO : null);

      if (photo === "unavailable") markContactPhotosUnavailable();
    },
    commit: (playerId: PlayerId) => {
      if (uri === null) return;

      try {
        linkContactPhoto(playerId, uri);
      } catch {
        discardContactPick(uri);
      }

      setUri(null);
    },
  };
}

export type ContactPhotoDraft = ReturnType<typeof useContactPhotoDraft>;

/** What a picked photo will look like, with a way to drop it. */
export function ContactPhotoPreview({ draft }: { draft: ContactPhotoDraft }) {
  if (draft.uri === null)
    return draft.note ? <Text className="type-footnote text-muted">{draft.note}</Text> : null;

  return (
    <View className="flex-row items-center gap-3">
      <Image
        accessibilityLabel="Contact photo"
        source={{ uri: draft.uri }}
        style={{ width: 44, height: 44, borderRadius: 22 }}
        resizeMode="cover"
      />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="type-footnote text-muted">Only on this phone.</Text>
      </View>
      <Button label="Remove photo" variant="ghost" size="sm" onPress={draft.drop} />
    </View>
  );
}

/**
 * Links a photo from Contacts to a player on this phone: Link, or Change and Remove. It asks for
 * nothing but the one contact the user picks, and never changes the player's name.
 */
export function ContactPhotoControls({
  playerId,
  chip,
  name,
}: {
  playerId: PlayerId;
  chip: number;
  name: string;
}) {
  const uri = useContactPhoto(playerId);
  const offered = useContactPhotosAvailable();
  // WARNING: Android's Contacts provider refuses photo reads without READ_CONTACTS (seen on a Pixel).
  const available = Platform.OS !== "android" && offered;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!available && uri === null) return null;

  const link = async () => {
    setBusy(true);
    setMessage(null);

    try {
      const picked = await pickContact();

      if (picked === null) return;

      const photo = photoUri(picked.photo);

      if (photo !== null) linkContactPhoto(playerId, photo);
      else if (picked.photo === "none") setMessage(NO_PHOTO);
      else markContactPhotosUnavailable();
    } catch {
      setMessage("Couldn't open Contacts. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-3">
        <PlayerChip playerId={playerId} chip={chip} name={name} size={44} />
        <View className="min-w-0 flex-1 flex-row flex-wrap gap-2">
          {available ? (
            <Button
              label={uri === null ? "Link contact photo" : "Change"}
              disabled={busy}
              onPress={() => void link()}
            />
          ) : null}
          {uri === null ? null : (
            <Button label="Remove" variant="ghost" onPress={() => removeContactPhoto(playerId)} />
          )}
        </View>
      </View>
      {message ? <Text className="type-footnote text-muted">{message}</Text> : null}
      <Text className="type-footnote text-muted">Only on this phone.</Text>
    </View>
  );
}

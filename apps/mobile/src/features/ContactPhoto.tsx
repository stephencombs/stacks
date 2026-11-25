import type { PlayerId } from "@stacks/contracts";
import { useState } from "react";
import { Image, Platform, View } from "react-native";

import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { MenuView } from "../components/ui/MenuView";
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
import { PlayerAvatar } from "./PlayerAvatar";

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
 * Linking a player's photo from Contacts on this phone: whether it can be offered, the photo they
 * have now, and the pick and remove actions. It asks for nothing but the one contact the user
 * picks, and never changes the player's name.
 */
export function useContactPhotoLink(playerId: PlayerId) {
  const uri = useContactPhoto(playerId);
  const offered = useContactPhotosAvailable();
  // WARNING: Android's Contacts provider refuses photo reads without READ_CONTACTS (seen on a Pixel).
  const available = Platform.OS !== "android" && offered;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  return {
    uri,
    available,
    busy,
    message,
    link: () => void link(),
    remove: () => removeContactPhoto(playerId),
  };
}

export type ContactPhotoLink = ReturnType<typeof useContactPhotoLink>;

/** Links a photo from Contacts to a player on this phone: Link, or Change and Remove. */
export function ContactPhotoControls({ playerId, name }: { playerId: PlayerId; name: string }) {
  const photo = useContactPhotoLink(playerId);

  if (!photo.available && photo.uri === null) return null;

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-3">
        <PlayerAvatar playerId={playerId} name={name} size={44} />
        <View className="min-w-0 flex-1 flex-row flex-wrap gap-2">
          {photo.available ? (
            <Button
              label={photo.uri === null ? "Link contact photo" : "Change"}
              disabled={photo.busy}
              onPress={photo.link}
            />
          ) : null}
          {photo.uri === null ? null : (
            <Button label="Remove" variant="ghost" onPress={photo.remove} />
          )}
        </View>
      </View>
      {photo.message ? <Text className="type-footnote text-muted">{photo.message}</Text> : null}
      <Text className="type-footnote text-muted">Only on this phone.</Text>
    </View>
  );
}

/**
 * A player's avatar that opens the platform's menu for their photo: choose or change it from
 * Contacts, or remove it. With nothing to offer, such as on Android with no photo, it is only the
 * avatar. The menu's title says the photo stays on this phone.
 */
export function ContactPhotoMenu({
  playerId,
  name,
  size,
  photo,
}: {
  playerId: PlayerId;
  name: string;
  size: number;
  photo: ContactPhotoLink;
}) {
  const actions = [
    ...(photo.available
      ? [{ id: "link", title: photo.uri === null ? "Choose from Contacts" : "Change photo" }]
      : []),
    ...(photo.uri === null
      ? []
      : [{ id: "remove", title: "Remove photo", attributes: { destructive: true } }]),
  ];

  const hint = photo.available
    ? photo.uri === null
      ? "Opens a menu to choose a photo from Contacts"
      : "Opens a menu to change or remove it"
    : "Opens a menu to remove it";

  const face = <PlayerAvatar playerId={playerId} name={name} size={size} />;

  if (actions.length === 0) return face;

  return (
    <MenuView
      title="Photo stays on this phone"
      actions={actions}
      shouldOpenOnLongPress={false}
      onPressAction={({ nativeEvent }) => {
        if (nativeEvent.event === "link") photo.link();
        else photo.remove();
      }}
    >
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={`Photo for ${name}`}
        accessibilityHint={hint}
        accessibilityState={{ disabled: photo.busy }}
        style={{ width: size, height: size }}
      >
        {face}
        <View className="absolute right-0 bottom-0 size-6 items-center justify-center rounded-full bg-ink">
          <Icon name="edit" color="ink-inverse" size={12} />
        </View>
      </View>
    </MenuView>
  );
}

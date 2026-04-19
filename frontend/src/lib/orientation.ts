type SupportedOrientationLock = "portrait" | "portrait-primary";

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: SupportedOrientationLock) => Promise<void>;
  unlock?: () => void;
};

export async function lockPortraitOrientation() {
  if (typeof window === "undefined" || typeof screen === "undefined") {
    return;
  }

  const orientation = screen.orientation as LockableScreenOrientation | undefined;

  if (!orientation?.lock) {
    return;
  }

  try {
    await orientation.lock("portrait-primary");
  } catch {
    try {
      await orientation.lock("portrait");
    } catch {
      // Some mobile webviews, especially on iOS, may ignore orientation locking.
    }
  }
}

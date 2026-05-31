import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { toast } from '@/components/Toast';

/**
 * Vault → device gallery downloader.
 *
 * Flow:
 *   1. Check / request MediaLibrary "write" permission. If denied, surface
 *      a friendly toast with an "Open Settings" affordance — never a modal.
 *   2. Download the Cloudinary asset to the app's cache directory with
 *      progress callbacks driving the caller's UI.
 *   3. Hand the cache file off to MediaLibrary, which creates the OS asset.
 *      We then add that asset to a named "Secret Space" album so saved items
 *      land in a discoverable place inside Photos / Gallery.
 *   4. Delete the cache copy so we don't leak storage as users save more.
 *
 * Dedup: vault items are content-immutable once uploaded (the backend never
 * rewrites a Cloudinary URL after creation), so we cache the saved state
 * per-itemId in AsyncStorage. A second "Save" tap on the same item is a
 * no-op that shows a friendlier "Already in your gallery." toast instead of
 * downloading again. AsyncStorage is per-install, so a reinstall clears the
 * cache and lets the user re-save — which is the correct semantic (we
 * don't have a way to detect whether the OS asset still exists after a
 * reinstall, so re-allowing the save is safer than blocking it).
 *
 * Errors are translated into in-voice toast copy at every failure point —
 * raw network errors / native exceptions are never surfaced.
 */

const ALBUM_NAME = 'Secret Space';
const SAVED_KEY_PREFIX = 'vault:downloaded:';

export interface DownloadOptions {
  itemId: string;
  url: string;
  /** 'photo' | 'video' — drives the cache file extension and toast verb. */
  type: 'photo' | 'video';
  /** 0–1 progress callback invoked from FileSystem.createDownloadResumable. */
  onProgress?: (fraction: number) => void;
  /**
   * When true, the service still performs the download but does NOT emit
   * any per-item toast (success or error). Used by the bulk-download path
   * which composes a single aggregated toast at the end of the batch.
   * Permission-denied toasts are still surfaced because the user needs to
   * know why a batch halted before they got any value.
   */
  suppressToast?: boolean;
}

export interface DownloadResult {
  status: 'saved' | 'already-saved' | 'permission-denied' | 'error';
  /** Whether the duplicate-detection bailed us out before any network. */
  alreadySaved?: boolean;
}

/**
 * Public entry point. Always resolves — never throws — so the caller can
 * focus on UI state transitions rather than exception handling.
 */
export async function downloadToGallery(opts: DownloadOptions): Promise<DownloadResult> {
  const { itemId, url, type, onProgress, suppressToast = false } = opts;

  // 1. Dedup check — if we've already saved this item from this install,
  //    short-circuit. Stored key is a per-item bool, no payload needed.
  try {
    const savedFlag = await AsyncStorage.getItem(SAVED_KEY_PREFIX + itemId);
    if (savedFlag === '1') {
      if (!suppressToast) toast.info('Already in your gallery.');
      return { status: 'already-saved', alreadySaved: true };
    }
  } catch {
    // Non-fatal — AsyncStorage failure shouldn't block the download.
  }

  // 2. Permission. We request 'writeOnly' so users on Android 13+ get the
  //    narrower scoped grant (we never need to READ their gallery).
  const perm = await MediaLibrary.requestPermissionsAsync(true);
  if (perm.status !== 'granted') {
    // Soft, in-voice copy with a settings shortcut. Don't block in a modal.
    toast.error('Allow gallery access to save this. Tap to open Settings.');
    setTimeout(() => Linking.openSettings().catch(() => undefined), 1200);
    return { status: 'permission-denied' };
  }

  // 3. Download to cache. Cloudinary streams it; we report progress as a
  //    fraction so the caller can spin a percentage ring.
  const ext = type === 'video' ? 'mp4' : 'jpg';
  const safeId = itemId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const cachePath = `${FileSystem.cacheDirectory}vault-${safeId}-${Date.now()}.${ext}`;

  let localUri: string;
  try {
    const downloader = FileSystem.createDownloadResumable(
      url,
      cachePath,
      {},
      onProgress
        ? (progress) => {
            const total = progress.totalBytesExpectedToWrite || 1;
            const fraction = Math.min(1, progress.totalBytesWritten / total);
            onProgress(fraction);
          }
        : undefined
    );
    const result = await downloader.downloadAsync();
    if (!result?.uri) {
      if (!suppressToast) toast.error("Couldn't download. Try again on a better connection.");
      return { status: 'error' };
    }
    localUri = result.uri;
  } catch (err: any) {
    if (!suppressToast) toast.error("Couldn't download. Try again on a better connection.");
    return { status: 'error' };
  }

  // 4. Hand off to MediaLibrary. createAssetAsync places the file in the
  //    OS-managed gallery directory; addAssetsToAlbumAsync drops a reference
  //    into our named album so the user can find their saved items.
  try {
    const asset = await MediaLibrary.createAssetAsync(localUri);

    // The named album is best-effort — on older iOS versions or if Photos
    // is configured oddly the addAssetsToAlbumAsync call can fail even
    // after the asset itself saved correctly. Suppress that failure mode;
    // the asset is in the gallery either way, just not in the named album.
    try {
      let album = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
      if (!album) {
        album = await MediaLibrary.createAlbumAsync(ALBUM_NAME, asset, false);
      } else {
        await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      }
    } catch {
      // Asset is already in the OS gallery — failing to also file it into
      // the album is a soft-fail. The user can still find it in their main
      // camera roll.
    }

    await AsyncStorage.setItem(SAVED_KEY_PREFIX + itemId, '1').catch(() => undefined);
    if (!suppressToast) {
      toast.success(type === 'video' ? 'Video saved to your gallery.' : 'Saved to your gallery.');
    }
    return { status: 'saved' };
  } catch (err: any) {
    if (!suppressToast) toast.error("Couldn't save to your gallery.");
    return { status: 'error' };
  } finally {
    // 5. Clean up the cache copy regardless of save outcome. If MediaLibrary
    //    succeeded, the OS already has its own copy; ours is redundant. If it
    //    failed, the cache copy is useless. Either way, free the bytes.
    if (Platform.OS !== 'web') {
      FileSystem.deleteAsync(cachePath, { idempotent: true }).catch(() => undefined);
    }
  }
}

/**
 * Has this device already saved this vault item to the gallery? Used by the
 * UI to swap the action label / icon (Save → Saved checkmark) without
 * triggering an actual download.
 */
export async function hasBeenDownloaded(itemId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SAVED_KEY_PREFIX + itemId)) === '1';
  } catch {
    return false;
  }
}

import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { Linking, Platform } from 'react-native';
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
 * Re-download policy: the service does NOT track whether an item has been
 * saved before. Each call performs a full download + asset creation. On both
 * Android (MediaStore) and iOS (PHPhotoLibrary), each save call produces a
 * fresh OS asset — neither platform performs content-based deduplication,
 * which is the right behavior here: a user who taps Save again deliberately
 * wants another copy in their gallery (e.g. they deleted the original from
 * their gallery and want it back, or they want it filed into a different
 * album). The previous AsyncStorage-backed dedup was a feature-leakage from
 * a one-time-save design; users reported they wanted re-download to work,
 * and the service now defers entirely to the OS gallery's behavior.
 *
 * Errors are translated into in-voice toast copy at every failure point —
 * raw network errors / native exceptions are never surfaced.
 */

const ALBUM_NAME = 'Secret Space';

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
  /**
   * 'saved'             — asset successfully landed in the gallery
   * 'permission-denied' — user has not granted media-library write access
   * 'error'             — network failure or MediaLibrary failure
   *
   * The 'already-saved' status that earlier versions returned has been
   * removed along with the AsyncStorage dedup. The bulk caller continues to
   * destructure for it defensively but the service no longer emits it.
   */
  status: 'saved' | 'permission-denied' | 'error';
}

/**
 * Public entry point. Always resolves — never throws — so the caller can
 * focus on UI state transitions rather than exception handling.
 */
export async function downloadToGallery(opts: DownloadOptions): Promise<DownloadResult> {
  const { itemId, url, type, onProgress, suppressToast = false } = opts;

  // 1. Permission. We request 'writeOnly' so users on Android 13+ get the
  //    narrower scoped grant (we never need to READ their gallery).
  const perm = await MediaLibrary.requestPermissionsAsync(true);
  if (perm.status !== 'granted') {
    // Soft, in-voice copy with a settings shortcut. Don't block in a modal.
    toast.error('Allow gallery access to save this. Tap to open Settings.');
    setTimeout(() => Linking.openSettings().catch(() => undefined), 1200);
    return { status: 'permission-denied' };
  }

  // 2. Download to cache. Cloudinary streams it; we report progress as a
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

  // 3. Hand off to MediaLibrary. createAssetAsync places the file in the
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

    if (!suppressToast) {
      toast.success(type === 'video' ? 'Video saved to your gallery.' : 'Saved to your gallery.');
    }
    return { status: 'saved' };
  } catch (err: any) {
    if (!suppressToast) toast.error("Couldn't save to your gallery.");
    return { status: 'error' };
  } finally {
    // 4. Clean up the cache copy regardless of save outcome. If MediaLibrary
    //    succeeded, the OS already has its own copy; ours is redundant. If it
    //    failed, the cache copy is useless. Either way, free the bytes.
    if (Platform.OS !== 'web') {
      FileSystem.deleteAsync(cachePath, { idempotent: true }).catch(() => undefined);
    }
  }
}

/**
 * Legacy helper retained for backwards compatibility with the Lightbox UI
 * code that imported it. The service no longer tracks per-item save state,
 * so this always returns false. Safe to remove once all callers are
 * cleaned up.
 *
 * @deprecated The save-state dedup has been removed to allow re-downloads.
 *   Callers should drop the "already downloaded" UI hint and always render
 *   the Save affordance as available.
 */
export async function hasBeenDownloaded(_itemId: string): Promise<boolean> {
  return false;
}

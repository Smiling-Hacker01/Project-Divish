import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { ScreenContainer, TopBar, Text, Button, SegmentedControl } from '@/components';
import { useTheme } from '@/theme';
import { diaryApi, tokens } from '@/api';
import { DiaryType } from '@/types/api';
import { diaryQueue } from '@/services/diaryQueue';
import { diaryDraft, DiaryDraft } from '@/services/diaryDraft';
import { useChatSocket } from '@/context/ChatSocketContext';
import { RootStackParamList } from '@/navigation/types';

const DRAFT_AUTOSAVE_MS = 2500;
const VIDEO_MAX_SECONDS = 60;

export function DiaryCreateScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'DiaryCreate'>>();
  const resumeId = route.params?.resumeId ?? null;
  const { status: socketStatus } = useChatSocket();

  const [mode, setMode] = useState<DiaryType>('text');
  const [content, setContent] = useState('');
  // Local file-URI + MIME for the picked media; null for text-only entries.
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaMime, setMediaMime] = useState<string | null>(null);
  const [milestone, setMilestone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  // When non-null, the composer is resuming a previously-failed queue entry. We reuse
  // this localId on submit so the backend's (authorId, clientId) idempotency turns a
  // duplicate insert into a no-op.
  const [resumeFromQueue, setResumeFromQueue] = useState<{
    localId: string;
    uploadedMediaUrl: string | null;
    uploadedThumbnailUrl: string | null;
    lastError: string | null;
  } | null>(null);

  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef = useRef(false);

  // ── Hydration on mount ───────────────────────────────────────────────────────
  // Priority: explicit resumeId (failed queue entry) → autosaved draft → blank.
  // Never overlap the two — if we're resuming a queue entry, the draft is irrelevant
  // for this session (it might belong to a *different* aborted compose) so we leave
  // it untouched on disk for next time but don't load it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (resumeId) {
        const entry = await diaryQueue.get(resumeId);
        if (entry && !cancelled) {
          setMode(entry.type);
          setContent(entry.content ?? '');
          setMilestone(entry.milestone);
          // Re-attach the local mediaUri if it still resolves on disk. If not, the
          // composer renders the resume banner with a hint to re-pick.
          if (entry.mediaUri) {
            try {
              const info = await FileSystem.getInfoAsync(entry.mediaUri);
              if (info.exists && !cancelled) {
                setMediaUri(entry.mediaUri);
                setMediaMime(entry.mediaMime);
              }
            } catch {
              // file no longer there — leave mediaUri null
            }
          }
          setResumeFromQueue({
            localId: entry.localId,
            uploadedMediaUrl: entry.mediaUrl,
            uploadedThumbnailUrl: entry.thumbnailUrl,
            lastError: entry.lastError,
          });
        } else if (!entry && !cancelled) {
          // Queue entry was cleaned up between banner-tap and screen-mount. Fall
          // through to draft restore so we don't show a misleading "resuming" UI.
          loadDraft();
        }
        return;
      }
      loadDraft();

      function loadDraft() {
        diaryDraft.load().then((d) => {
          if (cancelled || !d) return;
          if (d.content.trim().length > 0) {
            setMode(d.type);
            setContent(d.content);
            setMilestone(d.milestone);
            setDraftRestored(true);
          }
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resumeId]);

  // ── Draft autosave (debounced) ───────────────────────────────────────────────
  useEffect(() => {
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    // Only save text content; mediaUri intentionally not persisted (iOS file URIs are
    // unstable across launches — user re-attaches media on resume).
    if (content.trim().length === 0) return;
    draftSaveTimer.current = setTimeout(() => {
      const draft: DiaryDraft = {
        type: mode,
        content,
        milestone,
        updatedAt: Date.now(),
      };
      diaryDraft.save(draft).catch(() => undefined);
    }, DRAFT_AUTOSAVE_MS);
    return () => {
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    };
  }, [content, mode, milestone]);

  // ── Clear draft on successful submit OR explicit user cancel ────────────────
  useEffect(() => {
    return () => {
      // If user navigated away without submitting AND had content, the draft stays so
      // they can resume. If they submitted, submittedRef gates the clear below.
      if (submittedRef.current) diaryDraft.clear().catch(() => undefined);
    };
  }, []);

  const valid = mode === 'text' ? content.trim().length > 0 : !!mediaUri;

  const pickImage = async (source: 'camera' | 'library') => {
    try {
      const perm =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission denied', `Enable ${source} access in Settings to attach a photo.`);
        return;
      }
      // We DON'T request base64 here. The bridge cost was the original problem —
      // we use the file URI and multipart upload instead.
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: true,
        aspect: [1, 1],
      };
      const r =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(opts)
          : await ImagePicker.launchImageLibraryAsync(opts);
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      setMediaUri(a.uri);
      setMediaMime(a.mimeType ?? 'image/jpeg');
    } catch (e: any) {
      Alert.alert('Could not pick image', e?.message ?? 'Try again.');
    }
  };

  const pickVideo = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission denied', 'Enable photo access in Settings to attach a video.');
        return;
      }
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        videoMaxDuration: VIDEO_MAX_SECONDS,
        // Quality 0.7 strikes the balance: visibly fine to the eye, ~3-8MB for a 30s clip.
        quality: 0.7,
      });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      // Belt-and-braces check: if videoMaxDuration was bypassed by the OS for any reason.
      if (a.duration && a.duration > VIDEO_MAX_SECONDS * 1000) {
        Alert.alert('Video too long', `Please keep videos under ${VIDEO_MAX_SECONDS}s.`);
        return;
      }
      setMediaUri(a.uri);
      setMediaMime(a.mimeType ?? 'video/mp4');
    } catch (e: any) {
      Alert.alert('Could not pick video', e?.message ?? 'Try again.');
    }
  };

  // ── Submit: enqueue → upload (if media) → create → done ─────────────────────
  // When resuming, we reuse the existing queue entry + its localId so the backend's
  // (authorId, clientId) idempotency turns a duplicate insert from a "thought it
  // failed but actually landed" scenario into a single row.
  const submit = useCallback(async () => {
    if (!valid || submitting) return;
    setSubmitting(true);

    const localId =
      resumeFromQueue?.localId ?? `dlocal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
      type: mode,
      content: content.trim(),
      mediaUri,
      mediaMime,
      milestone,
    };

    if (resumeFromQueue) {
      // Reset the failure counter and refresh the payload from the (possibly edited)
      // composer state. The original queue entry keeps the same localId so the server
      // dedupes if the prior attempt actually persisted.
      await diaryQueue.update(localId, {
        type: payload.type,
        content: payload.content,
        mediaUri: payload.mediaUri,
        mediaMime: payload.mediaMime,
        milestone: payload.milestone,
        retries: 0,
        lastError: null,
      });
    } else {
      await diaryQueue.enqueue({
        localId,
        type: payload.type,
        content: payload.content,
        mediaUri: payload.mediaUri,
        mediaMime: payload.mediaMime,
        mediaUrl: null,
        thumbnailUrl: null,
        milestone: payload.milestone,
        retries: 0,
        lastError: null,
        queuedAt: Date.now(),
      });
    }

    try {
      // Step 1 — upload media if present and not already uploaded. A resumed entry
      // may already have a Cloudinary URL from a prior attempt that succeeded at
      // upload but failed at the DB-create step; reuse it to save bandwidth.
      let mediaUrl: string | undefined = resumeFromQueue?.uploadedMediaUrl ?? undefined;
      let thumbnailUrl: string | undefined = resumeFromQueue?.uploadedThumbnailUrl ?? undefined;

      if (payload.type !== 'text' && !mediaUrl && payload.mediaUri) {
        const accessToken = await tokens.getAccess();
        if (!accessToken) throw new Error('Session expired. Please sign in again.');
        setUploadProgress(0);
        const task = FileSystem.createUploadTask(
          diaryApi.uploadUrl(),
          payload.mediaUri,
          {
            httpMethod: 'POST',
            uploadType: FileSystem.FileSystemUploadType.MULTIPART,
            fieldName: 'file',
            mimeType: payload.mediaMime ?? (payload.type === 'image' ? 'image/jpeg' : 'video/mp4'),
            parameters: { type: payload.type },
            headers: { Authorization: `Bearer ${accessToken}` },
          },
          (p) => {
            if (p.totalBytesExpectedToSend > 0) {
              setUploadProgress(p.totalBytesSent / p.totalBytesExpectedToSend);
            }
          }
        );
        const result = await task.uploadAsync();
        if (!result || result.status < 200 || result.status >= 300) {
          const detail = (() => {
            try {
              return JSON.parse(result?.body ?? '{}').error ?? `HTTP ${result?.status}`;
            } catch {
              return `HTTP ${result?.status}`;
            }
          })();
          throw new Error(detail);
        }
        const parsed = JSON.parse(result.body) as { url: string; thumbnailUrl?: string };
        if (!parsed?.url) throw new Error('Upload finished but no URL was returned.');
        mediaUrl = parsed.url;
        thumbnailUrl = parsed.thumbnailUrl;
        setUploadProgress(0.98);

        await diaryQueue.update(localId, {
          mediaUrl,
          thumbnailUrl: thumbnailUrl ?? null,
        });
      } else if (payload.type !== 'text' && !mediaUrl && !payload.mediaUri) {
        // Resuming a media entry whose local file vanished AND we never finished
        // uploading. Force the user to re-pick.
        throw new Error('The original file is no longer available. Please re-attach it.');
      }

      // Step 2 — create the diary entry. Pass localId as clientId so the server
      // dedupes retried inserts on (authorId, clientId).
      await diaryApi.create({
        type: payload.type,
        content: payload.content || undefined,
        mediaUrl,
        thumbnailUrl,
        milestone: payload.milestone,
        clientId: localId,
      });

      // Step 3 — clean up local state.
      await diaryQueue.remove(localId);
      submittedRef.current = true;
      await diaryDraft.clear();
      navigation.goBack();
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? e?.message ?? 'Try again.';
      await diaryQueue.recordFailure(localId, msg);
      Alert.alert(
        'Could not post',
        `${msg}\n\nYour draft is saved and will be retried automatically when you're online.`
      );
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  }, [content, mediaMime, mediaUri, milestone, mode, navigation, resumeFromQueue, submitting, valid]);

  // ── Auto-retry on socket reconnect ───────────────────────────────────────────
  // When the socket flips back to `connected` (came online from offline, or app
  // foregrounded after a long sleep), automatically retry any queue entry that
  // hasn't permanently failed. We restrict to the resumed entry's localId when on
  // this screen so we don't fire competing creates in the background.
  const autoRetryFiredRef = useRef(false);
  useEffect(() => {
    if (socketStatus !== 'connected') return;
    if (!resumeFromQueue) return;
    if (autoRetryFiredRef.current) return;
    if (submitting) return;
    // Only auto-retry if the user hasn't edited the composer — otherwise they're
    // mid-edit and we don't want to fire from under them.
    if (content !== '' || mediaUri !== null) {
      // user has changes; skip auto and let them manually tap Post.
      return;
    }
    autoRetryFiredRef.current = true;
    void submit();
  }, [socketStatus, resumeFromQueue, submitting, content, mediaUri, submit]);

  return (
    <ScreenContainer>
      <TopBar
        showBack={false}
        leadingElement={
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Text variant="bodyMedium" color="primary">
              Cancel
            </Text>
          </Pressable>
        }
        title="New entry"
        // Post button now lives semantically in the top bar (mirroring
        // CouponCreate). The previous implementation used a separate Button
        // with `marginTop: -44` to lift it onto the bar — fragile against any
        // bar-height change and visually disconnected. trailingElement keeps
        // Cancel / title / Post anchored together as one row.
        trailingElement={
          <Button
            label={submitting ? 'Posting…' : 'Post'}
            size="sm"
            onPress={submit}
            disabled={!valid || submitting}
            loading={submitting}
          />
        }
      />
      {/* paddingTop gives the content-type selector (and the optional draft
          banner) breathing room below the compact top bar — without it the
          segmented control sat flush against the header and read as cramped on
          Android. 12dp is a small, deliberate gap, not a height increase to the
          header itself. */}
      <View style={{ flex: 1, paddingHorizontal: theme.screenPadding, paddingTop: 12 }}>

        {resumeFromQueue && (
          <View
            style={[
              styles.draftBanner,
              {
                backgroundColor: theme.colors.surface,
                borderColor: 'rgba(232,99,122,0.4)',
              },
            ]}
          >
            <Feather name="rotate-ccw" size={14} color={theme.colors.destructive} />
            <Text variant="caption" style={{ marginLeft: 8, flex: 1 }}>
              {resumeFromQueue.lastError
                ? `Resuming failed post · ${resumeFromQueue.lastError}`
                : 'Resuming a previous post'}
            </Text>
            <Pressable
              onPress={async () => {
                await diaryQueue.remove(resumeFromQueue.localId);
                navigation.goBack();
              }}
              hitSlop={8}
            >
              <Text variant="caption" color="destructive" weight="semibold">
                Discard
              </Text>
            </Pressable>
          </View>
        )}

        {!resumeFromQueue && draftRestored && (
          <View
            style={[
              styles.draftBanner,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
            ]}
          >
            <Feather name="rotate-ccw" size={14} color={theme.colors.muted} />
            <Text variant="caption" color="muted" style={{ marginLeft: 8, flex: 1 }}>
              Restored your unsaved draft.
            </Text>
            <Pressable
              onPress={() => {
                setContent('');
                setMode('text');
                setMilestone(false);
                setDraftRestored(false);
                diaryDraft.clear().catch(() => undefined);
              }}
              hitSlop={8}
            >
              <Text variant="caption" color="primary" weight="semibold">
                Clear
              </Text>
            </Pressable>
          </View>
        )}

        <SegmentedControl
          segments={[
            { key: 'text', label: 'Text' },
            { key: 'image', label: 'Photo' },
            { key: 'video', label: 'Video' },
          ]}
          value={mode}
          onChange={(k) => {
            setMode(k as DiaryType);
            // Clear stale media when toggling away from a media mode.
            if (k === 'text') {
              setMediaUri(null);
              setMediaMime(null);
            }
          }}
        />

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {mode === 'text' && (
            <View style={{ flex: 1, marginTop: 24 }}>
              <TextInput
                value={content}
                onChangeText={setContent}
                placeholder="What happened today…"
                placeholderTextColor={theme.colors.muted}
                multiline
                autoFocus
                textAlignVertical="top"
                maxLength={10000}
                style={{
                  flex: 1,
                  fontFamily: theme.typography.serifQuote.fontFamily,
                  fontSize: 22,
                  lineHeight: 32,
                  color: theme.colors.foreground,
                  padding: 0,
                }}
              />
            </View>
          )}

          {(mode === 'image' || mode === 'video') && (
            <View style={{ marginTop: 24 }}>
              {mediaUri ? (
                <View>
                  {mode === 'image' ? (
                    <ExpoImage
                      source={{ uri: mediaUri }}
                      style={styles.preview}
                      contentFit="cover"
                      transition={150}
                    />
                  ) : (
                    <View style={[styles.preview, styles.videoPreview]}>
                      <Feather name="play-circle" size={48} color="#fff" />
                      <Text variant="bodySmall" style={{ color: '#fff', marginTop: 8 }}>
                        Video ready to post
                      </Text>
                    </View>
                  )}
                  <Pressable
                    onPress={() => {
                      setMediaUri(null);
                      setMediaMime(null);
                    }}
                    style={[styles.removeBtn, { backgroundColor: theme.colors.surface }]}
                    hitSlop={8}
                  >
                    <Feather name="x" size={16} color={theme.colors.foreground} />
                  </Pressable>
                </View>
              ) : (
                <View
                  style={[
                    styles.dropzone,
                    { borderColor: theme.colors.hairlineStrong, backgroundColor: theme.colors.glass },
                  ]}
                >
                  <Feather
                    name={mode === 'image' ? 'image' : 'film'}
                    size={32}
                    color={theme.colors.muted}
                  />
                  <Text variant="bodyMedium" style={{ marginTop: 12 }}>
                    Tap to add a {mode === 'image' ? 'photo' : 'video'}
                  </Text>
                  <Text variant="caption" color="muted" style={{ marginTop: 4 }}>
                    {mode === 'image'
                      ? 'JPG, PNG, HEIC · up to 40 MB'
                      : `MP4, MOV · up to ${VIDEO_MAX_SECONDS}s`}
                  </Text>
                </View>
              )}

              {!mediaUri && (
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                  {mode === 'image' ? (
                    <>
                      <Button
                        label="Camera"
                        leadingIcon="camera"
                        variant="secondary"
                        style={{ flex: 1 }}
                        onPress={() => pickImage('camera')}
                      />
                      <Button
                        label="Library"
                        leadingIcon="image"
                        variant="secondary"
                        style={{ flex: 1 }}
                        onPress={() => pickImage('library')}
                      />
                    </>
                  ) : (
                    <Button
                      label="Choose video"
                      leadingIcon="film"
                      variant="secondary"
                      style={{ flex: 1 }}
                      onPress={pickVideo}
                    />
                  )}
                </View>
              )}

              {/* Optional caption for media entries — small reuse of the text input */}
              {mediaUri && (
                <TextInput
                  value={content}
                  onChangeText={setContent}
                  placeholder="Add a caption (optional)…"
                  placeholderTextColor={theme.colors.muted}
                  multiline
                  maxLength={500}
                  style={{
                    marginTop: 16,
                    minHeight: 60,
                    padding: 14,
                    borderRadius: 14,
                    backgroundColor: theme.colors.surface,
                    borderWidth: 1,
                    borderColor: theme.colors.hairline,
                    color: theme.colors.foreground,
                    fontFamily: theme.typography.body.fontFamily,
                    fontSize: 15,
                  }}
                />
              )}
            </View>
          )}
        </KeyboardAvoidingView>

        {uploadProgress !== null && (
          <View
            style={[
              styles.uploadBar,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
            ]}
          >
            <View
              style={[
                styles.uploadFill,
                {
                  width: `${Math.min(100, Math.round(uploadProgress * 100))}%`,
                  backgroundColor: theme.colors.primary,
                },
              ]}
            />
            <Text variant="caption" color="muted" style={styles.uploadLabel}>
              Uploading… {Math.round(uploadProgress * 100)}%
            </Text>
          </View>
        )}

        <View style={[styles.metaRow, { borderTopColor: theme.colors.hairline }]}>
          <View
            style={[
              styles.datePill,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
            ]}
          >
            <Feather name="calendar" size={14} color={theme.colors.foreground} />
            <Text variant="caption" weight="medium" style={{ marginLeft: 6 }}>
              TODAY
            </Text>
          </View>
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => setMilestone(!milestone)} style={styles.milestone} hitSlop={8}>
            <Feather
              name="star"
              size={16}
              color={milestone ? theme.colors.accent : theme.colors.muted}
              style={{ marginRight: 6 }}
            />
            <Text variant="bodySmall" weight="medium">
              {milestone ? 'Milestone ✨' : 'Mark as milestone'}
            </Text>
          </Pressable>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  preview: { width: '100%', aspectRatio: 1, borderRadius: 20 },
  videoPreview: {
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropzone: {
    aspectRatio: 1,
    borderRadius: 28,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
  },
  milestone: { flexDirection: 'row', alignItems: 'center' },
  draftBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  uploadBar: {
    marginBottom: 12,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  uploadFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    opacity: 0.6,
  },
  uploadLabel: { textAlign: 'center' },
});

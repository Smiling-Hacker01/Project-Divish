import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ScreenContainer, TopBar, Text, Button, EmptyState, GlassSurface } from '@/components';
import { useTheme } from '@/theme';
import { vaultApi } from '@/api';
import { VaultItem } from '@/types/api';

const { width } = Dimensions.get('window');
const TILE = (Math.min(width, 430) - 32 - 16) / 3;

export function VaultGridScreen() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const [items, setItems] = useState<VaultItem[]>([]);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [showUploadSheet, setShowUploadSheet] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetch = useCallback(async () => {
    try {
      setItems(await vaultApi.list());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useFocusEffect(
    useCallback(() => {
      fetch();
    }, [fetch])
  );

  const upload = async (source: 'camera' | 'library') => {
    // 1. Close the sheet, wait for the iOS modal-dismiss animation to finish,
    //    THEN open the system picker. Without the wait, iOS silently drops the
    //    picker presentation because it overlaps the sheet's dismiss.
    setShowUploadSheet(false);
    await new Promise((r) => setTimeout(r, 350));

    let result: ImagePicker.ImagePickerResult;
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) throw new Error('Camera permission was denied.');
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) throw new Error('Photo library permission was denied.');
      }

      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality: 0.8,
        allowsEditing: false,
      };
      result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(opts)
          : await ImagePicker.launchImageLibraryAsync(opts);
    } catch (e: any) {
      Alert.alert('Could not open picker', e?.message ?? 'Try again.');
      return;
    }

    if (result.canceled || !result.assets[0]?.base64) return;

    setUploading(true);
    try {
      await vaultApi.upload({
        fileType: 'image',
        fileData: `data:image/jpeg;base64,${result.assets[0].base64}`,
      });
      await fetch();
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 401) {
        // Vault session expired — boot back to the unlock screen.
        await vaultApi.clearToken();
        Alert.alert('Session expired', 'Please unlock the vault again.');
        navigation.replace('VaultUnlock');
        return;
      }
      const msg =
        e?.response?.data?.error ??
        (e?.message?.includes('Network')
          ? 'Cannot reach the server. Is the backend running?'
          : 'Upload failed. Try again.');
      Alert.alert('Upload failed', msg);
    } finally {
      setUploading(false);
    }
  };

  const lockNow = async () => {
    await vaultApi.clearToken();
    navigation.replace('VaultUnlock');
  };

  return (
    <ScreenContainer scroll={false} glowCorner="none" edges={['top', 'bottom']}>
      <TopBar
        showBack={false}
        title="Vault"
        rightActions={[
          { icon: 'lock', onPress: lockNow },
          { icon: 'plus', onPress: () => setShowUploadSheet(true) },
        ]}
      />
      <View style={{ paddingHorizontal: theme.screenPadding, marginTop: 4 }}>
        <Text variant="caption" color="muted">
          {items.length} memories · private
        </Text>
      </View>

      {uploading && (
        <View
          style={[
            styles.uploadingBar,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
          ]}
        >
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text variant="bodySmall" color="muted" style={{ marginLeft: 10 }}>
            Uploading to your vault…
          </Text>
        </View>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon="lock"
          title="Your private space is empty"
          body="Add a moment that's just for the two of you."
          cta={{ label: 'Add your first memory', onPress: () => setShowUploadSheet(true) }}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          numColumns={3}
          contentContainerStyle={{ padding: 16, paddingBottom: theme.bottomNavReserve + 16 }}
          columnWrapperStyle={{ gap: 8 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item, index }) => (
            <Pressable onPress={() => setPreviewIdx(index)}>
              <View style={[styles.tile, { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline }]}>
                <Image source={{ uri: item.thumbnailUrl ?? item.url }} style={StyleSheet.absoluteFill} />
                {item.type === 'video' && (
                  <View style={styles.videoBadge}>
                    <Feather name="play" size={12} color="#fff" />
                  </View>
                )}
              </View>
            </Pressable>
          )}
        />
      )}

      {/* Upload sheet */}
      <Modal visible={showUploadSheet} transparent animationType="slide" onRequestClose={() => setShowUploadSheet(false)}>
        <Pressable style={styles.scrim} onPress={() => setShowUploadSheet(false)}>
          <Pressable onPress={() => {}} style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
            <View style={[styles.handle, { backgroundColor: theme.colors.hairlineStrong }]} />
            <Text variant="h3" align="center" style={{ marginTop: 16, marginBottom: 16 }}>
              Add a memory
            </Text>
            <Button label="Take a photo" leadingIcon="camera" fullWidth onPress={() => upload('camera')} />
            <Button label="Choose from library" leadingIcon="image" variant="secondary" style={{ marginTop: 12 }} fullWidth onPress={() => upload('library')} />
            <Button label="Record video (soon)" variant="ghost" style={{ marginTop: 8 }} disabled fullWidth />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Lightbox */}
      <Modal visible={previewIdx !== null} transparent animationType="fade" onRequestClose={() => setPreviewIdx(null)}>
        <View style={styles.lightbox}>
          <View style={styles.lightboxTop}>
            <Pressable onPress={() => setPreviewIdx(null)} style={styles.lightboxBtn}>
              <Feather name="x" size={22} color="#fff" />
            </Pressable>
            <Text variant="bodySmall" style={{ color: '#fff' }}>
              {(previewIdx ?? 0) + 1} / {items.length}
            </Text>
            <View style={{ width: 40 }} />
          </View>
          {previewIdx !== null && items[previewIdx] && (
            <Image source={{ uri: items[previewIdx].url }} style={styles.lightboxImage} resizeMode="contain" />
          )}
          <GlassSurface radius={28} style={styles.lightboxBar}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', padding: 12 }}>
              <Pressable style={styles.lightboxAction}>
                <Feather name="download" size={20} color="#fff" />
              </Pressable>
              <Pressable style={styles.lightboxAction}>
                <Feather name="info" size={20} color="#fff" />
              </Pressable>
              <Pressable
                style={styles.lightboxAction}
                onPress={async () => {
                  if (previewIdx === null) return;
                  await vaultApi.remove(items[previewIdx].id);
                  setPreviewIdx(null);
                  fetch();
                }}
              >
                <Feather name="trash-2" size={20} color="#E8637A" />
              </Pressable>
            </View>
          </GlassSurface>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  uploadingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  videoBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    padding: 24,
    paddingBottom: 32,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2 },
  lightbox: { flex: 1, backgroundColor: '#000' },
  lightboxTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  lightboxBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  lightboxImage: { flex: 1 },
  lightboxBar: { margin: 16, marginBottom: 32 },
  lightboxAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});

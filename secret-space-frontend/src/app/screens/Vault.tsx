import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { MobileContainer } from '../components/MobileContainer';
import { ArrowLeft, Plus, X, Camera as CameraIcon, Video, Image as ImageIcon, Lock, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { vaultApi, VaultItem } from '../api/vault';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { triggerSync, onSync } from '../services/eventBus';

export default function Vault() {
  const navigate = useNavigate();
  const location = useLocation();
  const vaultToken = location.state?.vaultToken;

  const [items, setItems] = useState<VaultItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<VaultItem | null>(null);
  const [showUploadSheet, setShowUploadSheet] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  // If component mounts without a vault token, kick them back to unlock screen
  useEffect(() => {
    if (!vaultToken) {
      navigate('/vault/unlock', { replace: true });
      return;
    }

    const fetchVaultItems = async () => {
      try {
        const data = await vaultApi.getItems(vaultToken);
        setItems(data);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchVaultItems();
    
    // Cross-device realtime sync
    const interval = setInterval(fetchVaultItems, 5000);
    const unsubscribe = onSync(fetchVaultItems);
    
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [vaultToken, navigate]);

  const handleUpload = async (type: 'camera' | 'video' | 'gallery') => {
    setShowUploadSheet(false);
    
    try {
      if (type === 'camera' || type === 'gallery') {
        const image = await Camera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.Base64,
          source: type === 'camera' ? CameraSource.Camera : CameraSource.Photos
        });
        
        setUploading(true);
        const newItem = await vaultApi.createItem(vaultToken, 'photo', image.base64String || '');
        setItems(prev => [newItem as VaultItem, ...prev]);
        triggerSync();
      } else {
        alert('Video recording coming soon to native app!');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await vaultApi.deleteItem(vaultToken, id);
      setItems(prev => prev.filter(item => item.id !== id));
      setSelectedItem(null);
      triggerSync();
    } catch(e) {
      console.error(e);
    }
  };

  const handleDownload = async () => {
    if (!selectedItem || isDownloading) return;
    setIsDownloading(true);
    try {
      const fileName = `Vault_Media_${Date.now()}.${selectedItem.type === 'photo' ? 'jpg' : 'mp4'}`;
      await Filesystem.downloadFile({
        url: selectedItem.url,
        path: fileName,
        directory: Directory.Documents,
      });
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading || !vaultToken) {
    return (
      <MobileContainer>
        <div className="min-h-screen flex items-center justify-center bg-near-black">
          <p className="text-muted-text">Accessing Vault...</p>
        </div>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer>
      <div className="min-h-screen pb-24 bg-gradient-to-b from-near-black via-background to-background">
        {/* Header - Darker theme for vault */}
        <div className="sticky top-0 bg-near-black/95 backdrop-blur-sm z-10 p-6 pb-4 border-b border-border/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <button onClick={() => navigate('/home')} className="focus:outline-none">
                <ArrowLeft className="w-6 h-6 text-warm-white" />
              </button>
              <h1 className="text-2xl font-bold text-warm-white">Vault</h1>
            </div>
            <button
              onClick={() => setShowUploadSheet(true)}
              disabled={uploading}
              className="w-10 h-10 bg-rose rounded-full flex items-center justify-center hover:bg-rose/90 transition-colors active:scale-95 disabled:opacity-50 focus:outline-none"
            >
              {uploading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <Plus className="w-5 h-5 text-warm-white" />
                </motion.div>
              ) : (
                <Plus className="w-5 h-5 text-warm-white" />
              )}
            </button>
          </div>
          <p className="text-sm text-muted-text">
            🔒 Shared Vault • Visible to you and your partner
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          {items.length === 0 ? (
            <div className="text-center py-16">
              <Lock className="w-16 h-16 text-muted-text/50 mx-auto mb-4" />
              <p className="text-muted-text mb-2">Your vault is empty</p>
              <p className="text-sm text-muted-text/70 mb-6">
                Only you and your partner can see what's here
              </p>
              <button
                onClick={() => setShowUploadSheet(true)}
                className="text-rose hover:text-rose/80 transition-colors text-sm focus:outline-none"
              >
                Upload your first item
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {items.map((item, index) => (
                <motion.button
                  key={item.id}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => setSelectedItem(item)}
                  className="aspect-square rounded-xl overflow-hidden bg-surface/50 border border-border hover:border-rose/50 transition-all active:scale-95 focus:outline-none"
                >
                  <img
                    src={item.url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  {item.type === 'video' && (
                     <div className="absolute inset-0 flex items-center justify-center bg-near-black/30">
                       <Video className="w-6 h-6 text-warm-white/80" />
                     </div>
                  )}
                </motion.button>
              ))}
            </div>
          )}
        </div>

        {/* Full Screen Viewer */}
        {selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-near-black z-50 flex flex-col"
          >
            {/* Viewer Header */}
            <div className="flex items-center justify-between p-4 bg-near-black/90 backdrop-blur-sm">
              <button
                onClick={() => setSelectedItem(null)}
                className="p-2 hover:bg-surface/50 rounded-xl transition-colors focus:outline-none"
              >
                <X className="w-6 h-6 text-warm-white" />
              </button>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="px-4 py-2 bg-surface/50 text-warm-white rounded-xl hover:bg-surface/70 transition-colors focus:outline-none flex items-center gap-2 disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  {downloadSuccess ? 'Saved!' : isDownloading ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => handleDelete(selectedItem.id)}
                  className="px-4 py-2 bg-rose/20 text-rose rounded-xl hover:bg-rose/30 transition-colors focus:outline-none"
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Media Viewer */}
            <div className="flex-1 flex items-center justify-center p-4">
              {selectedItem.type === 'photo' ? (
                <img
                  src={selectedItem.url}
                  alt=""
                  className="max-w-full max-h-full object-contain rounded-xl"
                />
              ) : (
                 <div className="text-center">
                    <Video className="w-16 h-16 text-muted-text mx-auto mb-4" />
                    <p className="text-muted-text">Video playback not supported in mock</p>
                 </div>
              )}
            </div>

            {/* Info */}
            <div className="p-4 bg-near-black/90 backdrop-blur-sm border-t border-border/50">
              <p className="text-xs text-muted-text text-center">
                {new Date(selectedItem.timestamp).toLocaleString()}
              </p>
            </div>
          </motion.div>
        )}

        {/* Upload Sheet */}
        <AnimatePresence>
          {showUploadSheet && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowUploadSheet(false)}
                className="fixed inset-0 bg-near-black/70 z-50"
              />
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25 }}
                className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-3xl z-50 border-t border-border"
              >
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-2">
                  <div className="w-12 h-1 bg-muted-text/30 rounded-full" />
                </div>

                <div className="p-6">
                  <h2 className="text-xl font-bold text-warm-white mb-6">Add to Vault</h2>
                  
                  <div className="space-y-3">
                    <button
                      onClick={() => handleUpload('camera')}
                      className="w-full flex items-center gap-4 p-4 bg-surface/50 border border-border rounded-xl hover:border-rose/50 transition-all active:scale-[0.98] outline-none"
                    >
                      <div className="w-12 h-12 bg-rose/20 rounded-full flex items-center justify-center">
                        <CameraIcon className="w-6 h-6 text-rose" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-warm-white font-medium">Take Photo</p>
                        <p className="text-sm text-muted-text">Use camera</p>
                      </div>
                    </button>

                    <button
                      onClick={() => handleUpload('video')}
                      className="w-full flex items-center gap-4 p-4 bg-surface/50 border border-border rounded-xl hover:border-rose/50 transition-all active:scale-[0.98] outline-none"
                    >
                      <div className="w-12 h-12 bg-rose/20 rounded-full flex items-center justify-center">
                        <Video className="w-6 h-6 text-rose" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-warm-white font-medium">Record Video</p>
                        <p className="text-sm text-muted-text">Use camera</p>
                      </div>
                    </button>

                    <button
                      onClick={() => handleUpload('gallery')}
                      className="w-full flex items-center gap-4 p-4 bg-surface/50 border border-border rounded-xl hover:border-rose/50 transition-all active:scale-[0.98] outline-none"
                    >
                      <div className="w-12 h-12 bg-rose/20 rounded-full flex items-center justify-center">
                        <ImageIcon className="w-6 h-6 text-rose" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-warm-white font-medium">Choose from Gallery</p>
                        <p className="text-sm text-muted-text">Select existing media</p>
                      </div>
                    </button>
                  </div>

                  <button
                    onClick={() => setShowUploadSheet(false)}
                    className="w-full mt-4 py-3 text-muted-text hover:text-warm-white transition-colors focus:outline-none"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </MobileContainer>
  );
}
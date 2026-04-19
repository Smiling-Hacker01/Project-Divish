import { useNavigate } from 'react-router';
import { MobileContainer } from '../components/MobileContainer';
import { Heart, BookHeart, Ticket, Bot, Lock, Settings, Camera as CameraIcon, Quote, RefreshCw, Eye, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useCallback } from 'react';
import { Button } from '../components/Button';
import { dashboardApi, DashboardData } from '../api/dashboard';
import { useAuth } from '../context/AuthContext';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { onSync } from '../services/eventBus';

const moods = [
  { emoji: '😊', label: 'Happy', color: 'gold' },
  { emoji: '😤', label: 'Grumpy', color: 'rose' },
  { emoji: '🌧', label: 'Low', color: 'muted-text' },
  { emoji: '⚡', label: 'Productive', color: 'gold' },
  { emoji: '💭', label: 'Missing You', color: 'rose' },
];

const dailyThoughts = [
  "Because the hardest seasons are the ones you'll be most proud of surviving together.",
  "Because one bad day doesn't erase a hundred beautiful ones.",
  "Because they chose you too.",
  "Every relationship has hard days. Staying anyway is the whole point.",
  "You chose each other once. Choose each other again today.",
  "The little moments are the big moments, looking back.",
  "Love isn't just a feeling. It's showing up, even when it's hard.",
  "Your story together is still being written. Make it beautiful.",
  "Distance means so little when someone means so much.",
  "Together is a wonderful place to be.",
  "The best thing to hold onto in life is each other.",
  "In all the world, there is no heart for me like yours.",
  "You are my today and all of my tomorrows.",
];

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [showPhotoSheet, setShowPhotoSheet] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [showFullPhoto, setShowFullPhoto] = useState(false);
  const [dailyThought, setDailyThought] = useState("");
  const [activeReason, setActiveReason] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const result = await dashboardApi.getHomeData();
      setData(result);
      setDailyThought(result.dailyThought);
    } catch (e) {
      console.error("Failed to load dashboard data", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // 5s cross-device poll
    // Subscribe to global sync events (background→foreground, mutations)
    const unsubscribe = onSync(fetchData);
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [fetchData]);

  useEffect(() => {
    if (!data) return;

    if (data.nextReasonText && data.nextReasonDeliveryTime) {
      const checkAndSet = () => {
        const now = new Date();
        const currentLocal = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        if (currentLocal >= data.nextReasonDeliveryTime!) {
          setActiveReason(data.nextReasonText);
        } else {
          setActiveReason(data.todaysReason);
        }
      };

      checkAndSet();
      const interval = setInterval(checkAndSet, 15000); // Re-calculate every 15s
      return () => clearInterval(interval);
    } else {
      setActiveReason(data.todaysReason);
    }
  }, [data]);

  const handleRefreshThought = () => {
    const newThought = dailyThoughts[Math.floor(Math.random() * dailyThoughts.length)];
    setDailyThought(newThought);
  };

  const handleChangePhoto = async () => {
    setShowPhotoSheet(false);
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: true,
        resultType: CameraResultType.Base64,
        source: CameraSource.Photos
      });

      if (image.base64String) {
        setIsLoading(true);
        const res = await dashboardApi.updateCouplePhoto(`data:image/jpeg;base64,${image.base64String}`);
        if (res.photoUrl) {
          setData(prev => prev ? { ...prev, couplePhoto: res.photoUrl } as DashboardData : null);
        }
      }
    } catch (e) {
      console.log('User cancelled or camera failed', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemovePhoto = async () => {
    try {
      await dashboardApi.removeCouplePhoto();
      setData(prev => prev ? { ...prev, couplePhoto: null } as DashboardData : null);
    } catch (e) {
      console.error(e);
    } finally {
      setShowRemoveConfirm(false);
      setShowPhotoSheet(false);
    }
  };

  const quickActions = [
    { icon: BookHeart, label: 'Diary', path: '/diary', color: 'rose' },
    { icon: Ticket, label: 'Coupons', path: '/coupons', color: 'gold' },
    { icon: Bot, label: 'Love Bot', path: '/lovebot', color: 'rose' },
    { icon: Lock, label: 'Vault', path: '/vault/unlock', color: 'muted-text' },
  ];

  if (isLoading || !data) {
    return (
      <MobileContainer>
        <div className="min-h-screen flex items-center justify-center p-6 bg-background">
          <Heart className="w-10 h-10 text-rose animate-pulse" />
        </div>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer>
      <div className="min-h-screen p-6 pb-24">
        {/* Header with Couple Photo */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => setShowPhotoSheet(true)}
            className="relative group block focus:outline-none"
          >
            {data.couplePhoto ? (
              <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-rose">
                <img src={data.couplePhoto} alt="Couple" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-rose/30 via-gold/20 to-rose/20 border-2 border-rose/50 flex items-center justify-center relative">
                <div className="flex items-center">
                  <span className="text-lg">👤</span>
                  <span className="text-lg -ml-2">👤</span>
                </div>
                <div className="absolute inset-0 bg-near-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-full flex items-center justify-center">
                  <CameraIcon className="w-5 h-5 text-warm-white" />
                </div>
              </div>
            )}
            {!data.couplePhoto && (
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-gold rounded-full flex items-center justify-center border-2 border-background">
                <CameraIcon className="w-3 h-3 text-near-black" />
              </div>
            )}
          </button>
          <button onClick={() => navigate('/settings')} className="focus:outline-none">
            <Settings className="w-6 h-6 text-muted-text hover:text-warm-white transition-colors" />
          </button>
        </div>

        {/* Partner Avatars */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex items-center justify-center mb-8 gap-4"
        >
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-rose/30 to-rose/10 border-2 border-rose flex items-center justify-center text-3xl">
            👤
          </div>
          <Heart className="w-10 h-10 text-rose fill-rose animate-pulse" />
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-gold/30 to-gold/10 border-2 border-gold flex items-center justify-center flex-col text-center">
            {data.partnerStatus === 'active' ? (
              <span className="text-3xl">👤</span>
            ) : (
              <span className="text-[10px] text-muted-text font-medium leading-tight px-2">Waiting<br />for partner</span>
            )}
          </div>
        </motion.div>

        {/* Anniversary Counter */}
        {data.partnerStatus === 'active' && (
          <div className="bg-gradient-to-br from-gold/20 to-rose/10 p-6 rounded-2xl border border-gold/30 mb-6">
            <p className="text-center text-warm-white text-lg mb-2">
              Together for <span className="font-bold text-gold">{data.daysTogether} days</span> 💛
            </p>
            <p className="text-center text-sm text-muted-text">
              Every day is a milestone
            </p>
          </div>
        )}

        {/* Mood Widget */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <button
            onClick={() => navigate('/mood')}
            className="bg-surface/50 p-4 rounded-2xl border border-border hover:border-rose/50 transition-all active:scale-[0.98] text-left"
          >
            <p className="text-xs text-muted-text mb-2">You</p>
            <div className="text-3xl mb-1">{data.myMood || '😊'}</div>
            <p className="text-sm text-warm-white">
              {moods.find(m => m.emoji === data.myMood)?.label || 'Tap to set'}
            </p>
          </button>

          <div className="bg-surface/50 p-4 rounded-2xl border border-border text-left">
            <p className="text-xs text-muted-text mb-2">Partner</p>
            <div className="text-3xl mb-1">{data.partnerStatus === 'active' ? (data.partnerMood || '💭') : '⏳'}</div>
            <p className="text-sm text-warm-white">
              {data.partnerStatus === 'active' ? (moods.find(m => m.emoji === data.partnerMood)?.label || 'Not set') : 'Pending'}
            </p>
          </div>
        </div>

        {/* Today's Love Reason */}
        {activeReason && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-gradient-to-br from-rose/20 to-rose/5 p-6 rounded-2xl border border-rose/30 mb-6"
          >
            <p className="text-xs text-muted-text mb-2">Today's Love Reason</p>
            <p className="text-warm-white leading-relaxed">"{activeReason}"</p>
          </motion.div>
        )}

        {/* Pending Placeholder (If no active reason but a queued one exists) */}
        {!activeReason && data.nextReasonText && data.nextReasonDeliveryTime && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-gradient-to-br from-muted-text/10 to-muted-text/5 p-6 rounded-2xl border border-muted-text/20 mb-6"
          >
            <p className="text-xs text-muted-text mb-2">New Note Arriving Soon</p>
            <p className="text-warm-white/50 italic leading-relaxed">Check back later! 🕒</p>
          </motion.div>
        )}

        {/* Daily Thought Card */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="relative bg-gradient-to-br from-warm-white/5 to-warm-white/10 p-8 rounded-2xl border border-warm-white/10 mb-6"
        >
          <div className="absolute top-4 left-4 opacity-20">
            <Quote className="w-8 h-8 text-warm-white" />
          </div>

          <button
            onClick={handleRefreshThought}
            className="absolute top-4 right-4 p-2 hover:bg-warm-white/10 rounded-lg transition-colors group focus:outline-none"
          >
            <RefreshCw className="w-4 h-4 text-muted-text group-hover:text-warm-white group-hover:rotate-180 transition-all duration-300" />
          </button>

          <p className="text-xs text-gold mb-3 font-medium text-center">Reasons to never give up on each other 💛</p>
          <p className="text-warm-white/90 leading-relaxed italic text-center">
            "{dailyThought}"
          </p>
        </motion.div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-sm font-medium text-muted-text mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-4">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => navigate(action.path)}
                className="flex flex-col items-center gap-2 p-4 bg-surface/50 rounded-2xl border border-border hover:border-rose/50 transition-all active:scale-[0.98] outline-none"
              >
                <action.icon className="w-8 h-8" style={{ color: action.color === 'rose' ? '#e74c8b' : action.color === 'gold' ? '#f1c40f' : '#888' }} />
                <span className="text-sm text-warm-white font-medium">{action.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Photo Sheet */}
        <AnimatePresence>
          {showPhotoSheet && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowPhotoSheet(false)}
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
                  <h2 className="text-xl font-bold text-warm-white mb-6">Couple Photo</h2>

                  <div className="space-y-3">
                    {data.couplePhoto && (
                      <button
                        onClick={() => {
                          setShowPhotoSheet(false);
                          setShowFullPhoto(true);
                        }}
                        className="w-full flex items-center gap-4 p-4 bg-surface/50 border border-border rounded-xl hover:border-rose/50 transition-all active:scale-[0.98]"
                      >
                        <div className="w-12 h-12 bg-rose/20 rounded-full flex items-center justify-center">
                          <Eye className="w-6 h-6 text-rose" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-warm-white font-medium">View Photo</p>
                          <p className="text-sm text-muted-text">See full size</p>
                        </div>
                      </button>
                    )}

                    <button
                      onClick={handleChangePhoto}
                      className="w-full flex items-center gap-4 p-4 bg-surface/50 border border-border rounded-xl hover:border-rose/50 transition-all active:scale-[0.98]"
                    >
                      <div className="w-12 h-12 bg-rose/20 rounded-full flex items-center justify-center">
                        <CameraIcon className="w-6 h-6 text-rose" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-warm-white font-medium">Change Photo</p>
                        <p className="text-sm text-muted-text">Upload new photo</p>
                      </div>
                    </button>

                    {data.couplePhoto && (
                      <button
                        onClick={() => {
                          setShowPhotoSheet(false);
                          setShowRemoveConfirm(true);
                        }}
                        className="w-full flex items-center gap-4 p-4 bg-surface/50 border border-border rounded-xl hover:border-rose/50 transition-all active:scale-[0.98]"
                      >
                        <div className="w-12 h-12 bg-rose/20 rounded-full flex items-center justify-center">
                          <Trash2 className="w-6 h-6 text-rose" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-warm-white font-medium">Remove Photo</p>
                          <p className="text-sm text-muted-text">Revert to default</p>
                        </div>
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => setShowPhotoSheet(false)}
                    className="w-full mt-4 py-3 text-muted-text hover:text-warm-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Remove Confirm */}
        <AnimatePresence>
          {showRemoveConfirm && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowRemoveConfirm(false)}
                className="fixed inset-0 bg-near-black/70 z-50"
              />
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface p-6 rounded-2xl border border-border w-80 z-50"
              >
                <h3 className="text-lg font-bold text-warm-white mb-2">Remove your couple photo?</h3>
                <p className="text-sm text-muted-text mb-6">This will revert to the default avatar</p>

                <div className="space-y-3">
                  <Button variant="secondary" fullWidth onClick={handleRemovePhoto}>Remove</Button>
                  <Button variant="ghost" fullWidth onClick={() => setShowRemoveConfirm(false)} className="!text-muted-text">Cancel</Button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Full Photo Viewer */}
        <AnimatePresence>
          {showFullPhoto && data.couplePhoto && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowFullPhoto(false)}
                className="fixed inset-0 bg-near-black z-50"
              />
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-6"
              >
                <button
                  onClick={() => setShowFullPhoto(false)}
                  className="absolute top-6 right-6 w-10 h-10 bg-surface/80 rounded-full flex items-center justify-center hover:bg-surface transition-colors focus:outline-none"
                >
                  <X className="w-5 h-5 text-warm-white" />
                </button>
                <img src={data.couplePhoto} alt="Couple" className="max-w-full max-h-full rounded-2xl" />
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </MobileContainer>
  );
}
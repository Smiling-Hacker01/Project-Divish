import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { MobileContainer } from '../components/MobileContainer';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { dashboardApi } from '../api/dashboard';
import { triggerSync } from '../services/eventBus';

const moods = [
  { emoji: '😊', label: 'Happy', description: 'Feeling great!' },
  { emoji: '😤', label: 'Grumpy', description: 'Not my best day' },
  { emoji: '🌧', label: 'Low', description: 'Feeling down' },
  { emoji: '⚡', label: 'Productive', description: 'Getting things done' },
  { emoji: '💭', label: 'Missing You', description: 'Wish we were together' },
];

export default function MoodCheckIn() {
  const navigate = useNavigate();
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCurrentMood = async () => {
      try {
        const data = await dashboardApi.getHomeData();
        setSelectedMood(data.myMood || null);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCurrentMood();
  }, []);

  const handleSelectMood = async (emoji: string) => {
    if (isUpdating) return;
    
    setSelectedMood(emoji);
    setIsUpdating(true);
    
    try {
      await dashboardApi.updateMood(emoji);
      triggerSync();
      // Animate and navigate back
      setTimeout(() => {
        navigate('/home');
      }, 800);
    } catch (e) {
      console.error(e);
      setIsUpdating(false);
    }
  };

  return (
    <MobileContainer>
      <div className="min-h-screen p-6">
        <div className="flex items-center mb-8">
          <button onClick={() => navigate('/home')} className="mr-4 focus:outline-none">
            <ArrowLeft className="w-6 h-6 text-warm-white" />
          </button>
          <h1 className="text-2xl font-bold text-warm-white">How are you feeling?</h1>
        </div>

        <p className="text-muted-text mb-12">
          Let your partner know your current mood
        </p>

        <div className="space-y-4">
          {moods.map((mood, index) => (
            <motion.button
              key={mood.emoji}
              initial={{ x: -50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => handleSelectMood(mood.emoji)}
              disabled={isUpdating || isLoading}
              className={`w-full p-6 rounded-2xl border-2 transition-all block focus:outline-none outline-none ${!isUpdating ? 'active:scale-[0.98]' : 'opacity-80'} ${
                selectedMood === mood.emoji
                  ? 'bg-rose/20 border-rose shadow-lg shadow-rose/20'
                  : 'bg-surface/50 border-border hover:border-rose/30'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="text-5xl">{mood.emoji}</div>
                <div className="flex-1 text-left">
                  <h3 className="text-xl font-medium text-warm-white mb-1">
                    {mood.label}
                  </h3>
                  <p className="text-sm text-muted-text">
                    {mood.description}
                  </p>
                </div>
                {selectedMood === mood.emoji && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-6 h-6 bg-rose rounded-full flex items-center justify-center"
                  >
                    <span className="text-warm-white text-sm">✓</span>
                  </motion.div>
                )}
              </div>
            </motion.button>
          ))}
        </div>

        {selectedMood && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className={`mt-8 p-4 bg-gold/10 border border-gold/30 rounded-xl text-center ${isUpdating ? 'animate-pulse' : ''}`}
          >
            <p className="text-sm text-gold">
              {isUpdating ? 'Saving...' : 'Your partner will see this on their home screen'}
            </p>
          </motion.div>
        )}
      </div>
    </MobileContainer>
  );
}

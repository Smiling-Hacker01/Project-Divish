import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { MobileContainer } from '../components/MobileContainer';
import { ArrowLeft, Plus, Heart, MessageCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { diaryApi, DiaryEntry } from '../api/diary';
import { onSync } from '../services/eventBus';

export default function Diary() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchEntries = useCallback(async () => {
    try {
      const data = await diaryApi.getEntries();
      setEntries(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
    return onSync(fetchEntries);
  }, [fetchEntries]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    }
  };

  return (
    <MobileContainer>
      <div className="min-h-screen pb-24">
        {/* Header */}
        <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 p-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <button onClick={() => navigate('/home')} className="focus:outline-none">
                <ArrowLeft className="w-6 h-6 text-warm-white" />
              </button>
              <h1 className="text-2xl font-bold text-warm-white">Our Diary</h1>
            </div>
            <button
              onClick={() => navigate('/diary/create')}
              className="w-10 h-10 bg-rose rounded-full flex items-center justify-center hover:bg-rose/90 transition-colors active:scale-95 focus:outline-none"
            >
              <Plus className="w-5 h-5 text-warm-white" />
            </button>
          </div>
        </div>

        {/* Feed */}
        <div className="p-6 space-y-4">
          {isLoading ? (
            <div className="text-center py-12">
               <p className="text-muted-text">Loading diary...</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-text mb-4">No entries yet</p>
              <button
                onClick={() => navigate('/diary/create')}
                className="text-rose hover:text-rose/80 transition-colors focus:outline-none"
              >
                Create your first entry
              </button>
            </div>
          ) : (
            entries.map((entry, index) => (
              <motion.div
                key={entry.id}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => navigate(`/diary/${entry.id}`)}
                className="bg-surface/50 p-6 rounded-2xl border border-border hover:border-rose/30 transition-all cursor-pointer"
              >
                {/* Author header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-full ${
                    entry.author === 'you' 
                      ? 'bg-gradient-to-br from-rose/30 to-rose/10 border-2 border-rose' 
                      : 'bg-gradient-to-br from-gold/30 to-gold/10 border-2 border-gold'
                  } flex items-center justify-center text-xl`}>
                    👤
                  </div>
                  <div className="flex-1">
                    <p className="text-warm-white font-medium">
                      {entry.author === 'you' ? 'You' : 'Partner'}
                    </p>
                    <p className="text-xs text-muted-text">
                      {formatTime(entry.timestamp)}
                    </p>
                  </div>
                </div>

                {/* Content */}
                {(entry.type === 'image' || (entry.type as string) === 'photo' || entry.content.startsWith('http')) ? (
                  <div className="w-full mb-4 rounded-xl overflow-hidden bg-surface/50">
                    <img src={entry.content} alt="Diary Entry" className="w-full h-auto object-cover max-h-80" />
                  </div>
                ) : (
                  <p className="text-warm-white leading-relaxed mb-4 whitespace-pre-wrap">
                    {entry.content}
                  </p>
                )}

                {/* Reaction bar */}
                <div className="flex items-center gap-6 pt-4 border-t border-border">
                  <button className="flex items-center gap-2 text-muted-text hover:text-rose transition-colors focus:outline-none">
                    <Heart className="w-5 h-5" />
                    <span className="text-sm">{entry.likes}</span>
                  </button>
                  <button className="flex items-center gap-2 text-muted-text hover:text-warm-white transition-colors focus:outline-none">
                    <MessageCircle className="w-5 h-5" />
                    <span className="text-sm">{entry.comments}</span>
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </MobileContainer>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '../components/Button';
import { MobileContainer } from '../components/MobileContainer';
import { ArrowLeft } from 'lucide-react';
import { loveBotApi } from '../api/lovebot';

export default function LoveBotAddReason() {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [forPartner, setForPartner] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [error, setError] = useState('');

  const handleAdd = async () => {
    setIsSubmitting(true);
    setError('');
    try {
      await loveBotApi.addReason(text, forPartner);
      navigate('/lovebot');
    } catch (e: any) {
      console.error(e);
      setError(e.response?.data?.error || 'Failed to add reason');
      setIsSubmitting(false);
    }
  };

  return (
    <MobileContainer>
      <div className="min-h-screen flex flex-col p-6">
        {/* Header */}
        <div className="flex items-center mb-4">
          <button onClick={() => navigate('/lovebot')} className="focus:outline-none">
            <ArrowLeft className="w-6 h-6 text-warm-white" />
          </button>
          <h1 className="ml-4 text-2xl font-bold text-warm-white">Add Love Reason</h1>
        </div>

        {/* Form */}
        <div className="flex-1 space-y-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-warm-white mb-2">
              Love Reason
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="I love you because..."
              className="w-full h-32 px-4 py-3 bg-surface/50 border border-border rounded-xl text-warm-white placeholder:text-muted-text focus:outline-none focus:ring-2 focus:ring-rose/50 focus:border-rose resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-warm-white mb-4">
              Send to
            </label>
            <div className="space-y-3">
              <button
                onClick={() => setForPartner(true)}
                className={`w-full p-4 rounded-2xl border-2 transition-all block focus:outline-none outline-none ${
                  forPartner
                    ? 'bg-surface/50 border-rose'
                    : 'bg-surface/20 border-border hover:border-rose/30'
                }`}
              >
                <div className="flex items-center justify-between pointer-events-none">
                  <div className="text-left">
                    <p className="text-warm-white font-medium">Partner</p>
                    <p className="text-sm text-muted-text">They will receive this reason</p>
                  </div>
                  {forPartner && (
                    <div className="w-5 h-5 bg-rose rounded-full flex items-center justify-center">
                      <span className="text-warm-white text-xs">✓</span>
                    </div>
                  )}
                </div>
              </button>

              <button
                onClick={() => setForPartner(false)}
                className={`w-full p-4 rounded-2xl border-2 transition-all block focus:outline-none outline-none ${
                  !forPartner
                    ? 'bg-surface/50 border-rose'
                    : 'bg-surface/20 border-border hover:border-rose/30'
                }`}
              >
                <div className="flex items-center justify-between pointer-events-none">
                  <div className="text-left">
                    <p className="text-warm-white font-medium">You</p>
                    <p className="text-sm text-muted-text">You will receive this reason (two-way mode)</p>
                  </div>
                  {!forPartner && (
                    <div className="w-5 h-5 bg-rose rounded-full flex items-center justify-center">
                      <span className="text-warm-white text-xs">✓</span>
                    </div>
                  )}
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Error message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-error/20 border border-error/50 rounded-xl p-3 mb-4 flex items-center gap-2"
            >
              <p className="text-error text-sm">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Add Button */}
        <Button
          variant="primary"
          fullWidth
          onClick={handleAdd}
          disabled={!text.trim() || isSubmitting}
        >
          {isSubmitting ? 'Adding...' : 'Add Reason 💛'}
        </Button>
      </div>
    </MobileContainer>
  );
}

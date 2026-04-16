import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { MobileContainer } from '../components/MobileContainer';
import { Copy, Check } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';

export default function CoupleCode() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [coupleCode, setCoupleCode] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Generate a unique couple code or use user's code
    const code = user?.coupleCode || `LOVE-${Math.floor(100 + Math.random() * 900)}-${
      String.fromCharCode(65 + Math.floor(Math.random() * 26)) +
      String.fromCharCode(65 + Math.floor(Math.random() * 26)) +
      String.fromCharCode(65 + Math.floor(Math.random() * 26))
    }`;
    setCoupleCode(code);
  }, [user]);

  const handleCopy = () => {
    navigator.clipboard.writeText(coupleCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleContinue = () => {
    navigate('/home');
  };

  return (
    <MobileContainer>
      <div className="min-h-screen flex flex-col p-6">
        <div className="flex-1">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-text">Step 3 of 3</span>
            </div>
            <div className="w-full bg-surface/30 h-1 rounded-full">
              <div className="w-full bg-rose h-1 rounded-full" />
            </div>
          </div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-3xl font-bold text-warm-white mb-2">
              Your Couple Code
            </h1>
            <p className="text-muted-text mb-12">
              Share this code with your partner so they can join your private space
            </p>

            <div className="bg-gradient-to-br from-rose/20 to-gold/10 p-8 rounded-2xl border border-rose/30 mb-8">
              <div className="text-center mb-6">
                <p className="text-sm text-muted-text mb-4">Your unique code</p>
                <div className="font-mono text-3xl font-bold text-warm-white tracking-[0.3em] mb-2">
                  {coupleCode}
                </div>
              </div>
              
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={handleCopy}
                  className="flex items-center justify-center gap-2"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy Code
                    </>
                  )}
                </Button>
                
                <Button
                  variant="ghost"
                  fullWidth
                  onClick={() => {
                    if (navigator.share) {
                      navigator.share({
                        title: 'Join Our Space',
                        text: `Join me on Together! Use code: ${coupleCode}`,
                      });
                    }
                  }}
                >
                  Share
                </Button>
              </div>
            </div>

            <div className="bg-surface/30 p-6 rounded-2xl border border-border">
              <p className="text-sm text-muted-text text-center leading-relaxed">
                This code is private and can only be used once. Your partner will need to create their account and enter this code to link your spaces together.
              </p>
            </div>
          </motion.div>
        </div>

        <Button
          variant="primary"
          fullWidth
          onClick={handleContinue}
        >
          Continue to Home
        </Button>
      </div>
    </MobileContainer>
  );
}

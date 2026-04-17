import { useState } from 'react';
import { useNavigate } from 'react-router';
import { MobileContainer } from '../components/MobileContainer';
import { Lock, Fingerprint } from 'lucide-react';
import { motion } from 'motion/react';
import { vaultApi } from '../api/vault';

export default function VaultUnlock() {
  const navigate = useNavigate();
  const [state, setState] = useState<'locked' | 'unlocking' | 'unlocked'>('locked');
  const [errorMsg, setErrorMsg] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);

  const handleUnlock = async () => {
    setState('unlocking');
    setErrorMsg('');
    try {
      // In a real app with capacitor/cordova this would call native biometrics, 
      // then send a signature to the backend to get a short-lived vault token.
      const res = await vaultApi.verifyAccess();
      if ((res as any).token) {
        setState('unlocked');
        setTimeout(() => {
           navigate('/vault', { state: { vaultToken: (res as any).token } });
        }, 800);
      }
    } catch (e) {
      console.error(e);
      setErrorMsg('Biometric verification failed.');
      setState('locked'); // Go back to locked state on failure
    }
  };

  const handlePasswordUnlock = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!password) return;
    setIsPasswordLoading(true);
    setErrorMsg('');
    try {
      const res = await vaultApi.verifyAccessPasswordFallback(password);
      if ((res as any).token) {
        setState('unlocked');
        setTimeout(() => {
           navigate('/vault', { state: { vaultToken: (res as any).token } });
        }, 800);
      }
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.response?.data?.error || 'Incorrect password.');
      setState('locked');
    } finally {
      setIsPasswordLoading(false);
    }
  };

  return (
    <MobileContainer>
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-background via-near-black to-background">
        {state === 'locked' && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center"
          >
            <div className="mb-8">
              <Lock className="w-24 h-24 text-muted-text mx-auto mb-6" />
              <h1 className="text-3xl font-bold text-warm-white mb-2">
                Personal Vault
              </h1>
              <p className="text-muted-text">
                Only you can see what's here
              </p>
            </div>

            <button
              onClick={handleUnlock}
              className="flex flex-col items-center gap-4 px-12 py-8 bg-surface/50 border-2 border-border hover:border-rose/50 rounded-3xl transition-all active:scale-95 focus:outline-none"
            >
              <Fingerprint className="w-16 h-16 text-rose" />
              <span className="text-warm-white font-medium">
                Unlock with Biometrics
              </span>
            </button>

            {errorMsg && (
              <p className="text-sm text-rose mt-4 animate-in slide-in-from-bottom-2 fade-in duration-300">
                {errorMsg}
              </p>
            )}

            {/* Password Fallback Form */}
            {errorMsg && (
              <form onSubmit={handlePasswordUnlock} className="mt-8 pt-6 border-t border-border animate-in fade-in duration-500">
                <p className="text-sm text-muted-text mb-4">Use your account password instead:</p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="flex-1 px-4 py-3 bg-surface/50 border border-border rounded-xl text-warm-white focus:outline-none focus:ring-2 focus:ring-rose/50"
                  />
                  <button
                    type="submit"
                    disabled={isPasswordLoading || !password}
                    className="px-6 py-3 bg-rose rounded-xl text-warm-white font-medium hover:bg-rose/90 disabled:opacity-50 transition-colors focus:outline-none"
                  >
                    {isPasswordLoading ? '...' : 'Unlock'}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        )}

        {state === 'unlocking' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
          >
            <motion.div
              animate={{
                scale: [1, 1.1, 1],
                rotate: [0, 180, 360],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
              }}
            >
              <Fingerprint className="w-24 h-24 text-rose mx-auto mb-6" />
            </motion.div>
            <p className="text-warm-white">Verifying...</p>
          </motion.div>
        )}

        {state === 'unlocked' && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center"
          >
            <div className="text-6xl mb-4 text-gold">✓</div>
            <h2 className="text-2xl font-bold text-gold mb-2">
              Unlocked
            </h2>
            <p className="text-muted-text">
              Opening vault...
            </p>
          </motion.div>
        )}
      </div>
    </MobileContainer>
  );
}

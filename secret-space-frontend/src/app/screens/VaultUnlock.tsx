import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { MobileContainer } from '../components/MobileContainer';
import { Lock, Fingerprint, KeyRound, ShieldAlert, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { vaultApi, checkBiometricAvailability, BiometricStatus } from '../api/vault';

type UnlockStage =
  | 'initializing'    // checking biometric availability
  | 'biometric-ready'  // biometrics available, show fingerprint button
  | 'biometric-prompt' // native dialog is open
  | 'fallback'         // password entry (either after failure or no biometric)
  | 'unlocking'        // verifying password with backend
  | 'unlocked';        // success – navigating to vault

export default function VaultUnlock() {
  const navigate = useNavigate();

  const [stage, setStage] = useState<UnlockStage>('initializing');
  const [biometricStatus, setBiometricStatus] = useState<BiometricStatus | null>(null);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);
  const [biometricAttempted, setBiometricAttempted] = useState(false);

  // ── On mount: check if biometrics are available ───────────────────────────
  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const status = await checkBiometricAvailability();
      if (cancelled) return;

      setBiometricStatus(status);

      if (status.available) {
        setStage('biometric-ready');
      } else {
        // No biometrics → go straight to password fallback
        setError(status.reason || '');
        setStage('fallback');
      }
    };

    check();
    return () => { cancelled = true; };
  }, []);

  // ── Biometric unlock ──────────────────────────────────────────────────────
  const handleBiometricUnlock = useCallback(async () => {
    setStage('biometric-prompt');
    setError('');
    setBiometricAttempted(true);

    try {
      const res = await vaultApi.verifyAccess();

      if (res?.token) {
        setStage('unlocked');
        setTimeout(() => navigate('/vault', { state: { vaultToken: res.token } }), 800);
      } else {
        setError('Unexpected response from server. Please use your password.');
        setStage('fallback');
      }
    } catch (e: any) {
      const msg = e?.message || 'Biometric verification failed.';
      setError(msg);
      setStage('fallback');
    }
  }, [navigate]);

  // ── Password fallback ─────────────────────────────────────────────────────
  const handlePasswordUnlock = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!password || isPasswordLoading) return;

    setIsPasswordLoading(true);
    setError('');

    try {
      const res = await vaultApi.verifyAccessPasswordFallback(password);

      if (res?.token) {
        setStage('unlocked');
        setTimeout(() => navigate('/vault', { state: { vaultToken: res.token } }), 800);
      } else {
        setError('Unexpected server response. Please try again.');
      }
    } catch (e: any) {
      setError(e.response?.data?.error || 'Incorrect password. Please try again.');
    } finally {
      setIsPasswordLoading(false);
    }
  }, [password, isPasswordLoading, navigate]);

  // ── Rendering ─────────────────────────────────────────────────────────────

  return (
    <MobileContainer>
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-background via-near-black to-background">

        {/* ── Stage: Initializing ──────────────────────────────────────── */}
        {stage === 'initializing' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            >
              <Lock className="w-16 h-16 text-muted-text mx-auto mb-4" />
            </motion.div>
            <p className="text-muted-text">Checking security...</p>
          </motion.div>
        )}

        {/* ── Stage: Biometric Ready ───────────────────────────────────── */}
        {stage === 'biometric-ready' && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center w-full max-w-sm"
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
              onClick={handleBiometricUnlock}
              className="flex flex-col items-center gap-4 px-12 py-8 mx-auto bg-surface/50 border-2 border-border hover:border-rose/50 rounded-3xl transition-all active:scale-95 focus:outline-none"
            >
              <Fingerprint className="w-16 h-16 text-rose" />
              <span className="text-warm-white font-medium">
                {biometricStatus?.biometryType === 'face'
                  ? 'Unlock with Face ID'
                  : 'Unlock with Fingerprint'}
              </span>
            </button>

            {/* Always show password option */}
            <button
              onClick={() => { setError(''); setStage('fallback'); }}
              className="mt-6 text-sm text-muted-text hover:text-warm-white transition-colors focus:outline-none"
            >
              Use password instead
            </button>
          </motion.div>
        )}

        {/* ── Stage: Native Biometric Prompt in Progress ───────────────── */}
        {stage === 'biometric-prompt' && (
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
            <p className="text-warm-white font-medium mb-2">Verifying...</p>
            <p className="text-sm text-muted-text">Place your finger on the sensor</p>
          </motion.div>
        )}

        {/* ── Stage: Password Fallback ─────────────────────────────────── */}
        {stage === 'fallback' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-sm text-center"
          >
            {/* Back button — go to biometric if it's available */}
            {biometricStatus?.available && (
              <button
                onClick={() => { setError(''); setStage('biometric-ready'); }}
                className="text-muted-text hover:text-warm-white mb-6 flex items-center gap-2 focus:outline-none"
              >
                <ArrowLeft className="w-4 h-4" /> Back to biometric
              </button>
            )}

            <div className="mb-6">
              <div className="w-16 h-16 bg-surface/50 rounded-full flex items-center justify-center mx-auto mb-4">
                <KeyRound className="w-8 h-8 text-rose" />
              </div>
              <h1 className="text-2xl font-bold text-warm-white mb-2">
                Unlock with Password
              </h1>
              <p className="text-sm text-muted-text">
                {biometricAttempted
                  ? 'Biometric failed. Use your account password.'
                  : !biometricStatus?.available
                    ? (biometricStatus?.reason || 'Biometric not available.')
                    : 'Enter your account password to access the vault.'}
              </p>
            </div>

            {/* Error alert */}
            {error && (
              <div className="flex items-center gap-3 p-4 mb-6 bg-rose/10 border border-rose/30 rounded-xl text-left">
                <ShieldAlert className="w-5 h-5 text-rose flex-shrink-0" />
                <p className="text-sm text-rose">{error}</p>
              </div>
            )}

            <form onSubmit={handlePasswordUnlock} className="space-y-4">
              <input
                type="password"
                placeholder="Enter your account password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                autoFocus
                className="w-full px-4 py-3.5 bg-surface/50 border border-border rounded-xl text-warm-white placeholder:text-muted-text focus:outline-none focus:ring-2 focus:ring-rose/50 focus:border-rose"
              />
              <button
                type="submit"
                disabled={isPasswordLoading || !password}
                className="w-full py-3.5 bg-rose rounded-xl text-warm-white font-medium hover:bg-rose/90 disabled:opacity-50 transition-colors focus:outline-none active:scale-[0.98]"
              >
                {isPasswordLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="inline-block w-4 h-4 border-2 border-warm-white/30 border-t-warm-white rounded-full"
                    />
                    Verifying...
                  </span>
                ) : (
                  'Unlock Vault'
                )}
              </button>
            </form>

            {/* Retry biometric if available */}
            {biometricStatus?.available && biometricAttempted && (
              <button
                onClick={handleBiometricUnlock}
                className="mt-4 text-sm text-muted-text hover:text-warm-white transition-colors focus:outline-none"
              >
                Try biometric again
              </button>
            )}
          </motion.div>
        )}

        {/* ── Stage: Unlocking (password submitted) ────────────────────── */}
        {stage === 'unlocking' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            >
              <Lock className="w-16 h-16 text-rose mx-auto mb-4" />
            </motion.div>
            <p className="text-warm-white">Unlocking vault...</p>
          </motion.div>
        )}

        {/* ── Stage: Unlocked ──────────────────────────────────────────── */}
        {stage === 'unlocked' && (
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

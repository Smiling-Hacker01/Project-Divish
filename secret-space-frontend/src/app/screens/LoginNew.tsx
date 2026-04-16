import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { OTPInput } from '../components/OTPInput';
import { MobileContainer } from '../components/MobileContainer';
import { Lock, ScanFace, Mail, Key, AlertCircle, ArrowLeft, Timer } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { authApi } from '../api/auth';
import { useAuth } from '../context/AuthContext';

type LoginMode = 'email-entry' | 'face-password' | 'otp-only' | 'password-only' | 'face-scan';
type FaceScanState = 'idle' | 'scanning' | 'verified' | 'failed';

export default function LoginNew() {
  const navigate = useNavigate();
  const { loginState } = useAuth();
  
  const [mode, setMode] = useState<LoginMode>('email-entry');
  const [email, setEmail] = useState('');
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [password, setPassword] = useState('');
  const [faceScanState, setFaceScanState] = useState<FaceScanState>('idle');
  const [showOTPPrompt, setShowOTPPrompt] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [tempToken, setTempToken] = useState<string>('');
  const [hasFaceMFA, setHasFaceMFA] = useState<boolean>(false);

  // OTP manual control state
  const [otpValue, setOtpValue] = useState('');

  // Resend OTP cooldown
  const [resendCooldown, setResendCooldown] = useState(0);

  // 429 Rate-limit lockout
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const maskedEmail = email ? `${email.charAt(0)}****${email.split('@')[1] || ''}` : '';

  // ── Resend OTP Cooldown Timer ──────────────────────────────────────────────
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // ── 429 Rate-Limit Countdown Timer ─────────────────────────────────────────
  useEffect(() => {
    if (rateLimitSeconds <= 0) return;
    const timer = setInterval(() => {
      setRateLimitSeconds(prev => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [rateLimitSeconds]);

  // ── 429 Error Interceptor ──────────────────────────────────────────────────
  const handleApiError = useCallback((err: any) => {
    if (err.response?.status === 429) {
      // Parse retry-after header or default 15 minutes
      const retryAfter = parseInt(err.response.headers?.['retry-after'] || '900', 10);
      setRateLimitSeconds(retryAfter);
      setError('');
      return;
    }
    setError(err.response?.data?.error || 'Something went wrong. Please try again.');
  }, []);

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // ── Prevent focus-steal (double-click fix) ─────────────────────────────────
  const preventBlur = (e: React.MouseEvent) => e.preventDefault();

  const handleEmailSubmit = () => {
    if (!email) {
      setError('Please enter your email');
      return;
    }
    const emailToTest = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailToTest)) {
      setError('Please enter a valid email address');
      return;
    }
    setEmail(emailToTest);
    setError('');
    setEmailConfirmed(true);
  };

  const executeLoginBase = async (): Promise<{ success: boolean; token?: string; isFaceMFA?: boolean }> => {
    if (isLoading) return { success: false }; // Debounce guard
    setIsLoading(true);
    setError('');
    try {
      const res = await authApi.login({ email, password });
      
      // If no MFA required, we might get full tokens directly
      if (res.accessToken && res.user) {
        loginState(res.user, res.accessToken);
        navigate('/home');
        return { success: true };
      }
      
      // Otherwise we get a tempToken for MFA
      if (res.tempToken) {
        setTempToken(res.tempToken);
        const isFace = res.mfaMethod === 'face';
        if (isFace) {
          setHasFaceMFA(true);
        }
        return { success: true, token: res.tempToken, isFaceMFA: isFace };
      }
      
      setError('Invalid login response');
      return { success: false };
    } catch (err: any) {
      handleApiError(err);
      return { success: false };
    } finally {
      setIsLoading(false);
    }
  };

  const handleFacePasswordLogin = async () => {
    if (isLoading) return; // Debounce guard
    if (!password) { setError('Please enter your password'); return; }
    
    const result = await executeLoginBase();
    if (result.success && result.token) {
       if (result.isFaceMFA) {
         setMode('face-scan');
         startCamera();
       } else {
         setError('No face ID found for this account. Please use another login method.');
       }
    }
  };

  const handlePasswordOnlyLogin = async () => {
    if (isLoading) return; // Debounce guard
    if (!password) { setError('Please enter your password'); return; }
    
    const result = await executeLoginBase();
    if (result.success && result.token) {
      setMode('otp-only');
      try {
        await authApi.otpRequest(result.token);
        setResendCooldown(60); // Start cooldown after initial send
      } catch (err: any) {
        handleApiError(err);
      }
    }
  };
  
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      streamRef.current = stream;
    } catch (err) {
      setError('Camera access denied. Cannot use face scan.');
      setFaceScanState('failed');
    }
  };
  
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const handleFaceScan = async () => {
    if (isLoading) return; // Debounce guard
    if (!videoRef.current) return;
    
    setFaceScanState('scanning');
    
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(videoRef.current, 0, 0);
    const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];
    
    try {
      const res = await authApi.faceVerify(tempToken, base64Image);
      if (res.accessToken) {
        setFaceScanState('verified');
        stopCamera();
        loginState(res.user, res.accessToken);
        setTimeout(() => navigate('/home'), 1000);
      } else {
        throw new Error('Verification failed');
      }
    } catch (err: any) {
      setFaceScanState('failed');
      handleApiError(err);
    }
  };

  // ── OTP Handlers (manual button, no auto-fire) ─────────────────────────────
  const handleOTPChange = (otp: string) => {
    setOtpValue(otp);
    setError('');
  };

  const handleVerifyOTP = async () => {
    if (isLoading) return; // Debounce guard
    if (otpValue.length !== 6) { setError('Please enter all 6 digits'); return; }

    setIsLoading(true);
    setError('');
    try {
      const res = await authApi.otpVerify(tempToken, otpValue);
      if (res.accessToken) {
        if (!hasFaceMFA) {
          setShowOTPPrompt(true);
        }
        loginState(res.user, res.accessToken);
        setTimeout(() => navigate('/home'), 1500);
      } else {
        setError('Invalid OTP');
      }
    } catch (err: any) {
      handleApiError(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (resendCooldown > 0 || isLoading) return;
    setError('');
    try {
      await authApi.otpRequest(tempToken);
      setResendCooldown(60);
      setError(''); // Clear any previous error
    } catch (err: any) {
      handleApiError(err);
    }
  };

  // ── Rate-Limit Lockout Screen ──────────────────────────────────────────────
  if (rateLimitSeconds > 0) {
    return (
      <MobileContainer>
        <div className="min-h-screen flex flex-col p-6 justify-center items-center text-center">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <div className="w-20 h-20 bg-rose/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Timer className="w-10 h-10 text-rose" />
            </div>
            <h1 className="text-2xl font-bold text-warm-white mb-4">Too Many Attempts</h1>
            <p className="text-muted-text mb-6">Please wait before trying again</p>
            <div className="text-5xl font-mono font-bold text-rose mb-6">
              {formatCountdown(rateLimitSeconds)}
            </div>
            <p className="text-sm text-muted-text">
              This limit protects your account from unauthorized access
            </p>
          </motion.div>
        </div>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer>
      <div className="min-h-screen flex flex-col p-6 justify-center">
        {/* Email Entry */}
        {mode === 'email-entry' && !emailConfirmed && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="text-center mb-12">
              <div className="w-20 h-20 bg-rose/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Lock className="w-10 h-10 text-rose" />
              </div>
              <h1 className="text-3xl font-bold text-warm-white mb-2">Welcome Back</h1>
              <p className="text-muted-text">Enter your email to continue</p>
            </div>

            <div className="mb-6">
              <Input
                label="Email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && email) handleEmailSubmit(); }}
              />
              {error && <p className="text-rose text-sm mt-2">{error}</p>}
            </div>

            <Button
              variant="primary" fullWidth
              onMouseDown={preventBlur}
              onClick={handleEmailSubmit}
              disabled={!email || isLoading}
            >
              Continue
            </Button>

            <div className="mt-6 flex flex-col gap-4 text-center">
              <button onClick={() => navigate('/signup')} className="text-sm text-muted-text hover:text-warm-white transition-colors">
                Don't have an account? <span className="text-rose font-medium">Sign up</span>
              </button>
              <button onClick={() => navigate('/join')} className="text-sm text-muted-text hover:text-warm-white transition-colors">
                Have a couple code? <span className="text-gold font-medium">Join partner</span>
              </button>
            </div>
          </motion.div>
        )}

        {/* Login Options */}
        {mode === 'email-entry' && emailConfirmed && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <button onClick={() => { setEmailConfirmed(false); setError(''); }} className="text-muted-text hover:text-warm-white mb-8 flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-warm-white mb-2">Choose Login Method</h1>
              <p className="text-muted-text text-sm">Logging in as <span className="text-warm-white font-medium">{maskedEmail}</span></p>
            </div>

            <div className="space-y-4 mb-6">
              <button onClick={() => setMode('face-password')} className="w-full p-6 bg-gradient-to-br from-rose/20 to-rose/5 border-2 border-rose/30 rounded-2xl hover:border-rose/50 transition-all active:scale-[0.98] relative">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-rose/20 rounded-full flex items-center justify-center"><ScanFace className="w-6 h-6 text-rose" /></div>
                  <div className="flex-1 text-left">
                    <p className="text-warm-white font-medium text-lg">Face + Password</p>
                    <p className="text-sm text-muted-text">Quick face verification</p>
                  </div>
                </div>
              </button>

              <button onClick={() => setMode('password-only')} className="w-full p-6 bg-surface/50 border-2 border-border rounded-2xl hover:border-rose/30 transition-all active:scale-[0.98]">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-surface/50 rounded-full flex items-center justify-center"><Key className="w-6 h-6 text-muted-text" /></div>
                  <div className="flex-1 text-left">
                    <p className="text-warm-white font-medium text-lg">Password and OTP</p>
                    <p className="text-sm text-muted-text">Use your password and email</p>
                  </div>
                </div>
              </button>
            </div>
          </motion.div>
        )}

        {/* Face + Password Entry */}
        {mode === 'face-password' && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <button onClick={() => setMode('email-entry')} className="text-muted-text hover:text-warm-white mb-8 flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <h1 className="text-3xl font-bold text-warm-white mb-2">Enter Password</h1>
            <p className="text-muted-text mb-8">Then we'll verify your face</p>

            <div className="mb-8">
              <Input
                label="Password" type="password" placeholder="Enter your password"
                value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && password) handleFacePasswordLogin(); }}
              />
              {error && <p className="text-rose text-sm mt-2">{error}</p>}
            </div>

            <Button
              variant="primary" fullWidth
              onMouseDown={preventBlur}
              onClick={handleFacePasswordLogin}
              disabled={!password || isLoading}
            >
              {isLoading ? 'Authenticating...' : 'Continue to Face Scan'}
            </Button>
          </motion.div>
        )}

        {/* Password Only Entry */}
        {mode === 'password-only' && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <button onClick={() => setMode('email-entry')} className="text-muted-text hover:text-warm-white mb-8 flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <h1 className="text-3xl font-bold text-warm-white mb-2">Enter Password</h1>
            <p className="text-muted-text mb-8">Login with your password</p>

            <div className="mb-8">
              <Input
                label="Password" type="password" placeholder="Enter your password"
                value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && password) handlePasswordOnlyLogin(); }}
              />
              {error && <p className="text-rose text-sm mt-2">{error}</p>}
            </div>

            <Button
              variant="primary" fullWidth
              onMouseDown={preventBlur}
              onClick={handlePasswordOnlyLogin}
              disabled={!password || isLoading}
            >
              {isLoading ? 'Logging In...' : 'Login'}
            </Button>
          </motion.div>
        )}

        {/* Face Scan */}
        {mode === 'face-scan' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
            <button onClick={() => { stopCamera(); setMode('face-password'); }} className="text-muted-text hover:text-warm-white mb-8 flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <h1 className="text-3xl font-bold text-warm-white mb-2">Face Verification</h1>
            <p className="text-muted-text mb-12">Position your face in the frame</p>

            <div className="flex items-center justify-center mb-8">
              <div className="w-64 h-80 border-4 border-rose/50 rounded-[50%] flex items-center justify-center relative overflow-hidden bg-black">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                
                {faceScanState === 'scanning' && (
                  <motion.div
                    className="absolute inset-0 bg-rose/20"
                    initial={{ top: 0 }} animate={{ top: '100%' }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                )}

                {faceScanState === 'verified' && (
                  <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="absolute z-10 text-gold text-center bg-black/60 w-full h-full flex flex-col justify-center">
                    <div className="text-6xl mb-2">✓</div>
                    <p className="font-medium">Verified!</p>
                  </motion.div>
                )}

                {faceScanState === 'failed' && (
                  <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="absolute z-10 text-center bg-black/60 w-full h-full flex flex-col justify-center">
                    <AlertCircle className="w-20 h-20 text-amber-500 mx-auto mb-3" />
                    <p className="text-sm text-warm-white">Verification Failed</p>
                  </motion.div>
                )}
              </div>
            </div>

            <div className="mb-4">
               {error && <p className="text-rose text-sm">{error}</p>}
            </div>

            {faceScanState === 'idle' || faceScanState === 'failed' ? (
              <div className="space-y-3">
                <Button variant="primary" fullWidth onMouseDown={preventBlur} onClick={handleFaceScan} disabled={isLoading}>
                  Capture & Verify
                </Button>
                {faceScanState === 'failed' && (
                  <Button variant="secondary" fullWidth onClick={() => { stopCamera(); setMode('otp-only'); }}>
                    Use OTP Instead
                  </Button>
                )}
              </div>
            ) : null}
          </motion.div>
        )}

        {/* OTP Only Login */}
        {mode === 'otp-only' && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <button onClick={() => setMode('email-entry')} className="text-muted-text hover:text-warm-white mb-8 flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className="flex items-center justify-center mb-6">
              <div className="w-16 h-16 bg-rose/20 rounded-full flex items-center justify-center"><Mail className="w-8 h-8 text-rose" /></div>
            </div>
            <h1 className="text-3xl font-bold text-warm-white mb-2 text-center">Verify with OTP</h1>
            <p className="text-muted-text mb-2 text-center">We sent a 6-digit code to</p>
            <p className="text-warm-white font-medium mb-8 text-center">{maskedEmail}</p>

            <OTPInput length={6} onComplete={handleOTPChange} />

            {error && <p className="text-rose text-sm text-center mt-4">{error}</p>}

            {/* ── Verify OTP Button ─────────────────────────────────────────── */}
            <div className="mt-6">
              <Button
                variant="primary"
                fullWidth
                onMouseDown={preventBlur}
                onClick={handleVerifyOTP}
                disabled={otpValue.length !== 6 || isLoading}
              >
                {isLoading ? 'Verifying...' : 'Verify OTP'}
              </Button>
            </div>

            {/* ── Resend OTP ───────────────────────────────────────────────── */}
            <div className="mt-4 text-center">
              {resendCooldown > 0 ? (
                <p className="text-sm text-muted-text">
                  Resend OTP in <span className="text-warm-white font-medium">{resendCooldown}s</span>
                </p>
              ) : (
                <button
                  onClick={handleResendOTP}
                  className="text-sm text-rose font-medium hover:text-rose/80 transition-colors"
                >
                  Resend OTP
                </button>
              )}
            </div>

            {showOTPPrompt && (
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mt-6 bg-gold/10 border border-gold/30 p-4 rounded-xl">
                <p className="text-sm text-gold text-center mb-3">Want to set up face ID for easier login?</p>
                <button onClick={() => navigate('/face-enrollment')} className="text-sm font-medium text-gold hover:text-gold/80 transition-colors">
                  Set up Face ID now →
                </button>
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
    </MobileContainer>
  );
}
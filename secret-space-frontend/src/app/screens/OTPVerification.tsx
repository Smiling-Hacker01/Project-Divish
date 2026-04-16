import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Button } from '../components/Button';
import { OTPInput } from '../components/OTPInput';
import { MobileContainer } from '../components/MobileContainer';
import { ArrowLeft, Mail } from 'lucide-react';
import { motion } from 'motion/react';
import { authApi } from '../api/auth';
import { useAuth } from '../context/AuthContext';

export default function OTPVerification() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginState } = useAuth();
  
  const { tempToken, email, password, user, isOnboarding } = location.state || {};
  
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [otpRequested, setOtpRequested] = useState(false);

  useEffect(() => {
    if (!tempToken) {
      navigate('/signup'); // Redir if opened directly without state
      return;
    }

    // Auto-request OTP on mount
    const requestInitialOTP = async () => {
      try {
        await authApi.otpRequest(tempToken);
        setOtpRequested(true);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to send OTP.');
      }
    };
    
    if (!otpRequested) {
      requestInitialOTP();
    }
  }, [tempToken, otpRequested, navigate]);

  useEffect(() => {
    let timer: any;
    if (otpRequested && !canResend) {
      timer = setInterval(() => {
        setResendTimer((prev) => {
          if (prev <= 1) {
            setCanResend(true);
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [otpRequested, canResend]);

  const handleOTPComplete = async (otpValue: string) => {
    if (otpValue.length === 6) {
      setOtpValue(otpValue);
      setIsLoading(true);
      setError('');
      try {
        const res = await authApi.otpVerify(tempToken, otpValue);
        if (res.accessToken) {
          // Store the full tokens via context
          loginState(user || res.user, res.accessToken);
          // Navigate to Face Enrollment and pass the text password so it can register the face
          navigate('/face-enrollment', { state: { email, password, isOnboarding } });
        }
      } catch (err: any) {
        setError(err.response?.data?.error || "That code didn't match. Try again or resend.");
      } finally {
        setIsLoading(false);
      }
    }
  };

  const [otpValue, setOtpValue] = useState('');

  const handleManualSubmit = () => {
    if (otpValue.length === 6) {
      handleOTPComplete(otpValue);
    } else {
      setError('Please enter a 6-digit code');
    }
  };

  const handleResend = async () => {
    // ... rest of handleResend
    if (!canResend) return;
    
    setCanResend(false);
    setError('');
    
    try {
      await authApi.otpRequest(tempToken);
      setResendTimer(30);
    } catch (err: any) {
      setError('Failed to resend OTP. Try again later.');
      setCanResend(true);
    }
  };

  return (
    <MobileContainer>
      <div className="min-h-screen flex flex-col p-6">
        <div className="flex items-center mb-8">
          <button onClick={() => navigate('/signup')} className="mr-4">
            <ArrowLeft className="w-6 h-6 text-warm-white" />
          </button>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-text">Step 2 of 4</span>
            </div>
            <div className="w-full bg-surface/30 h-1 rounded-full"><div className="w-1/2 bg-rose h-1 rounded-full" /></div>
          </div>
        </div>

        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex-1">
          <div className="flex items-center justify-center mb-6">
            <div className="w-16 h-16 bg-rose/20 rounded-full flex items-center justify-center">
              <Mail className="w-8 h-8 text-rose" />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-warm-white mb-2 text-center">Verify Your Email</h1>
          <p className="text-muted-text mb-2 text-center">We sent a 6-digit code to</p>
          <p className="text-warm-white font-medium mb-8 text-center">{email}</p>

          <OTPInput length={6} onComplete={handleOTPComplete} />

          {error && (
            <motion.p initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-rose text-sm text-center mt-4">
              {error}
            </motion.p>
          )}

          <div className="mt-8">
            <Button variant="primary" fullWidth onClick={handleManualSubmit} disabled={isLoading}>
              {isLoading ? 'Verifying...' : 'Submit OTP'}
            </Button>
          </div>

          <div className="text-center mt-8">
            <p className="text-muted-text text-sm mb-2">Didn't receive the code?</p>
            <button
              onClick={handleResend}
              disabled={!canResend || isLoading}
              className={`text-sm font-medium transition-colors ${canResend ? 'text-rose hover:text-rose/80' : 'text-muted-text cursor-not-allowed'}`}
            >
              {canResend ? 'Resend OTP' : `Resend in ${resendTimer}s`}
            </button>
          </div>
        </motion.div>
      </div>
    </MobileContainer>
  );
}

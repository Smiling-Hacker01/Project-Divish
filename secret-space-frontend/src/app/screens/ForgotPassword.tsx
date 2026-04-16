import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { OTPInput } from '../components/OTPInput';
import { MobileContainer } from '../components/MobileContainer';
import { ArrowLeft, Mail, Lock, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { motion } from 'motion/react';

type Step = 'email' | 'otp' | 'new-password' | 'success';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resendTimer, setResendTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [error, setError] = useState('');

  const maskedEmail = email ? `${email.charAt(0)}****${email.split('@')[1] || ''}` : '';

  const getPasswordStrength = (password: string): { strength: string; color: string } => {
    if (password.length === 0) return { strength: '', color: '' };
    if (password.length < 6) return { strength: 'Weak', color: 'text-rose' };
    if (password.length < 10) return { strength: 'Medium', color: 'text-amber-500' };
    return { strength: 'Strong', color: 'text-gold' };
  };

  const passwordStrength = getPasswordStrength(newPassword);

  const handleEmailSubmit = () => {
    if (!email) {
      setError('Please enter your email');
      return;
    }
    setError('');
    setStep('otp');
    
    // Start OTP timer
    setResendTimer(30);
    setCanResend(false);
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          setCanResend(true);
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleOTPComplete = (otpValue: string) => {
    setOtp(otpValue);
    setTimeout(() => {
      if (otpValue.length === 6) {
        setStep('new-password');
      }
    }, 500);
  };

  const handlePasswordReset = () => {
    if (!newPassword || !confirmPassword) {
      setError('Please fill all fields');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    
    setError('');
    setStep('success');
    
    // Auto redirect after 2.5 seconds
    setTimeout(() => {
      navigate('/login');
    }, 2500);
  };

  const handleResend = () => {
    if (!canResend) return;
    
    setResendTimer(30);
    setCanResend(false);
    
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          setCanResend(true);
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const getCurrentStep = () => {
    if (step === 'email') return 1;
    if (step === 'otp') return 2;
    if (step === 'new-password') return 3;
    return 4;
  };

  return (
    <MobileContainer>
      <div className="min-h-screen flex flex-col p-6 justify-center">
        {/* Step 1: Enter Email */}
        {step === 'email' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <button
              onClick={() => navigate('/login')}
              className="text-muted-text hover:text-warm-white mb-8 flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Login
            </button>

            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-text">Step 1 of 4</span>
              </div>
              <div className="w-full bg-surface/30 h-1 rounded-full">
                <div className="w-1/4 bg-rose h-1 rounded-full" />
              </div>
            </div>

            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-rose/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Mail className="w-8 h-8 text-rose" />
              </div>
              <h1 className="text-3xl font-bold text-warm-white mb-2">
                Forgot Password?
              </h1>
              <p className="text-muted-text">
                We'll send a reset code to your registered email
              </p>
            </div>

            <div className="mb-8">
              <Input
                label="Email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
              />
              {error && (
                <p className="text-rose text-sm mt-2">{error}</p>
              )}
            </div>

            <Button
              variant="primary"
              fullWidth
              onClick={handleEmailSubmit}
              disabled={!email}
            >
              Send OTP
            </Button>
          </motion.div>
        )}

        {/* Step 2: OTP Verification */}
        {step === 'otp' && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <button
              onClick={() => setStep('email')}
              className="text-muted-text hover:text-warm-white mb-8 flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-text">Step 2 of 4</span>
              </div>
              <div className="w-full bg-surface/30 h-1 rounded-full">
                <div className="w-2/4 bg-rose h-1 rounded-full" />
              </div>
            </div>

            <div className="flex items-center justify-center mb-6">
              <div className="w-16 h-16 bg-rose/20 rounded-full flex items-center justify-center">
                <Mail className="w-8 h-8 text-rose" />
              </div>
            </div>

            <h1 className="text-3xl font-bold text-warm-white mb-2 text-center">
              Verify Your Email
            </h1>
            <p className="text-muted-text mb-2 text-center">
              Code sent to
            </p>
            <p className="text-warm-white font-medium mb-8 text-center">
              {maskedEmail}
            </p>

            <OTPInput
              length={6}
              onComplete={handleOTPComplete}
              error={!!error}
            />

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-rose text-sm text-center mt-4"
              >
                {error}
              </motion.p>
            )}

            <div className="text-center mt-8">
              <p className="text-muted-text text-sm mb-2">
                Didn't receive the code?
              </p>
              <button
                onClick={handleResend}
                disabled={!canResend}
                className={`text-sm font-medium transition-colors ${
                  canResend
                    ? 'text-rose hover:text-rose/80'
                    : 'text-muted-text cursor-not-allowed'
                }`}
              >
                {canResend ? 'Resend OTP' : `Resend in ${resendTimer}s`}
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 3: Set New Password */}
        {step === 'new-password' && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <button
              onClick={() => setStep('otp')}
              className="text-muted-text hover:text-warm-white mb-8 flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-text">Step 3 of 4</span>
              </div>
              <div className="w-full bg-surface/30 h-1 rounded-full">
                <div className="w-3/4 bg-rose h-1 rounded-full" />
              </div>
            </div>

            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-rose/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Lock className="w-8 h-8 text-rose" />
              </div>
              <h1 className="text-3xl font-bold text-warm-white mb-2">
                Set New Password
              </h1>
              <p className="text-muted-text">
                Create a strong password to secure your account
              </p>
            </div>

            <div className="space-y-6 mb-8">
              <div className="relative">
                <Input
                  label="New Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setError('');
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-10 text-muted-text hover:text-warm-white"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
                {passwordStrength.strength && (
                  <p className={`text-sm mt-2 ${passwordStrength.color}`}>
                    Strength: {passwordStrength.strength}
                  </p>
                )}
              </div>

              <div className="relative">
                <Input
                  label="Confirm New Password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setError('');
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-10 text-muted-text hover:text-warm-white"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              {error && (
                <p className="text-rose text-sm">{error}</p>
              )}
            </div>

            <Button
              variant="primary"
              fullWidth
              onClick={handlePasswordReset}
              disabled={!newPassword || !confirmPassword}
            >
              Reset Password
            </Button>
          </motion.div>
        )}

        {/* Step 4: Success */}
        {step === 'success' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-text">Step 4 of 4</span>
              </div>
              <div className="w-full bg-rose h-1 rounded-full" />
            </div>

            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring' }}
              className="w-24 h-24 bg-gold/20 rounded-full flex items-center justify-center mx-auto mb-6"
            >
              <CheckCircle className="w-16 h-16 text-gold" />
            </motion.div>

            <h1 className="text-3xl font-bold text-warm-white mb-3">
              Password Updated!
            </h1>
            <p className="text-muted-text mb-8">
              Your password has been successfully updated
            </p>

            <p className="text-sm text-muted-text mb-6">
              Redirecting you to login...
            </p>

            <Button
              variant="primary"
              fullWidth
              onClick={() => navigate('/login')}
            >
              Back to Login
            </Button>
          </motion.div>
        )}
      </div>
    </MobileContainer>
  );
}

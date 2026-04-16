import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { MobileContainer } from '../components/MobileContainer';
import { ScanFace } from 'lucide-react';
import { motion } from 'motion/react';

type LoginStep = 'password' | 'face' | 'success';

export default function DailyLogin() {
  const navigate = useNavigate();
  const [step, setStep] = useState<LoginStep>('password');
  const [password, setPassword] = useState('');

  const handlePasswordSubmit = () => {
    setStep('face');
    // Simulate face scan
    setTimeout(() => {
      setStep('success');
      setTimeout(() => navigate('/home'), 1000);
    }, 2500);
  };

  return (
    <MobileContainer>
      <div className="min-h-screen flex flex-col p-6 justify-center">
        {step === 'password' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h1 className="text-3xl font-bold text-warm-white mb-2">
              Welcome Back
            </h1>
            <p className="text-muted-text mb-8">
              Step 1: Enter your password
            </p>

            <div className="mb-8">
              <Input
                label="Password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <Button
              variant="primary"
              fullWidth
              onClick={handlePasswordSubmit}
              disabled={!password}
            >
              Continue
            </Button>
          </motion.div>
        )}

        {step === 'face' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
          >
            <h1 className="text-3xl font-bold text-warm-white mb-2">
              Face Verification
            </h1>
            <p className="text-muted-text mb-12">
              Step 2: Verify your identity
            </p>

            <div className="flex items-center justify-center mb-8">
              <div className="w-64 h-80 border-4 border-rose/50 rounded-[50%] flex items-center justify-center relative overflow-hidden">
                <motion.div
                  className="absolute inset-0 bg-rose/20"
                  initial={{ top: 0 }}
                  animate={{ top: '100%' }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <ScanFace className="w-32 h-32 text-muted-text" />
              </div>
            </div>

            <p className="text-muted-text">Scanning...</p>
          </motion.div>
        )}

        {step === 'success' && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center"
          >
            <div className="text-6xl mb-4">✓</div>
            <h1 className="text-3xl font-bold text-gold mb-2">
              Verified!
            </h1>
            <p className="text-muted-text">
              Logging you in...
            </p>
          </motion.div>
        )}
      </div>
    </MobileContainer>
  );
}

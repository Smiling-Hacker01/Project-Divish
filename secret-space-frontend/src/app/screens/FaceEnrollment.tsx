import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Button } from '../components/Button';
import { MobileContainer } from '../components/MobileContainer';
import { ArrowLeft, ScanFace, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { authApi } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { Camera, CameraResultType, CameraSource, CameraDirection } from '@capacitor/camera';

type EnrollmentState = 'idle' | 'captured' | 'verified' | 'failed';

export default function FaceEnrollment() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  
  const { email, password, isOnboarding } = location.state || {};

  const [state, setState] = useState<EnrollmentState>('idle');
  const [error, setError] = useState('');

  const startCamera = async () => {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        direction: CameraDirection.Front
      });

      if (image.base64String) {
        handleCaptureAndEnroll(image.base64String);
      }
    } catch (err) {
      setError('Camera access denied or cancelled');
      setState('failed');
    }
  };

  const handleCaptureAndEnroll = async (base64Image: string) => {
    setState('captured');
    
    try {
      // Backend /enroll-face requires email, password, and faceImage
      await authApi.enrollFace({ email, password, faceImage: base64Image });
      
      setState('verified');
      
      setTimeout(() => {
        if (isOnboarding) {
          navigate('/couple-code');
        } else {
          navigate('/home');
        }
      }, 1500);
    } catch (err: any) {
      setState('failed');
      setError(err.response?.data?.error || 'Failed to enroll face');
    }
  };

  const handleSkip = () => {
    console.log('Skipping face enrollment');
    if (isOnboarding) {
      navigate('/couple-code');
    } else {
      navigate('/home');
    }
  };

  const handleRetry = () => {
    setState('idle');
    setError('');
  };

  return (
    <MobileContainer>
      <div className="min-h-screen flex flex-col p-6">
        <div className="flex items-center mb-8">
          <button onClick={() => navigate(-1)} className="mr-4 focus:outline-none">
            <ArrowLeft className="w-6 h-6 text-warm-white" />
          </button>
          {isOnboarding && (
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-text">Step 3 of 4</span>
              </div>
              <div className="w-full bg-surface/30 h-1 rounded-full"><div className="w-3/4 bg-rose h-1 rounded-full" /></div>
            </div>
          )}
        </div>

        <h1 className="text-3xl font-bold text-warm-white mb-2">Face Verification</h1>
        <p className="text-muted-text mb-2">Set up face recognition for quick, secure login</p>
        {state === 'idle' && <p className="text-sm text-muted-text mb-8">(Optional - you can skip and use OTP)</p>}

        <div className="flex-1 flex items-center justify-center">
          <div className="relative">
            <div className="w-64 h-80 border-4 border-rose/50 rounded-[50%] flex items-center justify-center relative overflow-hidden bg-black">
              
              {state === 'idle' && <ScanFace className="w-32 h-32 text-muted-text" />}
              
              {state === 'captured' && (
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-warm-white text-center absolute z-10 bg-black/60 w-full h-full flex flex-col justify-center">
                  <div className="text-5xl mb-2">...</div>
                  <p className="text-sm">Processing</p>
                </motion.div>
              )}
              
              {state === 'verified' && (
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-gold text-center absolute z-10 bg-black/60 w-full h-full flex flex-col justify-center">
                  <div className="text-5xl mb-2">✓</div>
                  <p className="text-sm font-medium">Verified!</p>
                </motion.div>
              )}

              {state === 'failed' && (
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center absolute z-10 bg-black/60 w-full h-full flex flex-col justify-center">
                  <AlertCircle className="w-20 h-20 text-amber-500 mx-auto mb-3" />
                  <p className="text-sm text-warm-white">Enrollment Failed</p>
                </motion.div>
              )}
            </div>

            <p className="text-center mt-4 text-sm text-rose">{error}</p>
          </div>
        </div>

        {state === 'idle' && (
          <div className="space-y-3">
            <Button variant="primary" fullWidth onClick={startCamera}>Open Native Camera</Button>
            <Button variant="ghost" fullWidth onClick={handleSkip} className="!text-muted-text">Skip for Now</Button>
          </div>
        )}

        {state === 'failed' && (
          <div className="space-y-3">
            <Button variant="secondary" fullWidth onClick={handleRetry}>Try Again</Button>
            <Button variant="primary" fullWidth onClick={handleSkip}>
              {isOnboarding ? 'Continue with OTP' : 'Back to Dashboard'}
            </Button>
          </div>
        )}
      </div>
    </MobileContainer>
  );
}
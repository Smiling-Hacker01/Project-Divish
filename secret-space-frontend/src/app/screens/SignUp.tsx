import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { MobileContainer } from '../components/MobileContainer';
import { ArrowLeft } from 'lucide-react';
import { authApi } from '../api/auth';

export default function SignUp() {
  const navigate = useNavigate();
  const location = useLocation();
  const coupleCode = location.state?.coupleCode;

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    anniversaryDate: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleContinue = async () => {
    setIsLoading(true);
    setError('');
    try {
      let response;
      if (coupleCode) {
        response = await authApi.join({
          coupleCode,
          name: formData.name,
          email: formData.email,
          password: formData.password
        });
      } else {
        response = await authApi.signup({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          anniversaryDate: formData.anniversaryDate || new Date().toISOString().split('T')[0],
        });
      }

      if ((response as any).tempToken) {
          navigate('/otp-verification', { 
            state: { 
              tempToken: (response as any).tempToken, 
              password: formData.password,
              email: formData.email,
              user: (response as any).user,
              isOnboarding: !coupleCode
            } 
          });
      } else {
        setError('Signup failed exceptionally');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to sign up. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <MobileContainer>
      <div className="min-h-screen flex flex-col p-6">
        <div className="flex items-center mb-8">
          <button onClick={() => navigate(-1)} className="mr-4">
            <ArrowLeft className="w-6 h-6 text-warm-white" />
          </button>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-text">Step 1 of 3</span>
            </div>
            <div className="w-full bg-surface/30 h-1 rounded-full"><div className="w-1/3 bg-rose h-1 rounded-full" /></div>
          </div>
        </div>

        <h1 className="text-3xl font-bold text-warm-white mb-2">
          {coupleCode ? 'Complete Your Profile' : "Let's get started"}
        </h1>
        <p className="text-muted-text mb-8">
          {coupleCode ? 'Create your account to join your partner' : 'Create your account to begin your journey together'}
        </p>

        <div className="space-y-6 flex-1">
          <Input label="Your Name" type="text" placeholder="Enter your name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
          <Input label="Email" type="email" placeholder="your@email.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
          <Input label="Password" type="password" placeholder="Create a password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
          {!coupleCode && (
            <Input 
              label="Anniversary Date" 
              type="date" 
              value={formData.anniversaryDate} 
              max={new Date().toISOString().split('T')[0]}
              onChange={(e) => setFormData({ ...formData, anniversaryDate: e.target.value })} 
            />
          )}
          {error && <p className="text-rose text-sm mt-2">{error}</p>}
        </div>

        <Button variant="primary" fullWidth onClick={handleContinue} disabled={!formData.name || !formData.email || !formData.password || isLoading}>
          {isLoading ? 'Processing...' : 'Continue'}
        </Button>
      </div>
    </MobileContainer>
  );
}
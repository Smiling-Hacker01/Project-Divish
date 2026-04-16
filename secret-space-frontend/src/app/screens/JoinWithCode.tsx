import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { MobileContainer } from '../components/MobileContainer';
import { ArrowLeft } from 'lucide-react';

export default function JoinWithCode() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const handleJoin = () => {
    // Basic formatting check
    if (!code) {
      setError('Please enter a code');
      return;
    }
    // Pass the code to the signup screen via router state
    navigate('/signup', { state: { coupleCode: code } });
  };

  return (
    <MobileContainer>
      <div className="min-h-screen flex flex-col p-6">
        <div className="flex items-center mb-8">
          <button onClick={() => navigate('/')} className="mr-4">
            <ArrowLeft className="w-6 h-6 text-warm-white" />
          </button>
        </div>

        <h1 className="text-3xl font-bold text-warm-white mb-2">Join Your Partner</h1>
        <p className="text-muted-text mb-12">Enter the code your partner shared with you</p>

        <div className="flex-1">
          <Input
            label="Couple Code"
            type="text"
            placeholder="LOVE-XXX-XXX"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError('');
            }}
            error={error}
            className="text-center font-mono text-lg tracking-wider"
          />

          <div className="mt-6 bg-surface/30 p-6 rounded-2xl border border-border">
            <p className="text-sm text-muted-text text-center leading-relaxed">
              After entering the code, you'll create your account to complete the pairing.
            </p>
          </div>
        </div>

        <Button variant="primary" fullWidth onClick={handleJoin} disabled={!code}>Continue</Button>
      </div>
    </MobileContainer>
  );
}

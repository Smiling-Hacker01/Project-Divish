import { useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { MobileContainer } from '../components/MobileContainer';
import { Heart } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';

export default function Splash() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isReturningUser = !!user;

  return (
    <MobileContainer>
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-background to-near-black">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="flex-1 flex items-center justify-center"
        >
          <div className="text-center">
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
              className="mb-6"
            >
              <Heart className="w-24 h-24 text-rose fill-rose mx-auto" />
            </motion.div>
            <h1 className="text-5xl font-bold text-warm-white mb-3">
              The Secret Space
            </h1>
            <p className="text-muted-text text-lg">
              Your private couple sanctuary
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="w-full space-y-4"
        >
          {isReturningUser ? (
            <>
              <Button
                variant="primary"
                fullWidth
                onClick={() => navigate('/home')}
              >
                Go to Dashboard
              </Button>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => {
                  if (window.confirm("Log out of current user?")) {
                    localStorage.removeItem('accessToken');
                    localStorage.removeItem('refreshToken');
                    window.location.href = '/login';
                  }
                }}
              >
                Login as different user
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="primary"
                fullWidth
                onClick={() => navigate('/signup')}
              >
                Create Our Space
              </Button>
              
              <Button
                variant="secondary"
                fullWidth
                onClick={() => navigate('/join')}
              >
                Join with a Code
              </Button>

              <button
                onClick={() => navigate('/login')}
                className="w-full text-muted-text hover:text-warm-white transition-colors py-3 text-sm focus:outline-none"
              >
                Already have an account? <span className="text-rose font-medium">Login</span>
              </button>
            </>
          )}
        </motion.div>
      </div>
    </MobileContainer>
  );
}
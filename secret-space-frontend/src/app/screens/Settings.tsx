import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { MobileContainer } from '../components/MobileContainer';
import { ArrowLeft, User, Heart, Calendar, ScanFace, Bell, LogOut, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../api/auth';
import { settingsApi } from '../api/settings';

export default function Settings() {
  const navigate = useNavigate();
  const { user, logoutState, updateUser } = useAuth();
  
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [anniversaryDate, setAnniversaryDate] = useState(user?.anniversaryDate || '2022-01-15');
  const [isLoading, setIsLoading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [facePassword, setFacePassword] = useState('');
  const [facePasswordError, setFacePasswordError] = useState('');
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editName, setEditName] = useState(user?.name || '');
  const [editProfileLoading, setEditProfileLoading] = useState(false);
  const [editProfileError, setEditProfileError] = useState('');

  // Fetch live profile on mount to get accurate faceMFAEnabled
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const data = await settingsApi.getProfile();
        if (data?.user) {
          updateUser(data.user);
        }
      } catch(e) {
        console.error('Failed to fetch profile', e);
      }
    };
    fetchProfile();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await authApi.logout();
    } catch (e) {
      console.error('Logout failed on backend', e);
    } finally {
      logoutState();
      navigate('/login');
    }
  };

  const handleLeaveSpace = async () => {
    setIsLoading(true);
    try {
      await settingsApi.unlinkPartner();
    } catch (e) {
      console.error('Unlink failed', e);
    } finally {
      logoutState();
      navigate('/');
    }
  };

  const handleSaveAnniversary = async () => {
    try {
      await settingsApi.updateProfile({ anniversaryDate });
      updateUser({ anniversaryDate });
    } catch(err) {
      console.error(err);
    }
  };

  const handleFaceEnrollNav = () => {
    if (!facePassword.trim()) {
      setFacePasswordError('Password is required');
      return;
    }
    setShowPasswordModal(false);
    navigate('/face-enrollment', { state: { email: user?.email, password: facePassword, isOnboarding: false } });
    setFacePassword('');
    setFacePasswordError('');
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      setEditProfileError('Name cannot be empty');
      return;
    }
    setEditProfileLoading(true);
    setEditProfileError('');
    try {
      await settingsApi.updateProfile({ name: editName.trim() });
      updateUser({ name: editName.trim() });
      setShowEditProfile(false);
    } catch(e: any) {
      setEditProfileError(e.response?.data?.error || 'Failed to update profile');
    } finally {
      setEditProfileLoading(false);
    }
  };

  return (
    <MobileContainer>
      <div className="min-h-screen pb-24 p-6">
        {/* Header */}
        <div className="flex items-center mb-8">
          <button onClick={() => navigate('/home')}>
            <ArrowLeft className="w-6 h-6 text-warm-white" />
          </button>
          <h1 className="ml-4 text-2xl font-bold text-warm-white">Settings</h1>
        </div>

        {/* Profile Section */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-muted-text mb-4">Profile</h2>
          <div className="bg-surface/50 rounded-2xl border border-border p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-rose/30 to-rose/10 border-2 border-rose flex items-center justify-center text-3xl">
                👤
              </div>
              <div className="flex-1">
                <p className="text-warm-white font-medium text-lg">
                  {user?.name || 'User'}
                </p>
                <p className="text-muted-text text-sm">
                  {user?.email || 'user@email.com'}
                </p>
              </div>
            </div>

            <button 
              onClick={() => { setEditName(user?.name || ''); setEditProfileError(''); setShowEditProfile(true); }}
              className="w-full flex items-center justify-between p-4 bg-surface/30 rounded-xl border border-border hover:border-rose/30 transition-all"
            >
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-muted-text" />
                <span className="text-warm-white">Edit Profile</span>
              </div>
            </button>
          </div>
        </div>

        {/* Partner Info */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-muted-text mb-4">Partner</h2>
          <div className="bg-surface/50 rounded-2xl border border-border p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gold/30 to-gold/10 border-2 border-gold flex items-center justify-center text-2xl">
                👤
              </div>
              <div className="flex-1">
                <p className="text-warm-white font-medium">
                  {user?.partnerId ? (user as any).partnerName || 'Partner' : 'Partner'}
                </p>
                <p className="text-muted-text text-sm">
                  {user?.partnerId ? 'Linked' : 'Pending'}
                </p>
              </div>
            </div>
            
            <div className="pt-4 border-t border-border">
              <div className="flex items-center gap-3 mb-3">
                <Heart className="w-5 h-5 text-rose" />
                <span className="text-sm text-muted-text">
                  Couple Code: {user?.coupleCode || 'LOVE-XXX-XXX'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Anniversary */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-muted-text mb-4">Anniversary</h2>
          <div className="bg-surface/50 rounded-2xl border border-border p-6">
            <div className="flex items-center gap-3 mb-4">
              <Calendar className="w-5 h-5 text-gold" />
              <label className="text-warm-white font-medium">Anniversary Date</label>
            </div>
            <input
              type="date"
              value={anniversaryDate}
              onChange={(e) => setAnniversaryDate(e.target.value)}
              onBlur={handleSaveAnniversary}
              className="w-full px-4 py-3 bg-surface/30 border border-border rounded-xl text-warm-white focus:outline-none focus:ring-2 focus:ring-rose/50 focus:border-rose"
            />
          </div>
        </div>

        {/* Security */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-muted-text mb-4">Security</h2>
          <div className="bg-surface/50 rounded-2xl border border-border overflow-hidden">
            {/* Row 1: Status / Set Up */}
            {user?.faceMFAEnabled ? (
              <div className="w-full flex items-center justify-between p-4 border-b border-border opacity-80">
                <div className="flex items-center gap-3">
                  <ScanFace className="w-5 h-5 text-green-400" />
                  <div className="text-left">
                    <span className="text-warm-white font-medium block">Face ID Already Enrolled</span>
                    <span className="text-xs text-muted-text">Your face is set up for quick login</span>
                  </div>
                </div>
                <span className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded-full">Active ✓</span>
              </div>
            ) : (
              <button 
                onClick={() => { setFacePasswordError(''); setFacePassword(''); setShowPasswordModal(true); }}
                className="w-full flex items-center justify-between p-4 hover:bg-surface/30 transition-colors border-b border-border"
              >
                <div className="flex items-center gap-3">
                  <ScanFace className="w-5 h-5 text-gold" />
                  <div className="text-left">
                    <span className="text-warm-white font-medium block">Set Up Face ID</span>
                    <span className="text-xs text-muted-text">Enable faster login</span>
                  </div>
                </div>
                <span className="text-xs px-2 py-1 bg-gold/20 text-gold rounded-full">New</span>
              </button>
            )}

            {/* Row 2: Re-enroll (only shown when already enrolled) */}
            {user?.faceMFAEnabled && (
              <button 
                onClick={() => { setFacePasswordError(''); setFacePassword(''); setShowPasswordModal(true); }}
                className="w-full flex items-center justify-between p-4 hover:bg-surface/30 transition-colors border-b border-border"
              >
                <div className="flex items-center gap-3">
                  <ScanFace className="w-5 h-5 text-muted-text" />
                  <span className="text-warm-white">Re-enroll Face ID</span>
                </div>
              </button>
            )}
            <button 
              onClick={() => navigate('/lovebot')}
              className="w-full flex items-center justify-between p-4 hover:bg-surface/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-muted-text" />
                <span className="text-warm-white">Notification Preferences</span>
              </div>
            </button>
          </div>
        </div>

        {/* Account Actions */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-muted-text mb-4">Account</h2>
          <div className="space-y-3">
            <Button
              variant="ghost"
              fullWidth
              onClick={() => setShowLogoutConfirm(true)}
              className="flex items-center justify-center gap-2 !text-muted-text hover:!text-warm-white"
            >
              <LogOut className="w-5 h-5" />
              Logout
            </Button>

            <Button
              variant="ghost"
              fullWidth
              onClick={() => setShowLeaveConfirm(true)}
              className="flex items-center justify-center gap-2 !text-rose hover:!text-rose/80"
            >
              <AlertTriangle className="w-5 h-5" />
              Leave This Space
            </Button>
          </div>
        </div>

        {/* Logout Confirmation Modal */}
        {showLogoutConfirm && (
          <div className="fixed inset-0 bg-near-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <div className="bg-surface rounded-2xl p-6 max-w-sm w-full border border-border">
              <h3 className="text-xl font-bold text-warm-white mb-2">Logout?</h3>
              <p className="text-muted-text mb-6">You'll need to log back in to access your space.</p>
              <div className="flex gap-3">
                <Button variant="secondary" fullWidth onClick={() => setShowLogoutConfirm(false)}>Cancel</Button>
                <Button variant="primary" fullWidth onClick={handleLogout} disabled={isLoading}>{isLoading ? '...' : 'Logout'}</Button>
              </div>
            </div>
          </div>
        )}

        {/* Leave Space Confirmation Modal */}
        {showLeaveConfirm && (
          <div className="fixed inset-0 bg-near-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <div className="bg-surface rounded-2xl p-6 max-w-sm w-full border border-rose/30">
              <div className="text-center mb-4">
                <AlertTriangle className="w-12 h-12 text-rose mx-auto mb-3" />
                <h3 className="text-xl font-bold text-warm-white mb-2">Leave This Space?</h3>
              </div>
              <p className="text-muted-text mb-6 text-center">This will disconnect you from your partner and delete all local data. This action cannot be undone.</p>
              <div className="flex gap-3">
                <Button variant="secondary" fullWidth onClick={() => setShowLeaveConfirm(false)}>Cancel</Button>
                <Button variant="primary" fullWidth onClick={handleLeaveSpace} disabled={isLoading} className="!bg-rose">{isLoading ? '...' : 'Leave'}</Button>
              </div>
            </div>
          </div>
        )}

        {/* Password Modal for Face Enrollment */}
        {showPasswordModal && (
          <div className="fixed inset-0 bg-near-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <div className="bg-surface rounded-2xl p-6 max-w-sm w-full border border-border">
              <h3 className="text-xl font-bold text-warm-white mb-2">Confirm Identity</h3>
              <p className="text-muted-text mb-6 text-sm">Enter your account password to proceed with Face ID enrollment.</p>
              <input
                type="password"
                placeholder="Enter your password"
                value={facePassword}
                onChange={(e) => { setFacePassword(e.target.value); setFacePasswordError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleFaceEnrollNav(); }}
                className="w-full px-4 py-3 bg-surface/30 border border-border rounded-xl text-warm-white mb-2 focus:outline-none focus:ring-2 focus:ring-rose/50"
              />
              {facePasswordError && <p className="text-xs text-rose mb-4">{facePasswordError}</p>}
              <div className="flex gap-3 mt-4">
                <Button variant="secondary" fullWidth onClick={() => setShowPasswordModal(false)}>Cancel</Button>
                <Button variant="primary" fullWidth onClick={handleFaceEnrollNav}>Continue</Button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Profile Modal */}
        {showEditProfile && (
          <div className="fixed inset-0 bg-near-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <div className="bg-surface rounded-2xl p-6 max-w-sm w-full border border-border">
              <h3 className="text-xl font-bold text-warm-white mb-2">Edit Profile</h3>
              <p className="text-muted-text mb-6 text-sm">Update your display name below.</p>
              <label className="text-xs text-muted-text mb-1 block">Name</label>
              <input
                type="text"
                placeholder="Your name"
                value={editName}
                onChange={(e) => { setEditName(e.target.value); setEditProfileError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveProfile(); }}
                className="w-full px-4 py-3 bg-surface/30 border border-border rounded-xl text-warm-white mb-2 focus:outline-none focus:ring-2 focus:ring-rose/50"
              />
              {editProfileError && <p className="text-xs text-rose mb-4">{editProfileError}</p>}
              <label className="text-xs text-muted-text mb-1 block mt-4">Email</label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full px-4 py-3 bg-surface/30 border border-border rounded-xl text-muted-text mb-2 cursor-not-allowed opacity-60"
              />
              <p className="text-xs text-muted-text mb-4">Email cannot be changed</p>
              <div className="flex gap-3 mt-4">
                <Button variant="secondary" fullWidth onClick={() => setShowEditProfile(false)}>Cancel</Button>
                <Button variant="primary" fullWidth onClick={handleSaveProfile} disabled={editProfileLoading}>
                  {editProfileLoading ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </MobileContainer>
  );
}
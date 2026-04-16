import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { MobileContainer } from '../components/MobileContainer';
import { ArrowLeft, Plus, Trash2, Clock } from 'lucide-react';
import { loveBotApi, LoveBotMode, LoveReason } from '../api/lovebot';

export default function LoveBot() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<LoveBotMode>('off');
  const [sendTime, setSendTime] = useState('09:00');
  const [reasons, setReasons] = useState<LoveReason[]>([]);
  const [isCreator, setIsCreator] = useState(false);
  const [partnerEnabled, setPartnerEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await loveBotApi.getSettings();
        setMode(data.mode);
        setSendTime(data.time);
        setReasons(data.reasons);
        setIsCreator(data.isCreator);
        setPartnerEnabled(data.userBAccessGranted);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  const handleModeChange = async (newMode: LoveBotMode) => {
    setMode(newMode);
    try {
      await loveBotApi.updateSettings(newMode, sendTime, partnerEnabled);
    } catch(e) {
      console.error(e);
    }
  };

  const handleTimeChange = async (time: string) => {
    setSendTime(time);
    try {
      await loveBotApi.updateSettings(mode, time, partnerEnabled);
    } catch(e) {
      console.error(e);
    }
  };

  const handlePartnerAccessToggle = async (enabled: boolean) => {
    setPartnerEnabled(enabled);
    try {
      await loveBotApi.updateSettings(mode, sendTime, enabled);
    } catch(e) {
      console.error(e);
    }
  };

  const handleDeleteReason = async (id: string) => {
    try {
      await loveBotApi.deleteReason(id);
      setReasons(prev => prev.filter(r => r.id !== id));
    } catch(e) {
      console.error(e);
    }
  };

  if (isLoading) {
    return (
      <MobileContainer>
        <div className="min-h-screen flex items-center justify-center p-6 bg-background">
          <p className="text-muted-text">Loading...</p>
        </div>
      </MobileContainer>
    );
  }

  // Graceful lockout for uninitiated Joiners
  if (!isCreator && !partnerEnabled) {
    return (
      <MobileContainer>
        <div className="min-h-screen p-6 pb-24 flex flex-col items-center justify-center text-center bg-background">
          <div className="w-20 h-20 bg-surface/50 rounded-full flex items-center justify-center mb-6">
            <span className="text-3xl">🤖💕</span>
          </div>
          <h1 className="text-2xl font-bold text-warm-white mb-4">Lover Bot</h1>
          <p className="text-muted-text max-w-[90%] mx-auto leading-relaxed">
            This module was exquisitely crafted just for you, not <i>by</i> you!
            Your partner hasn't enabled access for you to craft reasons yet. Keep an eye out for automated surprise messages instead!
          </p>
          <button 
             onClick={() => navigate('/home')} 
             className="mt-8 px-8 py-3 bg-rose text-warm-white rounded-xl active:scale-95 transition-transform font-medium focus:outline-none"
          >
             Go Back Home
          </button>
        </div>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer>
      <div className="min-h-screen pb-24 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/home')} className="focus:outline-none">
              <ArrowLeft className="w-6 h-6 text-warm-white" />
            </button>
            <h1 className="text-2xl font-bold text-warm-white">Love Bot</h1>
          </div>
        </div>

        <p className="text-muted-text mb-8">
          Automatically send daily love reasons to keep the romance alive
        </p>

        {/* Partner Access Toggle (Only for Initiator) */}
        {isCreator && (
          <div className="mb-8">
            <h2 className="text-sm font-medium text-warm-white mb-4">Partner Permissions</h2>
            <button
              onClick={() => handlePartnerAccessToggle(!partnerEnabled)}
              className={`w-full p-4 rounded-2xl border-2 transition-all block focus:outline-none outline-none ${
                  partnerEnabled
                    ? 'bg-surface/50 border-rose'
                    : 'bg-surface/20 border-border hover:border-rose/30'
                }`}
            >
                <div className="flex items-center justify-between pointer-events-none">
                  <div className="text-left">
                    <p className="text-warm-white font-medium">Enable Lover Bot for Partner</p>
                    <p className="text-sm text-muted-text mt-1">
                      {partnerEnabled ? 'Partner currently has access to schedule their own reasons.' : 'Partner only receives events and cannot schedule them.'}
                    </p>
                  </div>
                  {partnerEnabled && (
                    <div className="w-5 h-5 bg-rose rounded-full flex whitespace-nowrap shrink-0 items-center justify-center ml-4">
                      <span className="text-warm-white text-xs">✓</span>
                    </div>
                  )}
                </div>
            </button>
          </div>
        )}

        {/* Mode Selector */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-warm-white mb-4">Mode</h2>
          <div className="space-y-3">
            <button
              onClick={() => handleModeChange('off')}
              className={`w-full p-4 rounded-2xl border-2 transition-all block focus:outline-none outline-none ${
                mode === 'off'
                  ? 'bg-surface/50 border-rose'
                  : 'bg-surface/20 border-border hover:border-rose/30'
              }`}
            >
              <div className="flex items-center justify-between pointer-events-none">
                <div className="text-left">
                  <p className="text-warm-white font-medium">Off</p>
                  <p className="text-sm text-muted-text">Love Bot is disabled</p>
                </div>
                {mode === 'off' && (
                  <div className="w-5 h-5 bg-rose rounded-full flex items-center justify-center">
                    <span className="text-warm-white text-xs">✓</span>
                  </div>
                )}
              </div>
            </button>

            <button
              onClick={() => handleModeChange('daily' as LoveBotMode)}
              className={`w-full p-4 rounded-2xl border-2 transition-all block focus:outline-none outline-none ${
                mode === 'daily'
                  ? 'bg-surface/50 border-rose'
                  : 'bg-surface/20 border-border hover:border-rose/30'
              }`}
            >
              <div className="flex items-center justify-between pointer-events-none">
                <div className="text-left">
                  <p className="text-warm-white font-medium">Daily</p>
                  <p className="text-sm text-muted-text">Send a reason every day at time</p>
                </div>
                {mode === 'daily' && (
                  <div className="w-5 h-5 bg-rose rounded-full flex items-center justify-center">
                    <span className="text-warm-white text-xs">✓</span>
                  </div>
                )}
              </div>
            </button>

            <button
              onClick={() => handleModeChange('surprise' as LoveBotMode)}
              className={`w-full p-4 rounded-2xl border-2 transition-all block focus:outline-none outline-none ${
                mode === 'surprise'
                  ? 'bg-surface/50 border-rose'
                  : 'bg-surface/20 border-border hover:border-rose/30'
              }`}
            >
              <div className="flex items-center justify-between pointer-events-none">
                <div className="text-left">
                  <p className="text-warm-white font-medium">Surprise</p>
                  <p className="text-sm text-muted-text">Send randomly throughout the day</p>
                </div>
                {mode === 'surprise' && (
                  <div className="w-5 h-5 bg-rose rounded-full flex items-center justify-center">
                    <span className="text-warm-white text-xs">✓</span>
                  </div>
                )}
              </div>
            </button>
          </div>
        </div>

        {mode !== 'off' && (
          <>
            {/* Send Time */}
            {mode === 'daily' && (
            <div className="mb-8">
              <h2 className="text-sm font-medium text-warm-white mb-4">Daily Send Time</h2>
              <div className="relative">
                <input
                  type="time"
                  value={sendTime}
                  onChange={(e) => handleTimeChange(e.target.value)}
                  className="w-full px-4 py-3 bg-surface/50 border border-border rounded-xl text-warm-white focus:outline-none focus:ring-2 focus:ring-rose/50 focus:border-rose appearance-none"
                />
                <Clock className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-text pointer-events-none" />
              </div>
            </div>
            )}

            {/* Love Reasons List */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-warm-white">
                  Love Reasons ({reasons.length})
                </h2>
                <button
                  onClick={() => navigate('/lovebot/add')}
                  className="flex items-center gap-2 px-4 py-2 bg-rose rounded-xl text-sm text-warm-white hover:bg-rose/90 transition-colors focus:outline-none"
                >
                  <Plus className="w-4 h-4" />
                  Add Reason
                </button>
              </div>

              {reasons.length === 0 ? (
                <div className="text-center py-8 bg-surface/20 rounded-2xl border border-dashed border-border">
                  <p className="text-muted-text mb-3">No love reasons added yet</p>
                  <button
                    onClick={() => navigate('/lovebot/add')}
                    className="text-rose hover:text-rose/80 transition-colors text-sm focus:outline-none"
                  >
                    Add your first reason
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {reasons.map((reason) => (
                    <div
                      key={reason.id}
                      className="flex items-start gap-3 p-4 bg-surface/30 rounded-xl border border-border group hover:border-rose/30 transition-all"
                    >
                      <div className="flex-1">
                        <p className="text-warm-white text-sm leading-relaxed">
                          {reason.text}
                        </p>
                        <p className="text-xs text-muted-text mt-2">
                          Added: {new Date(reason.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteReason(reason.id)}
                        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity p-2 hover:bg-rose/20 rounded-lg focus:outline-none"
                      >
                        <Trash2 className="w-4 h-4 text-rose" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Preview */}
            <div className="bg-gradient-to-br from-gold/20 to-rose/10 p-6 rounded-2xl border border-gold/30">
              <p className="text-xs text-muted-text mb-3">Preview Notification</p>
              <div className="bg-surface/50 p-4 rounded-xl border border-border">
                <p className="text-xs font-medium text-warm-white mb-2">Together</p>
                <p className="text-sm text-warm-white">
                  {reasons.length > 0 
                    ? `"${reasons[0].text}"`
                    : "Your daily love reason will appear here"
                  }
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </MobileContainer>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '../components/Button';
import { MobileContainer } from '../components/MobileContainer';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { couponsApi, Coupon } from '../api/coupons';

export default function CouponDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const fetchCoupon = async () => {
      if (!id) return;
      try {
        const data = await couponsApi.getCoupon(id);
        setCoupon(data);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCoupon();
  }, [id]);

  const handleRedeem = async () => {
    if (!coupon || !id || isUpdating) return;
    setIsUpdating(true);
    
    // Optimistic UI Component updates could happen here
    try {
      await couponsApi.updateCouponStatus(id, 'Pending');
      setCoupon(prev => prev ? { ...prev, status: 'Pending' } : null);
    } catch(e) {
      console.error(e);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleApprove = async () => {
    if (!coupon || !id || isUpdating) return;
    setIsUpdating(true);
    
    try {
      await couponsApi.updateCouponStatus(id, 'Used');
      setCoupon(prev => prev ? { ...prev, status: 'Used' } : null);
    } catch(e) {
      console.error(e);
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <MobileContainer>
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted-text">Loading...</p>
        </div>
      </MobileContainer>
    );
  }

  if (!coupon) {
    return (
      <MobileContainer>
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
          <p className="text-muted-text mb-6">Coupon not found</p>
          <Button variant="secondary" onClick={() => navigate('/coupons')}>Go Back</Button>
        </div>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer>
      <div className="min-h-screen flex flex-col p-6">
        {/* Header */}
        <div className="flex items-center mb-8">
          <button onClick={() => navigate('/coupons')} className="focus:outline-none">
            <ArrowLeft className="w-6 h-6 text-warm-white" />
          </button>
        </div>

        {/* Coupon Display */}
        <div className="flex-1">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative overflow-hidden mb-8"
          >
            <div className={`bg-gradient-to-br from-rose/20 to-gold/10 p-8 rounded-3xl border-2 ${coupon.status === 'Used' ? 'border-border opacity-70' : 'border-rose/30'} relative`}>
              {/* Decorative ticket holes */}
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-6 h-6 bg-background rounded-full -ml-3" />
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-6 h-6 bg-background rounded-full -mr-3" />
              
              <div className="text-center mb-6">
                <h1 className="text-3xl font-bold text-warm-white mb-4">
                  {coupon.title}
                </h1>
                <p className="text-warm-white/80 leading-relaxed break-words">
                  {coupon.description}
                </p>
              </div>

              <div className="border-t border-dashed border-border pt-6 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-text">From</span>
                  <span className="text-warm-white font-medium">
                    {coupon.creator === 'you' ? 'You' : 'Partner'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-text">To</span>
                  <span className="text-warm-white font-medium">
                    {coupon.recipient === 'you' ? 'You' : 'Partner'}
                  </span>
                </div>
                {coupon.expiry && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-text">Expires</span>
                    <span className="text-warm-white font-medium">
                      {new Date(coupon.expiry).toLocaleDateString()}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-text">Status</span>
                  <span className={`font-medium ${
                    coupon.status === 'Active' ? 'text-gold' :
                    coupon.status === 'Pending' ? 'text-muted-text' :
                    coupon.status === 'Used' ? 'text-muted-text' :
                    'text-rose'
                  }`}>
                    {coupon.status}
                  </span>
                </div>
              </div>

              {/* Used stamp overlay */}
              {coupon.status === 'Used' && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-[-15deg] pointer-events-none">
                  <div className="border-4 border-rose rounded-2xl px-12 py-4 bg-background/50 backdrop-blur-[2px]">
                    <span className="text-4xl font-bold text-rose uppercase tracking-widest whitespace-nowrap">REDEEMED</span>
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Info Box */}
          <div className="bg-surface/30 p-6 rounded-2xl border border-border mb-8">
            {coupon.status === 'Active' && coupon.recipient === 'you' && (
              <div className="text-center">
                <p className="text-sm text-muted-text mb-3">
                  Ready to use this coupon? Tap the button below to redeem it.
                </p>
                <p className="text-xs text-muted-text">
                  Your partner will be notified and can approve the redemption.
                </p>
              </div>
            )}
            
            {coupon.status === 'Pending' && coupon.creator === 'you' && (
              <div className="text-center">
                <p className="text-sm text-warm-white mb-2">
                  Redemption Pending
                </p>
                <p className="text-xs text-muted-text">
                  Your partner wants to redeem this coupon. Approve when ready!
                </p>
              </div>
            )}

            {coupon.status === 'Pending' && coupon.recipient === 'you' && (
              <div className="text-center">
                <p className="text-sm text-warm-white mb-2">
                  Waiting for Approval
                </p>
                <p className="text-xs text-muted-text">
                  Your partner will approve the redemption soon!
                </p>
              </div>
            )}

            {coupon.status === 'Used' && (
              <div className="text-center">
                <p className="text-sm text-gold mb-2">
                  This coupon has been redeemed! 🎉
                </p>
                <p className="text-xs text-muted-text">
                  Hope you enjoyed it!
                </p>
              </div>
            )}
            
            {coupon.status === 'Active' && coupon.creator === 'you' && (
              <div className="text-center">
                <p className="text-sm text-muted-text mb-2">
                  Waiting for Partner to Redeem
                </p>
                <p className="text-xs text-muted-text">
                  They haven't used this coupon yet.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        {coupon.status === 'Active' && coupon.recipient === 'you' && (
          <Button
            variant="primary"
            fullWidth
            onClick={handleRedeem}
            disabled={isUpdating}
          >
            {isUpdating ? 'Redeeming...' : 'Redeem Coupon'}
          </Button>
        )}

        {coupon.status === 'Pending' && coupon.creator === 'you' && (
          <Button
            variant="primary"
            fullWidth
            onClick={handleApprove}
            disabled={isUpdating}
          >
            {isUpdating ? 'Approving...' : 'Approve Redemption'}
          </Button>
        )}
      </div>
    </MobileContainer>
  );
}

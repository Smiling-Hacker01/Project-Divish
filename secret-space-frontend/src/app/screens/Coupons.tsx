import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { MobileContainer } from '../components/MobileContainer';
import { ArrowLeft, Plus, Ticket, Star } from 'lucide-react';
import { motion } from 'motion/react';
import { couponsApi, Coupon } from '../api/coupons';

export default function Coupons() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'given' | 'received' | 'to-fulfill'>('received');
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCoupons = async () => {
      try {
        const data = await couponsApi.getCoupons();
        setCoupons(data);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCoupons();
  }, []);

  const filteredCoupons = coupons.filter(c => {
    if (tab === 'to-fulfill') return c.status === 'Used' && c.creator === 'you';
    if (tab === 'given') return c.creator === 'you';
    return c.recipient === 'you';
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'text-gold border-gold/30 bg-gold/10';
      case 'Pending': return 'text-muted-text border-border bg-surface/30';
      case 'Used': return 'text-rose border-rose/30 bg-surface/20'; // Highlight a bit more as it needs action
      case 'Fulfilled': return 'text-muted-text border-border bg-surface/30';
      case 'Expired': return 'text-rose border-rose/30 bg-rose/10';
      default: return 'text-muted-text border-border bg-surface/30';
    }
  };

  return (
    <MobileContainer>
      <div className="min-h-screen pb-24">
        {/* Header */}
        <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 p-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <button onClick={() => navigate('/home')} className="focus:outline-none">
                <ArrowLeft className="w-6 h-6 text-warm-white" />
              </button>
              <h1 className="text-2xl font-bold text-warm-white">Love Coupons</h1>
            </div>
            <button
              onClick={() => navigate('/coupons/create')}
              className="w-10 h-10 bg-rose rounded-full flex items-center justify-center hover:bg-rose/90 transition-colors active:scale-95 focus:outline-none"
            >
              <Plus className="w-5 h-5 text-warm-white" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 p-1 bg-surface/50 rounded-xl">
            <button
              onClick={() => setTab('received')}
              className={`flex-1 py-2 rounded-lg transition-all focus:outline-none outline-none ${
                tab === 'received'
                  ? 'bg-rose text-warm-white'
                  : 'text-muted-text hover:text-warm-white'
              }`}
            >
              <span className="text-sm font-medium">Received</span>
            </button>
            <button
              onClick={() => setTab('given')}
              className={`flex-1 py-2 rounded-lg transition-all focus:outline-none outline-none ${
                tab === 'given'
                  ? 'bg-rose text-warm-white'
                  : 'text-muted-text hover:text-warm-white'
              }`}
            >
              <span className="text-sm font-medium">Given</span>
            </button>
            <button
              onClick={() => setTab('to-fulfill')}
              className={`flex-1 py-2 rounded-lg transition-all focus:outline-none outline-none ${
                tab === 'to-fulfill'
                  ? 'bg-rose text-warm-white'
                  : 'text-muted-text hover:text-warm-white'
              }`}
            >
              <span className="text-sm font-medium">To Fulfill</span>
              {coupons.filter(c => c.status === 'Used' && c.creator === 'you').length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-warm-white text-rose rounded-full text-[10px] font-bold">
                  {coupons.filter(c => c.status === 'Used' && c.creator === 'you').length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Coupon List */}
        <div className="p-6 space-y-4">
          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-muted-text">Loading...</p>
            </div>
          ) : filteredCoupons.length === 0 ? (
            <div className="text-center py-12">
              <Ticket className="w-12 h-12 text-muted-text mx-auto mb-3" />
              <p className="text-muted-text mb-4">
                {tab === 'given' ? 'No coupons given yet' : 'No coupons received yet'}
              </p>
            </div>
          ) : (
            filteredCoupons.map((coupon, index) => (
              <motion.div
                key={coupon.id}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => navigate(`/coupons/${coupon.id}`)}
                className="relative overflow-hidden group focus:outline-none"
              >
                {/* Ticket-style coupon */}
                <div className={`bg-gradient-to-r from-surface/50 to-surface/30 p-6 rounded-2xl border ${
                  coupon.status === 'Used' ? 'border-border opacity-70' : 'border-border group-hover:border-rose/30 group-focus:border-rose/50 group-active:scale-[0.98]'
                } transition-all cursor-pointer relative block`}>
                  {/* Decorative ticket holes */}
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-background rounded-full -ml-2" />
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-background rounded-full -mr-2" />
                  
                  <div className="flex items-start justify-between mb-3 gap-2">
                    <div className="flex-1">
                      <h3 className="text-lg font-medium text-warm-white mb-1">
                        {coupon.title}
                      </h3>
                      <p className="text-sm text-muted-text line-clamp-2">
                        {coupon.description}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${getStatusColor(coupon.status)}`}>
                      {coupon.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-text pt-3 border-t border-dashed border-border mt-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full ${
                        coupon.creator === 'you'
                          ? 'bg-rose/20 border border-rose/50'
                          : 'bg-gold/20 border border-gold/50'
                      } flex items-center justify-center text-xs`}>
                        👤
                      </div>
                      <span>From: {coupon.creator === 'you' ? 'You' : 'Partner'}</span>
                    </div>
                    {coupon.expiry && coupon.status === 'Active' && (
                      <span>
                        Expires: {new Date(coupon.expiry).toLocaleDateString()}
                      </span>
                    )}
                    {coupon.reviewRating && coupon.status === 'Fulfilled' && (
                      <div className="flex items-center gap-1 text-gold">
                        {coupon.reviewRating} <Star className="w-3 h-3 fill-gold" />
                      </div>
                    )}
                  </div>

                  {/* Used stamp overlay */}
                  {coupon.status === 'Used' && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-[-15deg] pointer-events-none">
                      <div className="border-4 border-rose/50 rounded-xl px-8 py-3 bg-background/30 backdrop-blur-[2px]">
                        <span className="text-3xl font-bold text-rose/80 uppercase tracking-widest whitespace-nowrap">REDEEMED</span>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </MobileContainer>
  );
}

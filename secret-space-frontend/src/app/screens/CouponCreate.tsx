import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { MobileContainer } from '../components/MobileContainer';
import { ArrowLeft, Calendar } from 'lucide-react';
import { motion } from 'motion/react';
import { couponsApi } from '../api/coupons';

export default function CouponCreate() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    expiry: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async () => {
    setIsSubmitting(true);
    try {
      await couponsApi.createCoupon(formData);
      navigate('/coupons');
    } catch(e) {
      console.error(e);
      setIsSubmitting(false);
    }
  };

  const formatDateForInput = (date: string) => {
    if (!date) return '';
    return new Date(date).toISOString().split('T')[0];
  };

  return (
    <MobileContainer>
      <div className="min-h-screen flex flex-col p-6">
        {/* Header */}
        <div className="flex items-center mb-8">
          <button onClick={() => navigate('/coupons')} className="focus:outline-none">
            <ArrowLeft className="w-6 h-6 text-warm-white" />
          </button>
          <h1 className="ml-4 text-2xl font-bold text-warm-white">Create Coupon</h1>
        </div>

        {/* Form */}
        <div className="flex-1 space-y-6 mb-6">
          <Input
            label="Title"
            type="text"
            placeholder="e.g., Breakfast in Bed"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />

          <div>
            <label className="block text-sm font-medium text-warm-white mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe what this coupon is for..."
              className="w-full h-32 px-4 py-3 bg-surface/50 border border-border rounded-xl text-warm-white placeholder:text-muted-text focus:outline-none focus:ring-2 focus:ring-rose/50 focus:border-rose resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-warm-white mb-2">
              Expiry Date (Optional)
            </label>
            <div className="relative">
              <input
                type="date"
                value={formatDateForInput(formData.expiry)}
                onChange={(e) => setFormData({ ...formData, expiry: e.target.value })}
                className="w-full px-4 py-3 bg-surface/50 border border-border rounded-xl text-warm-white focus:outline-none focus:ring-2 focus:ring-rose/50 focus:border-rose appearance-none"
              />
              <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-text pointer-events-none" />
            </div>
          </div>

          {/* Live Preview */}
          {formData.title && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
            >
              <p className="text-sm font-medium text-muted-text mb-3">Preview</p>
              <div className="relative overflow-hidden bg-gradient-to-r from-surface/50 to-surface/30 p-6 rounded-2xl border border-rose/30">
                {/* Decorative ticket holes */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-background rounded-full -ml-2" />
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-background rounded-full -mr-2" />
                
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 gap-2">
                    <h3 className="text-lg font-medium text-warm-white mb-1">
                      {formData.title}
                    </h3>
                    {formData.description && (
                      <p className="text-sm text-muted-text break-words">
                        {formData.description}
                      </p>
                    )}
                  </div>
                  <span className="px-3 py-1 ml-2 rounded-full text-xs font-medium border text-gold border-gold/30 bg-gold/10 whitespace-nowrap">
                    Active
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-text pt-3 border-t border-dashed border-border mt-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-rose/20 border border-rose/50 flex items-center justify-center text-xs">
                      👤
                    </div>
                    <span>From: You</span>
                  </div>
                  {formData.expiry && (
                    <span>
                      Expires: {new Date(formData.expiry).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Create Button */}
        <Button
          variant="primary"
          fullWidth
          onClick={handleCreate}
          disabled={!formData.title || !formData.description || isSubmitting}
        >
          {isSubmitting ? 'Minting...' : 'Mint Coupon 💌'}
        </Button>
      </div>
    </MobileContainer>
  );
}

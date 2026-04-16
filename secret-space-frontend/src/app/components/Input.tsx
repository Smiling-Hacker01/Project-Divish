import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-warm-white mb-2">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`w-full px-4 py-3 bg-surface/50 border ${
            error ? 'border-rose' : 'border-border'
          } rounded-xl text-warm-white placeholder:text-muted-text focus:outline-none focus:ring-2 focus:ring-rose/50 focus:border-rose transition-all ${className}`}
          {...props}
        />
        {error && (
          <p className="text-sm text-rose mt-1">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

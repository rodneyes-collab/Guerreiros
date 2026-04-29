
import React, { useState } from 'react';
import { Trophy } from 'lucide-react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Logo: React.FC<LogoProps> = ({ className = '', size = 'md' }) => {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-20 h-20',
    xl: 'w-32 h-32'
  };

  const iconSizes = {
    sm: 16,
    md: 24,
    lg: 40,
    xl: 64
  };

  return (
    <div className={`flex items-center justify-center overflow-hidden rounded-2xl bg-black border-2 border-brand-primary shadow-xl shadow-brand-primary/10 ${sizeClasses[size]} ${className}`}>
      {!error ? (
        <img 
          src="/logo.png" 
          alt="Guerreiros V.C. Logo" 
          className={`w-full h-full object-contain p-1 transition-opacity duration-500 ${loading ? 'opacity-0' : 'opacity-100'}`}
          onLoad={() => setLoading(false)}
          onError={() => {
            console.error('Falha ao carregar o logo em /logo.png');
            setError(true);
            setLoading(false);
          }}
          referrerPolicy="no-referrer"
          loading="eager"
        />
      ) : (
        <Trophy className="text-brand-primary animate-pulse" size={iconSizes[size]} />
      )}
      
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-1/2 h-1/2 border-2 border-brand-primary/30 border-t-brand-primary rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};

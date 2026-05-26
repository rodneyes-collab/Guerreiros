
import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Logo: React.FC<LogoProps> = ({ className = '', size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-20 h-20',
    xl: 'w-32 h-32'
  };

  return (
    <div className={`flex items-center justify-center overflow-hidden rounded-2xl bg-black border-2 border-brand-primary shadow-xl shadow-brand-primary/10 ${sizeClasses[size]} ${className}`}>
      <img 
        src="/logo.png" 
        alt="Guerreiros V.C. Logo" 
        className="w-full h-full object-contain p-1"
        referrerPolicy="no-referrer"
      />
    </div>
  );
};

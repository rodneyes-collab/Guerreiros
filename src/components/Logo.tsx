
import React, { useState } from 'react';
import { Trophy } from 'lucide-react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Logo: React.FC<LogoProps> = ({ className = '', size = 'md' }) => {
  const [useImage, setUseImage] = useState(true);

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-24 h-24',
    xl: 'w-40 h-40'
  };

  const WarriorSVG = () => (
    <svg viewBox="0 0 100 100" className="w-full h-full p-1" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Círculo Externo */}
      <circle cx="50" cy="50" r="48" stroke="#F5C429" strokeWidth="2" />
      <circle cx="50" cy="50" r="44" stroke="#F5C429" strokeWidth="1" strokeDasharray="2 2" />
      
      {/* Capacete Espartano Estilizado */}
      <path 
        d="M50 15C35 15 25 25 25 45V55C25 65 35 75 50 75C65 75 75 65 75 55V45C75 25 65 15 50 15Z" 
        fill="#F5C429" 
        fillOpacity="0.2"
        stroke="#F5C429" 
        strokeWidth="2" 
      />
      
      {/* Bola de Vôlei no centro inferior */}
      <circle cx="50" cy="70" r="10" fill="black" stroke="#F5C429" strokeWidth="1.5" />
      <path d="M45 65C48 68 52 68 55 65M42 70H58M45 75C48 72 52 72 55 75" stroke="#F5C429" strokeWidth="1" />
      
      {/* Texto Guerreiros (Simulado circular) */}
      <path id="curve" d="M20 82C35 95 65 95 80 82" fill="none" />
      <text fill="#F5C429" fontSize="7" fontWeight="bold" className="uppercase tracking-tight">
        <textPath href="#curve" startOffset="50%" textAnchor="middle">GUERREIROS DO VÔLEI</textPath>
      </text>
    </svg>
  );

  return (
    <div className={`relative flex items-center justify-center overflow-hidden rounded-2xl bg-black border-2 border-brand-primary shadow-2xl shadow-brand-primary/20 ${sizeClasses[size]} ${className}`}>
      {useImage ? (
        <img 
          src="/logo.png" 
          alt="Guerreiros Volei Club" 
          className="w-full h-full object-contain p-1"
          onError={() => setUseImage(false)}
          referrerPolicy="no-referrer"
        />
      ) : (
        <WarriorSVG />
      )}
    </div>
  );
};

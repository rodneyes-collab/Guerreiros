import React, { useState } from 'react';
import { Gender, Player } from '../../types';

interface PlayerAvatarProps {
  player?: Partial<Player> | null;
  name?: string;
  gender?: Gender | 'M' | 'F' | 'MALE' | 'FEMALE';
  photoUrl?: string;
  id?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showBorder?: boolean;
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  player,
  name: propName,
  gender: propGender,
  photoUrl: propPhotoUrl,
  id: propId,
  size = 'md',
  className = '',
  showBorder = true,
}) => {
  const [imgError, setImgError] = useState(false);

  const name = player?.name || propName || 'Sócio';
  const photoUrl = player?.photoUrl || propPhotoUrl;
  const rawGender = player?.gender || propGender;
  const id = player?.id || propId || name;

  const isFemale = String(rawGender) === Gender.FEMALE || String(rawGender) === 'F' || String(rawGender) === 'FEMALE';

  // Size mappings
  const sizeClasses = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-xl',
  }[size];

  // Initials
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('');

  // Fallback avatar generator using DiceBear with gender parameter
  const avatarStyle = isFemale ? 'female' : 'male';
  const defaultAvatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
    id
  )}&gender=${avatarStyle}&backgroundColor=18181b,27272a,3f3f46`;

  const borderClass = showBorder ? 'border-2 border-brand-primary/40 shadow-sm' : '';

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full overflow-hidden flex-shrink-0 bg-zinc-800 select-none ${sizeClasses} ${borderClass} ${className}`}
    >
      {photoUrl && !imgError ? (
        <img
          src={photoUrl}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <img
          src={defaultAvatarUrl}
          alt={name}
          className="w-full h-full object-cover bg-zinc-900"
          onError={(e) => {
            // Fallback to text initials if network fails
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
      )}
      {/* Absolute fallback initials element rendered behind/if image fails */}
      <span
        className={`absolute inset-0 flex items-center justify-center font-black uppercase ${
          isFemale ? 'text-pink-300 bg-pink-950/80' : 'text-brand-primary bg-zinc-900'
        } -z-10`}
      >
        {initials || 'VB'}
      </span>
    </div>
  );
};

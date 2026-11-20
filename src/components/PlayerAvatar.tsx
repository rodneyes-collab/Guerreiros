import React, { useState, useEffect, useMemo } from 'react';
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
  onClick?: () => void;
  title?: string;
}

export const normalizeAvatarSrc = (raw?: string | null): string | null => {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return null;

  // Corrige Data URIs que foram salvos com MIME genérico ou com quebras de linha
  if (trimmed.startsWith('data:')) {
    const compact = trimmed.replace(/\s+/g, '');
    if (compact.startsWith('data:application/octet-stream;base64,')) {
      return compact.replace('data:application/octet-stream;base64,', 'data:image/jpeg;base64,');
    }
    return compact;
  }

  // Converte Base64 puro sem cabeçalho Data URI
  const compact = trimmed.replace(/\s+/g, '');
  if (compact.startsWith('/9j/')) {
    return `data:image/jpeg;base64,${compact}`;
  }
  if (compact.startsWith('iVBOR')) {
    return `data:image/png;base64,${compact}`;
  }
  if (compact.startsWith('UklGR')) {
    return `data:image/webp;base64,${compact}`;
  }
  if (compact.startsWith('R0lGOD')) {
    return `data:image/gif;base64,${compact}`;
  }

  // URLs http/https ou caminhos locais
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/')) {
    return trimmed;
  }

  return null;
};

const shouldUseProxyImmediately = (src: string): boolean => {
  const lower = src.toLowerCase();
  return (
    lower.startsWith('http://') ||
    lower.includes('pps.whatsapp.net') ||
    lower.includes('mmg.whatsapp.net') ||
    lower.includes('whatsapp.net')
  );
};

export const PlayerAvatar = React.memo<PlayerAvatarProps>(({
  player,
  name: propName,
  gender: propGender,
  photoUrl: propPhotoUrl,
  id: propId,
  size = 'md',
  className = '',
  showBorder = true,
  onClick,
  title,
}) => {
  const name = player?.name || propName || 'Sócio';
  const rawPhotoUrl = player?.photoUrl || propPhotoUrl;
  const rawGender = player?.gender || propGender;
  const id = player?.id || propId || name;

  const normalizedPhotoUrl = useMemo(() => normalizeAvatarSrc(rawPhotoUrl), [rawPhotoUrl]);

  const [imgError, setImgError] = useState(false);
  const [proxyAttempted, setProxyAttempted] = useState(false);

  // Reseta estados de erro sempre que a URL da foto mudar (ex.: após Sync WhatsApp ou edição)
  useEffect(() => {
    setImgError(false);
    setProxyAttempted(false);
  }, [normalizedPhotoUrl]);

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

  const resolvedSrc = useMemo(() => {
    if (!normalizedPhotoUrl) return null;
    if (normalizedPhotoUrl.startsWith('data:') || normalizedPhotoUrl.startsWith('/')) {
      return normalizedPhotoUrl;
    }
    if (proxyAttempted || shouldUseProxyImmediately(normalizedPhotoUrl)) {
      return `/api/whatsapp/photo-proxy?url=${encodeURIComponent(normalizedPhotoUrl)}`;
    }
    return normalizedPhotoUrl;
  }, [normalizedPhotoUrl, proxyAttempted]);

  const handlePrimaryImageError = () => {
    if (
      normalizedPhotoUrl &&
      !normalizedPhotoUrl.startsWith('data:') &&
      !normalizedPhotoUrl.startsWith('/') &&
      !proxyAttempted &&
      !shouldUseProxyImmediately(normalizedPhotoUrl)
    ) {
      setProxyAttempted(true);
      return;
    }
    setImgError(true);
  };

  const borderClass = showBorder ? 'border-2 border-brand-primary/40 shadow-sm' : '';

  return (
    <div
      onClick={onClick}
      title={title}
      className={`relative inline-flex items-center justify-center rounded-full overflow-hidden flex-shrink-0 bg-zinc-800 select-none ${sizeClasses} ${borderClass} ${onClick ? 'cursor-pointer hover:scale-105 transition-transform' : ''} ${className}`}
    >
      {/* Iniciais no fundo para caso imagem transparente ou erro de rede */}
      <span
        className={`absolute inset-0 z-0 flex items-center justify-center font-black uppercase ${
          isFemale ? 'text-pink-300 bg-pink-950/80' : 'text-brand-primary bg-zinc-900'
        }`}
      >
        {initials || 'VB'}
      </span>

      {resolvedSrc && !imgError ? (
        <img
          src={resolvedSrc}
          alt={name}
          referrerPolicy="no-referrer"
          className="relative z-10 w-full h-full object-cover"
          onError={handlePrimaryImageError}
        />
      ) : (
        <img
          src={defaultAvatarUrl}
          alt={name}
          referrerPolicy="no-referrer"
          className="relative z-10 w-full h-full object-cover bg-zinc-900"
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  return prevProps.player?.id === nextProps.player?.id &&
    prevProps.player?.name === nextProps.player?.name &&
    prevProps.player?.photoUrl === nextProps.player?.photoUrl &&
    prevProps.player?.gender === nextProps.player?.gender &&
    prevProps.name === nextProps.name &&
    prevProps.gender === nextProps.gender &&
    prevProps.photoUrl === nextProps.photoUrl &&
    prevProps.id === nextProps.id &&
    prevProps.size === nextProps.size &&
    prevProps.className === nextProps.className &&
    prevProps.showBorder === nextProps.showBorder &&
    prevProps.title === nextProps.title;
});


import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, ExternalLink, Layers, LocateFixed, Radio, Users } from 'lucide-react';

export interface GeofenceTestPoint {
  lat: number;
  lng: number;
  allowed?: boolean;
  distanceMeters?: number;
  label?: string;
}

export interface ActiveMemberMapMarker {
  playerId: string;
  name: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  arrived?: boolean;
  arrivalOrder?: number;
  lastUpdatedAt?: number;
}

interface CourtGeofenceMapProps {
  lat: number;
  lng: number;
  radiusMeters: number;
  isUnsavedDraft?: boolean;
  onSelectCoords?: (lat: number, lng: number) => void;
  onChangeRadius?: (radius: number) => void;
  testPoint?: GeofenceTestPoint | null;
  trailPoints?: Array<{ lat: number; lng: number }>;
  activeWatchers?: ActiveMemberMapMarker[];
}

type MapVisualMode = 'streets' | 'dark' | 'satellite' | 'waze' | 'radar';

const RADIUS_PRESETS = [50, 100, 150, 250, 500];

function formatGeofenceArea(radiusMeters: number): string {
  const areaSqMeters = Math.PI * radiusMeters * radiusMeters;
  if (areaSqMeters >= 10000) {
    return `${(areaSqMeters / 10000).toFixed(1).replace('.', ',')} ha`;
  }
  return `${Math.round(areaSqMeters).toLocaleString('pt-BR')} m²`;
}

function projectOffsetMeters(
  originLat: number,
  originLng: number,
  targetLat: number,
  targetLng: number
): { eastMeters: number; northMeters: number; totalMeters: number } {
  const latRad = (originLat * Math.PI) / 180;
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos(latRad);
  const northMeters = (targetLat - originLat) * metersPerDegLat;
  const eastMeters = (targetLng - originLng) * metersPerDegLng;
  const totalMeters = Math.round(Math.hypot(eastMeters, northMeters));
  return { eastMeters, northMeters, totalMeters };
}

function escapeHtml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const CourtGeofenceMap: React.FC<CourtGeofenceMapProps> = ({
  lat,
  lng,
  radiusMeters,
  isUnsavedDraft = false,
  onSelectCoords,
  onChangeRadius,
  testPoint = null,
  trailPoints = [],
  activeWatchers = []
}) => {
  // Default to 'streets' (CARTO Voyager) so street names, avenues, and blocks are immediately legible
  const [visualMode, setVisualMode] = useState<MapVisualMode>('streets');
  const [tileErrorCount, setTileErrorCount] = useState(0);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const courtMarkerRef = useRef<L.Marker | null>(null);
  const testMarkerRef = useRef<L.Marker | null>(null);
  const testLineRef = useRef<L.Polyline | null>(null);
  const trailLayerRef = useRef<L.Polyline | null>(null);
  const watcherMarkersRef = useRef<L.LayerGroup | null>(null);
  const onSelectCoordsRef = useRef(onSelectCoords);

  useEffect(() => {
    onSelectCoordsRef.current = onSelectCoords;
  }, [onSelectCoords]);

  const safeLat = Number.isFinite(lat) ? lat : -8.131550;
  const safeLng = Number.isFinite(lng) ? lng : -34.907333;
  const safeRadius = Number.isFinite(radiusMeters)
    ? Math.max(20, Math.min(2000, Math.round(radiusMeters)))
    : 150;

  const validWatchers = useMemo(() => {
    return (activeWatchers || []).filter(
      (w) => w && Number.isFinite(w.lat) && Number.isFinite(w.lng)
    );
  }, [activeWatchers]);

  const courtPinIcon = useMemo(
    () =>
      L.divIcon({
        className: 'guerreiros-court-pin',
        html: `<div style="width:28px;height:28px;border-radius:9999px;background:#F5C429;border:3px solid #09090b;box-shadow:0 4px 14px rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;">
          <div style="width:8px;height:8px;border-radius:9999px;background:#09090b;"></div>
        </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      }),
    []
  );

  // Initialize Leaflet map when not in Radar or Waze iframe mode
  useEffect(() => {
    if (visualMode === 'radar' || visualMode === 'waze') {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        tileLayerRef.current = null;
        circleRef.current = null;
        courtMarkerRef.current = null;
        testMarkerRef.current = null;
        testLineRef.current = null;
        trailLayerRef.current = null;
        watcherMarkersRef.current = null;
      }
      return;
    }

    const container = mapContainerRef.current;
    if (!container || mapInstanceRef.current) return;

    const map = L.map(container, {
      center: [safeLat, safeLng],
      zoom: 16,
      zoomControl: true,
      attributionControl: true
    });

    map.on('click', (ev: L.LeafletMouseEvent) => {
      if (onSelectCoordsRef.current) {
        onSelectCoordsRef.current(
          Number(ev.latlng.lat.toFixed(6)),
          Number(ev.latlng.lng.toFixed(6))
        );
      }
    });

    const circle = L.circle([safeLat, safeLng], {
      radius: safeRadius,
      color: '#d97706',
      weight: 3,
      opacity: 0.95,
      fillColor: '#F5C429',
      fillOpacity: 0.2,
      dashArray: isUnsavedDraft ? '6 6' : undefined
    }).addTo(map);

    const marker = L.marker([safeLat, safeLng], {
      icon: courtPinIcon,
      draggable: Boolean(onSelectCoordsRef.current),
      title: 'Centro da Quadra Configurada'
    }).addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      if (onSelectCoordsRef.current) {
        onSelectCoordsRef.current(
          Number(pos.lat.toFixed(6)),
          Number(pos.lng.toFixed(6))
        );
      }
    });

    const watchersGroup = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;
    circleRef.current = circle;
    courtMarkerRef.current = marker;
    watcherMarkersRef.current = watchersGroup;

    const resizeTimer = window.setTimeout(() => {
      try {
        map.invalidateSize();
        map.fitBounds(circle.getBounds(), { padding: [36, 36], maxZoom: 17 });
      } catch {}
    }, 80);

    return () => {
      window.clearTimeout(resizeTimer);
      map.remove();
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
      circleRef.current = null;
      courtMarkerRef.current = null;
      testMarkerRef.current = null;
      testLineRef.current = null;
      trailLayerRef.current = null;
      watcherMarkersRef.current = null;
    };
  }, [visualMode, courtPinIcon]);

  // Swap tile provider cleanly when switching between Streets, Dark, and Satellite
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || visualMode === 'radar' || visualMode === 'waze') return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    if (circleRef.current) {
      circleRef.current.setStyle({
        color: visualMode === 'streets' ? '#d97706' : '#F5C429',
        fillColor: '#F5C429',
        fillOpacity: visualMode === 'streets' ? 0.22 : 0.16
      });
    }

    setTileErrorCount(0);

    let tileUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    let attribution = '&copy; OpenStreetMap &copy; CARTO';

    if (visualMode === 'dark') {
      tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      attribution = '&copy; OpenStreetMap &copy; CARTO';
    } else if (visualMode === 'satellite') {
      tileUrl =
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      attribution = '&copy; Esri';
    }

    const layer = L.tileLayer(tileUrl, {
      attribution,
      maxZoom: 19
    });

    layer.on('tileerror', () => {
      setTileErrorCount((prev) => prev + 1);
    });

    layer.addTo(map);
    tileLayerRef.current = layer;
  }, [visualMode]);

  // Update center, geofence circle, active multi-member watchers, and optional tested point
  useEffect(() => {
    const map = mapInstanceRef.current;
    const circle = circleRef.current;
    const courtMarker = courtMarkerRef.current;
    const watchersGroup = watcherMarkersRef.current;
    if (!map || !circle || !courtMarker || visualMode === 'radar' || visualMode === 'waze') return;

    const center = L.latLng(safeLat, safeLng);
    courtMarker.setLatLng(center);
    circle.setLatLng(center);
    circle.setRadius(safeRadius);
    circle.setStyle({
      dashArray: isUnsavedDraft ? '6 6' : undefined
    });

    if (testMarkerRef.current) {
      map.removeLayer(testMarkerRef.current);
      testMarkerRef.current = null;
    }
    if (testLineRef.current) {
      map.removeLayer(testLineRef.current);
      testLineRef.current = null;
    }
    if (trailLayerRef.current) {
      map.removeLayer(trailLayerRef.current);
      trailLayerRef.current = null;
    }
    if (watchersGroup) {
      watchersGroup.clearLayers();
    }

    let combinedBounds = circle.getBounds();

    // Render all active members simultaneously on the map
    if (watchersGroup && validWatchers.length > 0) {
      validWatchers.forEach((w) => {
        const wLatLng = L.latLng(w.lat, w.lng);
        const isInside = Boolean(w.arrived) || w.distanceMeters <= safeRadius;
        const pinBg = isInside ? '#10b981' : '#f59e0b';
        const firstName = escapeHtml(String(w.name || 'Sócio').trim().split(/\s+/)[0] || 'Sócio');
        const badgeText = w.arrivalOrder
          ? `#${w.arrivalOrder} ${firstName}`
          : `${firstName} · ${w.distanceMeters}m`;

        const wIcon = L.divIcon({
          className: 'guerreiros-watcher-pin',
          html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);white-space:nowrap;">
            <div style="padding:2px 7px;border-radius:9999px;background:#09090b;color:#ffffff;border:1.5px solid ${pinBg};font-size:10px;font-weight:800;box-shadow:0 2px 8px rgba(0,0,0,0.65);margin-bottom:3px;">
              ${badgeText}
            </div>
            <div style="width:14px;height:14px;border-radius:9999px;background:${pinBg};border:2.5px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.65);"></div>
          </div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0]
        });

        L.marker(wLatLng, {
          icon: wIcon,
          title: `${w.name} (${w.distanceMeters}m)`
        }).addTo(watchersGroup);

        combinedBounds = combinedBounds.extend(wLatLng);
      });
    }

    const validTrail = (trailPoints || []).filter(
      (pt) => Number.isFinite(pt.lat) && Number.isFinite(pt.lng)
    );
    if (validTrail.length >= 2) {
      const trailLatLngs = validTrail.map((pt) => L.latLng(pt.lat, pt.lng));
      const trailLine = L.polyline(trailLatLngs, {
        color: '#0284c7',
        weight: 3.5,
        dashArray: '4 6',
        opacity: 0.9
      }).addTo(map);
      trailLayerRef.current = trailLine;
      validTrail.forEach((pt) => {
        combinedBounds = combinedBounds.extend(L.latLng(pt.lat, pt.lng));
      });
    }

    if (testPoint && Number.isFinite(testPoint.lat) && Number.isFinite(testPoint.lng)) {
      const testLatLng = L.latLng(testPoint.lat, testPoint.lng);
      const isAllowed = Boolean(testPoint.allowed);
      const badgeColor = isAllowed ? '#10b981' : '#f43f5e';

      const testIcon = L.divIcon({
        className: 'guerreiros-test-pin',
        html: `<div style="width:18px;height:18px;border-radius:9999px;background:${badgeColor};border:2.5px solid #ffffff;box-shadow:0 2px 10px rgba(0,0,0,0.65);"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });

      const tMarker = L.marker(testLatLng, {
        icon: testIcon,
        title: testPoint.label || 'Ponto Testado'
      }).addTo(map);

      if (typeof testPoint.distanceMeters === 'number') {
        tMarker.bindTooltip(
          `${isAllowed ? 'Dentro' : 'Fora'} · ${testPoint.distanceMeters}m`,
          { direction: 'top', offset: [0, -8] }
        );
      }

      const line = L.polyline([center, testLatLng], {
        color: badgeColor,
        weight: 2.5,
        dashArray: '5 5',
        opacity: 0.9
      }).addTo(map);

      testMarkerRef.current = tMarker;
      testLineRef.current = line;
      combinedBounds = combinedBounds.extend(testLatLng);
    }

    map.fitBounds(combinedBounds, { padding: [36, 36], maxZoom: 17 });
  }, [safeLat, safeLng, safeRadius, isUnsavedDraft, testPoint, trailPoints, validWatchers, visualMode]);

  const handleRecenterMap = () => {
    const map = mapInstanceRef.current;
    const circle = circleRef.current;
    if (!map || !circle) return;
    map.invalidateSize();
    map.fitBounds(circle.getBounds(), { padding: [36, 36], maxZoom: 17 });
  };

  // SVG Radar geometry (center at 160, 120; geofence radius = 66px; outer ring = 104px)
  const radarGeometry = useMemo(() => {
    const cx = 160;
    const cy = 120;
    const geofenceR = 66;
    const outerR = 104;
    const halfR = 33;
    const outerMeters = Math.round(safeRadius * (outerR / geofenceR));
    const pxPerMeter = geofenceR / safeRadius;
    const maxPlotPx = outerR - 4;

    const plotCoords = (targetLat: number, targetLng: number, distOverride?: number, allowedOverride?: boolean, label?: string) => {
      const { eastMeters, northMeters, totalMeters } = projectOffsetMeters(
        safeLat,
        safeLng,
        targetLat,
        targetLng
      );
      let dx = eastMeters * pxPerMeter;
      let dy = -northMeters * pxPerMeter;
      const distPx = Math.hypot(dx, dy);
      let clamped = false;
      if (distPx > maxPlotPx && distPx > 0) {
        const scale = maxPlotPx / distPx;
        dx *= scale;
        dy *= scale;
        clamped = true;
      }
      const effDist = typeof distOverride === 'number' ? distOverride : totalMeters;
      return {
        x: cx + dx,
        y: cy + dy,
        clamped,
        totalMeters: effDist,
        allowed: typeof allowedOverride === 'boolean' ? allowedOverride : effDist <= safeRadius,
        label: label || ''
      };
    };

    const plottedTest =
      testPoint && Number.isFinite(testPoint.lat) && Number.isFinite(testPoint.lng)
        ? plotCoords(testPoint.lat, testPoint.lng, testPoint.distanceMeters, Boolean(testPoint.allowed), testPoint.label)
        : null;

    const plottedWatchers = validWatchers.map((w) => {
      const firstName = String(w.name || 'Sócio').trim().split(/\s+/)[0] || 'Sócio';
      return {
        id: w.playerId,
        ...plotCoords(
          w.lat,
          w.lng,
          w.distanceMeters,
          Boolean(w.arrived) || w.distanceMeters <= safeRadius,
          w.arrivalOrder ? `#${w.arrivalOrder} ${firstName}` : `${firstName} (${w.distanceMeters}m)`
        )
      };
    });

    return { cx, cy, geofenceR, outerR, halfR, outerMeters, plottedTest, plottedWatchers };
  }, [safeLat, safeLng, safeRadius, testPoint, validWatchers]);

  const googleMapsVerifyUrl = `https://www.google.com/maps/dir/?api=1&destination=${safeLat.toFixed(6)},${safeLng.toFixed(6)}&travelmode=driving`;
  const wazeNavigateUrl = `https://waze.com/ul?ll=${safeLat.toFixed(6)},${safeLng.toFixed(6)}&navigate=yes`;
  const wazeEmbedUrl = `https://embed.waze.com/pt-BR/iframe?zoom=16&lat=${safeLat.toFixed(6)}&lon=${safeLng.toFixed(6)}&pin=1`;

  return (
    <div className="rounded-xl bg-zinc-950/90 border border-white/10 overflow-hidden">
      {/* Toolbar */}
      <div className="px-3 py-2.5 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 bg-zinc-900/70">
        <div className="flex items-center gap-2 min-w-0">
          <Radio className="w-4 h-4 text-brand-primary shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[11px] font-bold text-white truncate">
                Mapa de Ruas &amp; Cerca Virtual · Raio{' '}
                <span className="font-mono tabular-nums text-brand-primary">{safeRadius}m</span>
              </p>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[9px] font-bold">
                100% Gratuito · Sem Chave de API
              </span>
              {validWatchers.length > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/30 text-sky-300 text-[9px] font-bold flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {validWatchers.length} sócio{validWatchers.length > 1 ? 's' : ''} no radar
                </span>
              )}
            </div>
            <p className="text-[10px] font-mono tabular-nums text-white/50 truncate">
              {safeLat.toFixed(6)}, {safeLng.toFixed(6)}
              {isUnsavedDraft ? ' · Pré-visualização não salva' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <div
            className="flex items-center bg-black/70 p-0.5 rounded-lg border border-white/10"
            role="group"
            aria-label="Modo de visualização do mapa"
          >
            <button
              type="button"
              onClick={() => setVisualMode('streets')}
              className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                visualMode === 'streets'
                  ? 'bg-brand-primary text-black'
                  : 'text-white/65 hover:text-white'
              }`}
            >
              Ruas Claras
            </button>
            <button
              type="button"
              onClick={() => setVisualMode('dark')}
              className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                visualMode === 'dark'
                  ? 'bg-brand-primary text-black'
                  : 'text-white/65 hover:text-white'
              }`}
            >
              Escuro
            </button>
            <button
              type="button"
              onClick={() => setVisualMode('satellite')}
              className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                visualMode === 'satellite'
                  ? 'bg-brand-primary text-black'
                  : 'text-white/65 hover:text-white'
              }`}
            >
              Satélite
            </button>
            <button
              type="button"
              onClick={() => setVisualMode('waze')}
              className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                visualMode === 'waze'
                  ? 'bg-sky-400 text-black'
                  : 'text-sky-300/80 hover:text-sky-200'
              }`}
            >
              Trânsito Waze
            </button>
            <button
              type="button"
              onClick={() => setVisualMode('radar')}
              className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                visualMode === 'radar'
                  ? 'bg-brand-primary text-black'
                  : 'text-white/65 hover:text-white'
              }`}
            >
              Radar
            </button>
          </div>

          {visualMode !== 'radar' && visualMode !== 'waze' && (
            <button
              type="button"
              onClick={handleRecenterMap}
              title="Centralizar mapa no raio da quadra"
              className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 text-[10px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LocateFixed className="w-3.5 h-3.5 text-brand-primary" />
              <span className="hidden sm:inline">Centralizar</span>
            </button>
          )}
        </div>
      </div>

      {/* Viewport */}
      <div className="relative w-full h-[270px] sm:h-[310px] bg-zinc-950">
        {visualMode === 'radar' ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 select-none">
            <svg
              viewBox="0 0 320 240"
              className="w-full h-full max-h-[250px]"
              role="img"
              aria-label={`Radar de alcance com raio de ${safeRadius} metros`}
            >
              <defs>
                <radialGradient id="geofenceFillGrad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#F5C429" stopOpacity="0.24" />
                  <stop offset="85%" stopColor="#F5C429" stopOpacity="0.10" />
                  <stop offset="100%" stopColor="#F5C429" stopOpacity="0.04" />
                </radialGradient>
              </defs>

              {/* Crosshair axes */}
              <line
                x1={radarGeometry.cx - radarGeometry.outerR - 8}
                y1={radarGeometry.cy}
                x2={radarGeometry.cx + radarGeometry.outerR + 8}
                y2={radarGeometry.cy}
                stroke="rgba(255,255,255,0.10)"
                strokeWidth="1"
              />
              <line
                x1={radarGeometry.cx}
                y1={radarGeometry.cy - radarGeometry.outerR - 8}
                x2={radarGeometry.cx}
                y2={radarGeometry.cy + radarGeometry.outerR + 8}
                stroke="rgba(255,255,255,0.10)"
                strokeWidth="1"
              />

              {/* Outer reference ring */}
              <circle
                cx={radarGeometry.cx}
                cy={radarGeometry.cy}
                r={radarGeometry.outerR}
                fill="none"
                stroke="rgba(255,255,255,0.14)"
                strokeWidth="1"
                strokeDasharray="3 4"
              />

              {/* Active geofence circle */}
              <circle
                cx={radarGeometry.cx}
                cy={radarGeometry.cy}
                r={radarGeometry.geofenceR}
                fill="url(#geofenceFillGrad)"
                stroke="#F5C429"
                strokeWidth="2.2"
                strokeDasharray={isUnsavedDraft ? '6 4' : undefined}
              />

              {/* Half-radius ring */}
              <circle
                cx={radarGeometry.cx}
                cy={radarGeometry.cy}
                r={radarGeometry.halfR}
                fill="none"
                stroke="rgba(245,196,41,0.35)"
                strokeWidth="1"
                strokeDasharray="2 3"
              />

              {/* Cardinal points */}
              <text
                x={radarGeometry.cx}
                y={radarGeometry.cy - radarGeometry.outerR - 6}
                textAnchor="middle"
                fill="rgba(255,255,255,0.45)"
                fontSize="9"
                fontWeight="700"
              >
                N
              </text>
              <text
                x={radarGeometry.cx}
                y={radarGeometry.cy + radarGeometry.outerR + 12}
                textAnchor="middle"
                fill="rgba(255,255,255,0.45)"
                fontSize="9"
                fontWeight="700"
              >
                S
              </text>
              <text
                x={radarGeometry.cx + radarGeometry.outerR + 10}
                y={radarGeometry.cy + 3}
                textAnchor="start"
                fill="rgba(255,255,255,0.45)"
                fontSize="9"
                fontWeight="700"
              >
                L
              </text>
              <text
                x={radarGeometry.cx - radarGeometry.outerR - 10}
                y={radarGeometry.cy + 3}
                textAnchor="end"
                fill="rgba(255,255,255,0.45)"
                fontSize="9"
                fontWeight="700"
              >
                O
              </text>

              {/* Ring distance labels */}
              <text
                x={radarGeometry.cx + 4}
                y={radarGeometry.cy - radarGeometry.halfR + 10}
                fill="rgba(245,196,41,0.8)"
                fontSize="9"
                fontFamily="monospace"
              >
                {Math.round(safeRadius / 2)}m
              </text>
              <text
                x={radarGeometry.cx + 4}
                y={radarGeometry.cy - radarGeometry.geofenceR - 4}
                fill="#F5C429"
                fontSize="10"
                fontWeight="700"
                fontFamily="monospace"
              >
                {safeRadius}m
              </text>
              <text
                x={radarGeometry.cx + 4}
                y={radarGeometry.cy - radarGeometry.outerR + 11}
                fill="rgba(255,255,255,0.45)"
                fontSize="9"
                fontFamily="monospace"
              >
                {radarGeometry.outerMeters}m
              </text>

              {/* Plotted simultaneous active watchers */}
              {radarGeometry.plottedWatchers.map((pw) => (
                <g key={pw.id}>
                  <circle
                    cx={pw.x}
                    cy={pw.y}
                    r="5.5"
                    fill={pw.allowed ? '#10b981' : '#f59e0b'}
                    stroke="#ffffff"
                    strokeWidth="1.8"
                  />
                  <text
                    x={pw.x}
                    y={pw.y - 8}
                    textAnchor="middle"
                    fill={pw.allowed ? '#34d399' : '#fcd34d'}
                    fontSize="8.5"
                    fontWeight="700"
                  >
                    {pw.label}
                  </text>
                </g>
              ))}

              {/* Plotted test GPS point if available */}
              {radarGeometry.plottedTest && (
                <g>
                  <line
                    x1={radarGeometry.cx}
                    y1={radarGeometry.cy}
                    x2={radarGeometry.plottedTest.x}
                    y2={radarGeometry.plottedTest.y}
                    stroke={radarGeometry.plottedTest.allowed ? '#10b981' : '#f43f5e'}
                    strokeWidth="1.5"
                    strokeDasharray="4 3"
                  />
                  <circle
                    cx={radarGeometry.plottedTest.x}
                    cy={radarGeometry.plottedTest.y}
                    r="6"
                    fill={radarGeometry.plottedTest.allowed ? '#10b981' : '#f43f5e'}
                    stroke="#ffffff"
                    strokeWidth="2"
                  />
                  <text
                    x={radarGeometry.plottedTest.x}
                    y={radarGeometry.plottedTest.y - 10}
                    textAnchor="middle"
                    fill={radarGeometry.plottedTest.allowed ? '#34d399' : '#fb7185'}
                    fontSize="9"
                    fontWeight="700"
                    fontFamily="monospace"
                  >
                    {radarGeometry.plottedTest.totalMeters}m
                    {radarGeometry.plottedTest.clamped ? '+' : ''}
                  </text>
                </g>
              )}

              {/* Court center marker */}
              <circle
                cx={radarGeometry.cx}
                cy={radarGeometry.cy}
                r="7"
                fill="#F5C429"
                stroke="#09090b"
                strokeWidth="2.5"
              />
            </svg>
          </div>
        ) : visualMode === 'waze' ? (
          <div className="w-full h-full relative bg-zinc-950">
            <iframe
              src={wazeEmbedUrl}
              title="Mapa de Trânsito ao Vivo Waze ao redor da Quadra"
              className="w-full h-full border-0"
              allowFullScreen
              loading="lazy"
            />
            <div className="absolute top-2.5 left-2.5 z-[10] px-2.5 py-1 rounded-lg bg-zinc-950/90 border border-sky-500/40 text-[10px] font-bold text-sky-300 shadow">
              🚗 Trânsito ao Vivo Waze · Ao redor da Quadra
            </div>
          </div>
        ) : (
          <>
            <div ref={mapContainerRef} className="w-full h-full z-0" />
            {tileErrorCount > 3 && (
              <div className="absolute inset-x-3 bottom-3 z-[400] bg-zinc-950/90 border border-white/15 rounded-lg px-3 py-2 flex items-center justify-between gap-2 text-[10px] text-white/80">
                <span>Mapa de ruas bloqueado na sua rede atual.</span>
                <button
                  type="button"
                  onClick={() => setVisualMode('radar')}
                  className="px-2.5 py-1 rounded bg-brand-primary text-black font-bold shrink-0 cursor-pointer"
                >
                  Abrir Radar
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Simultaneous Active Members Bar (when 1 or more members are being tracked) */}
      {validWatchers.length > 0 && (
        <div className="px-3 py-2 border-t border-white/10 bg-zinc-950/90 flex items-center gap-2 overflow-x-auto">
          <span className="text-[10px] font-bold text-white/60 whitespace-nowrap shrink-0 flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-brand-primary" />
            Sócios simultâneos no mapa ({validWatchers.length}):
          </span>
          <div className="flex items-center gap-1.5">
            {validWatchers.map((w) => {
              const isInside = Boolean(w.arrived) || w.distanceMeters <= safeRadius;
              const firstName = String(w.name || 'Sócio').trim().split(/\s+/)[0] || 'Sócio';
              return (
                <span
                  key={w.playerId}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap border ${
                    isInside
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  }`}
                >
                  {w.arrivalOrder ? `#${w.arrivalOrder} ` : ''}
                  {firstName} · {w.distanceMeters}m {isInside ? '(Na Quadra)' : '(A caminho)'}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Radius slider + presets + metrics footer */}
      <div className="px-3 py-2.5 border-t border-white/10 bg-zinc-900/50 space-y-2.5">
        {onChangeRadius && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            <div className="flex-1 flex items-center gap-2.5">
              <span className="text-[10px] font-bold text-white/60 whitespace-nowrap">
                Ajuste rápido:
              </span>
              <input
                type="range"
                min={20}
                max={600}
                step={10}
                value={Math.min(600, safeRadius)}
                onChange={(e) => onChangeRadius(Number(e.target.value))}
                aria-label="Ajustar raio da cerca virtual em metros"
                className="flex-1 accent-[#F5C429] cursor-pointer"
              />
              <span className="text-[11px] font-mono font-bold tabular-nums text-brand-primary w-12 text-right">
                {safeRadius}m
              </span>
            </div>

            <div className="flex items-center gap-1 flex-wrap">
              {RADIUS_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onChangeRadius(preset)}
                  className={`px-2 py-1 rounded-md text-[10px] font-mono font-bold tabular-nums transition-colors cursor-pointer ${
                    safeRadius === preset
                      ? 'bg-brand-primary text-black'
                      : 'bg-white/5 hover:bg-white/10 text-white/70 border border-white/10'
                  }`}
                >
                  {preset}m
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-white/60">
          <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums">
            <span>Diâmetro: {safeRadius * 2}m</span>
            <span aria-hidden="true">·</span>
            <span>Área: {formatGeofenceArea(safeRadius)}</span>
            {visualMode !== 'radar' && visualMode !== 'waze' && onSelectCoords && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-sans text-white/50 flex items-center gap-1">
                  <Crosshair className="w-3 h-3 text-brand-primary" />
                  Toque no mapa ou arraste o pino para ajustar
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={wazeNavigateUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 text-[10px] font-bold text-sky-300 flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              🚗 Rota no Waze
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href={googleMapsVerifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-[10px] font-bold text-emerald-300 flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <Layers className="w-3 h-3" />
              Rota no Google Maps
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, MapPin, CheckCircle2, AlertTriangle, Compass } from 'lucide-react';

export interface AdminMiniMapPreviewProps {
  targetLat: number;
  targetLng: number;
  capturedLat: number;
  capturedLng: number;
  questTitle: string;
  userName: string;
  radiusMeters: number;
  distanceMeters: number;
  capturedAccuracy?: number;
  status?: 'pending' | 'approved' | 'rejected';
}

export function AdminMiniMapPreview({
  targetLat,
  targetLng,
  capturedLat,
  capturedLng,
  questTitle,
  userName,
  radiusMeters,
  distanceMeters,
  capturedAccuracy,
}: AdminMiniMapPreviewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const isValidDistance = distanceMeters <= radiusMeters;
  const isJSDOM = typeof window !== 'undefined' && (window.navigator.userAgent.includes('jsdom') || !window.requestAnimationFrame);

  const handleOpenPublicMap = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const url = `https://juanderquest.app/map?lat=${targetLat}&lng=${targetLng}&name=${encodeURIComponent(questTitle)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    if (isJSDOM || !mapContainerRef.current) return;

    let isDisposed = false;

    async function initLeaflet() {
      try {
        const L = (await import('leaflet')).default;
        await import('leaflet/dist/leaflet.css');

        if (isDisposed || !mapContainerRef.current) return;

        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }

        // Validate coords
        const validTargetLat = isNaN(targetLat) ? 16.0232 : targetLat;
        const validTargetLng = isNaN(targetLng) ? 120.2317 : targetLng;
        const validCapturedLat = isNaN(capturedLat) ? validTargetLat : capturedLat;
        const validCapturedLng = isNaN(capturedLng) ? validTargetLng : capturedLng;

        const map = L.map(mapContainerRef.current, {
          zoomControl: false,
          attributionControl: false,
          dragging: false,
          touchZoom: false,
          scrollWheelZoom: false,
          doubleClickZoom: false,
          boxZoom: false,
          keyboard: false,
        }).setView([validTargetLat, validTargetLng], 15);

        // OpenStreetMap raster tile layer
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18,
          attribution: '',
        }).addTo(map);

        // Geofence radius circle
        const circleColor = isValidDistance ? '#2d6a4f' : '#bc4749';
        L.circle([validTargetLat, validTargetLng], {
          radius: radiusMeters,
          color: circleColor,
          fillColor: circleColor,
          fillOpacity: 0.18,
          weight: 2,
          dashArray: '4, 4',
        }).addTo(map);

        // Target Landmark Icon (Timber Gold Flag)
        const targetHtml = `
          <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
            <div style="background:#582f0e;border:2px solid #ffb703;color:#faf9f5;border-radius:9999px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.35);">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
            </div>
            <div style="background:rgba(88,47,14,0.85);color:#faf9f5;font-size:9px;font-weight:800;padding:2px 5px;border-radius:4px;margin-top:2px;white-space:nowrap;">Landmark</div>
          </div>
        `;
        const targetIcon = L.divIcon({
          className: 'admin-map-pin',
          html: targetHtml,
          iconSize: [50, 42],
          iconAnchor: [25, 20],
        });
        L.marker([validTargetLat, validTargetLng], { icon: targetIcon }).addTo(map);

        // Captured Scout Icon (Emerald Pulse or Warning Red)
        const captureColor = isValidDistance ? '#2d6a4f' : '#bc4749';
        const captureHtml = `
          <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
            <div style="background:${captureColor};border:2px solid #ffffff;color:#ffffff;border-radius:9999px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.35);">
              <div style="width:6px;height:6px;border-radius:9999px;background:#ffffff;"></div>
            </div>
            <div style="background:${captureColor};color:#ffffff;font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;margin-top:2px;white-space:nowrap;">${userName}</div>
          </div>
        `;
        const captureIcon = L.divIcon({
          className: 'admin-map-pin',
          html: captureHtml,
          iconSize: [50, 42],
          iconAnchor: [25, 20],
        });
        L.marker([validCapturedLat, validCapturedLng], { icon: captureIcon }).addTo(map);

        // Connecting dotted line showing offset
        L.polyline(
          [
            [validTargetLat, validTargetLng],
            [validCapturedLat, validCapturedLng],
          ],
          {
            color: captureColor,
            weight: 2,
            dashArray: '3, 5',
            opacity: 0.8,
          }
        ).addTo(map);

        // Fit bounds to cover both points and geofence
        const bounds = L.latLngBounds([
          [validTargetLat, validTargetLng],
          [validCapturedLat, validCapturedLng],
        ]);
        map.fitBounds(bounds, { padding: [35, 35], maxZoom: 16 });

        mapInstanceRef.current = map;
        setMapReady(true);

        setTimeout(() => {
          if (!isDisposed && mapInstanceRef.current) {
            mapInstanceRef.current.invalidateSize();
          }
        }, 120);
      } catch (err) {
        console.error('Failed to init AdminMiniMapPreview:', err);
        setLoadError(true);
      }
    }

    initLeaflet();

    return () => {
      isDisposed = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [targetLat, targetLng, capturedLat, capturedLng, radiusMeters, distanceMeters, isJSDOM, userName, isValidDistance]);

  return (
    <div
      onClick={handleOpenPublicMap}
      title="Click to view destination on public explorer map"
      style={{
        position: 'relative',
        width: '100%',
        height: '150px',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid #d5c4ac',
        background: '#FAF9F5',
        cursor: 'pointer',
        marginTop: '10px',
        marginBottom: '10px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      {/* Real Leaflet canvas if available in browser */}
      {!isJSDOM && !loadError ? (
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
      ) : (
        /* Visual SVG Geofence Radar Fallback for JSDOM or offline fallback */
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #FAF9F5 0%, #EDE8DC 100%)',
            position: 'relative',
          }}
        >
          <svg width="100%" height="100%" viewBox="0 0 280 140" style={{ maxWidth: '280px' }}>
            {/* Grid concentric rings */}
            <circle cx="140" cy="70" r="50" fill={isValidDistance ? 'rgba(45, 106, 79, 0.08)' : 'rgba(188, 71, 73, 0.08)'} stroke={isValidDistance ? '#2d6a4f' : '#bc4749'} strokeWidth="1.5" strokeDasharray="3 3" />
            <circle cx="140" cy="70" r="28" fill="none" stroke="#d5c4ac" strokeWidth="1" strokeDasharray="2 2" />
            {/* Center Landmark Pin */}
            <circle cx="140" cy="70" r="7" fill="#582f0e" stroke="#ffb703" strokeWidth="2" />
            <text x="140" y="90" fontSize="9" fontWeight="bold" fill="#582f0e" textAnchor="middle">Landmark</text>
            {/* Captured Scout Pin */}
            {isValidDistance ? (
              <>
                <line x1="140" y1="70" x2="165" y2="55" stroke="#2d6a4f" strokeWidth="1.5" strokeDasharray="2 2" />
                <circle cx="165" cy="55" r="5.5" fill="#2d6a4f" stroke="#ffffff" strokeWidth="1.5" />
                <text x="165" y="44" fontSize="8.5" fontWeight="bold" fill="#2d6a4f" textAnchor="middle">{userName}</text>
              </>
            ) : (
              <>
                <line x1="140" y1="70" x2="195" y2="40" stroke="#bc4749" strokeWidth="1.5" strokeDasharray="2 2" />
                <circle cx="195" cy="40" r="5.5" fill="#bc4749" stroke="#ffffff" strokeWidth="1.5" />
                <text x="195" y="30" fontSize="8.5" fontWeight="bold" fill="#bc4749" textAnchor="middle">{userName} (Out of Bounds)</text>
              </>
            )}
          </svg>
        </div>
      )}

      {/* Floating Geofence Status Badge */}
      <div
        style={{
          position: 'absolute',
          top: '8px',
          left: '8px',
          zIndex: 10,
          background: isValidDistance ? '#2d6a4f' : '#bc4749',
          color: '#ffffff',
          padding: '4px 8px',
          borderRadius: '8px',
          fontSize: '11px',
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          pointerEvents: 'none',
        }}
      >
        {isValidDistance ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
        <span>{isValidDistance ? `Inside Geofence (${distanceMeters}m offset)` : `Out of Bounds (${distanceMeters}m / ${radiusMeters}m)`}</span>
      </div>

      {/* Bottom Map Inspect Link */}
      <div
        style={{
          position: 'absolute',
          bottom: '8px',
          right: '8px',
          zIndex: 10,
          background: 'rgba(255, 255, 255, 0.95)',
          color: '#2d6a4f',
          padding: '3px 8px',
          borderRadius: '6px',
          fontSize: '10px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          border: '1px solid #d5c4ac',
          backdropFilter: 'blur(4px)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
        <span>Open Public Map</span>
        <ExternalLink size={10} />
      </div>
    </div>
  );
}

export function ProximityGauge({
  distanceMeters,
  radiusMeters,
}: {
  distanceMeters: number;
  radiusMeters: number;
}) {
  const isValid = distanceMeters <= radiusMeters;
  const maxRange = Math.max(radiusMeters * 1.5, distanceMeters * 1.2, 100);
  const targetThresholdPct = Math.min(100, Math.round((radiusMeters / maxRange) * 100));
  const currentDistancePct = Math.min(100, Math.max(0, Math.round((distanceMeters / maxRange) * 100)));

  return (
    <div style={{ marginTop: '4px', marginBottom: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
        <span style={{ color: '#514532', fontWeight: 600 }}>Proximity Verification:</span>
        <span style={{ fontWeight: 800, color: isValid ? '#2d6a4f' : '#bc4749' }}>
          {distanceMeters}m offset (Allowed: ≤ {radiusMeters}m)
        </span>
      </div>
      <div
        style={{
          position: 'relative',
          height: '10px',
          width: '100%',
          background: '#e9e8e4',
          borderRadius: '5px',
          overflow: 'visible',
        }}
      >
        {/* Valid Zone Range Bar */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${targetThresholdPct}%`,
            background: 'rgba(45, 106, 79, 0.25)',
            borderRadius: '5px 0 0 5px',
          }}
        />

        {/* Boundary tick line */}
        <div
          style={{
            position: 'absolute',
            left: `${targetThresholdPct}%`,
            top: '-2px',
            bottom: '-2px',
            width: '2px',
            background: '#2d6a4f',
            zIndex: 2,
          }}
          title={`Allowed radius: ${radiusMeters}m`}
        />

        {/* Traveler Capture Indicator Dot */}
        <div
          style={{
            position: 'absolute',
            left: `calc(${currentDistancePct}% - 6px)`,
            top: '-3px',
            width: '16px',
            height: '16px',
            borderRadius: '9999px',
            background: isValid ? '#2d6a4f' : '#bc4749',
            border: '2.5px solid #ffffff',
            boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
            zIndex: 3,
            transition: 'left 0.3s ease',
          }}
          title={`Traveler captured here: ${distanceMeters}m`}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#837560', marginTop: '3px' }}>
        <span>0m (Center)</span>
        <span style={{ color: '#2d6a4f', fontWeight: 700 }}>Radius Limit: {radiusMeters}m</span>
        <span>{Math.round(maxRange)}m+</span>
      </div>
    </div>
  );
}

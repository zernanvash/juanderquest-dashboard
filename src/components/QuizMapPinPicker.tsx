import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';
import { apiFetch } from '../api/client';
import type { Spot } from '../types';
import { MAP_TILE_MAX_NATIVE_ZOOM, MAP_TILE_URL } from '../mapTiles';

const DEFAULT_LAT = 16.0431;
const DEFAULT_LNG = 120.3333;

interface QuizMapPinPickerProps {
  spots: Spot[];
  destinationId: string;
  pinLat?: number;
  pinLng?: number;
  locationLabel?: string;
  municipality?: string;
  radiusMeters: number;
  onChange: (patch: {
    destinationId?: string;
    pinLat?: number;
    pinLng?: number;
    locationLabel?: string;
    municipality?: string;
  }) => void;
}

export function QuizMapPinPicker({
  spots,
  destinationId,
  pinLat,
  pinLng,
  locationLabel,
  municipality,
  radiusMeters,
  onChange,
}: QuizMapPinPickerProps) {
  const [spotFilter, setSpotFilter] = useState('');
  const [recognizing, setRecognizing] = useState(false);
  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const filteredSpots = useMemo(() => {
    const q = spotFilter.trim().toLowerCase();
    if (!q) return spots;
    return spots.filter((s) => `${s.name} ${s.municipality}`.toLowerCase().includes(q));
  }, [spots, spotFilter]);

  const activeLat = typeof pinLat === 'number' && Number.isFinite(pinLat) ? pinLat : DEFAULT_LAT;
  const activeLng = typeof pinLng === 'number' && Number.isFinite(pinLng) ? pinLng : DEFAULT_LNG;
  const hasPin = typeof pinLat === 'number' && Number.isFinite(pinLat) && typeof pinLng === 'number' && Number.isFinite(pinLng);

  const recognizePoint = async (lat: number, lng: number) => {
    setRecognizing(true);
    try {
      const info = await apiFetch<{ municipality?: string; suggested_name?: string; name?: string }>(
        `/spots/recognize?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
      );
      onChangeRef.current({
        pinLat: lat,
        pinLng: lng,
        ...(info?.municipality ? { municipality: info.municipality } : {}),
        ...(!locationLabel && (info?.suggested_name || info?.name)
          ? { locationLabel: info.suggested_name || info.name }
          : {}),
      });
    } catch {
      onChangeRef.current({ pinLat: lat, pinLng: lng });
    } finally {
      setRecognizing(false);
    }
  };

  useEffect(() => {
    const host = mapHostRef.current;
    if (!host || mapRef.current) return;
    const map = L.map(host, {
      center: [activeLat, activeLng],
      zoom: hasPin ? 14 : 10,
      zoomControl: true,
    });
    L.tileLayer(MAP_TILE_URL, {
      maxNativeZoom: MAP_TILE_MAX_NATIVE_ZOOM,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    map.on('click', (event: L.LeafletMouseEvent) => {
      const lat = Number(event.latlng.lat.toFixed(6));
      const lng = Number(event.latlng.lng.toFixed(6));
      onChangeRef.current({ pinLat: lat, pinLng: lng });
      void recognizePoint(lat, lng);
    });

    mapRef.current = map;
    return () => {
      try {
        map.remove();
      } catch {
        // Ignore headless jsdom SVG renderer teardown errors
      }
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!hasPin) {
      markerRef.current?.remove();
      markerRef.current = null;
      circleRef.current?.remove();
      circleRef.current = null;
      return;
    }

    const latLng: [number, number] = [activeLat, activeLng];
    if (!markerRef.current) {
      const marker = L.marker(latLng, { draggable: true }).addTo(map);
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        const lat = Number(pos.lat.toFixed(6));
        const lng = Number(pos.lng.toFixed(6));
        onChangeRef.current({ pinLat: lat, pinLng: lng });
        void recognizePoint(lat, lng);
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLatLng(latLng);
    }

    try {
      if (!circleRef.current) {
        circleRef.current = L.circle(latLng, {
          radius: radiusMeters,
          color: '#2d6a4f',
          fillColor: '#2d6a4f',
          fillOpacity: 0.14,
          weight: 2,
        }).addTo(map);
      } else {
        circleRef.current.setLatLng(latLng);
        circleRef.current.setRadius(radiusMeters);
      }
    } catch {
      // Ignore headless jsdom SVG renderer errors
    }

    map.setView(latLng, Math.max(map.getZoom(), 13), { animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPin, activeLat, activeLng, radiusMeters]);

  const handleSnapSpot = (spotId: string) => {
    const spot = spots.find((s) => s.id === spotId);
    if (!spot) {
      onChange({ destinationId: '' });
      return;
    }
    onChange({
      destinationId: spot.id,
      pinLat: Number(spot.gps_lat),
      pinLng: Number(spot.gps_lng),
      locationLabel: spot.name,
      municipality: spot.municipality,
    });
  };

  return (
    <div className="quiz-pin-picker stitch-panel">
      <div className="quiz-pin-header">
        <div>
          <span className="eyebrow">Quiz location &amp; geofence pin</span>
          <p className="section-description">
            Click anywhere on the map (or drag the pin) to set the quiz geofence, or snap to an existing destination.
          </p>
        </div>
        {hasPin ? (
          <span className="mono-chip">
            <MapPin size={12} aria-hidden="true" /> {activeLat.toFixed(5)}, {activeLng.toFixed(5)}
          </span>
        ) : (
          <span className="mono-chip">No pin set yet</span>
        )}
      </div>

      <div className="quiz-pin-snap-row">
        <label className="quiz-field">
          <span>Filter destinations</span>
          <input
            type="search"
            value={spotFilter}
            onChange={(event) => setSpotFilter(event.target.value)}
            placeholder="Search place or town in Pangasinan…"
            aria-label="Filter destinations to snap pin"
          />
        </label>
        <label className="quiz-field">
          <span>Snap to existing destination (optional)</span>
          <select
            value={destinationId}
            onChange={(event) => handleSnapSpot(event.target.value)}
            aria-label="Snap to existing destination"
          >
            <option value="">Custom map pin (no preset destination)</option>
            {filteredSpots.map((spot) => (
              <option key={spot.id} value={spot.id}>
                {spot.name} · {spot.municipality}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        ref={mapHostRef}
        className="quiz-pin-map-canvas"
        aria-label="Interactive quiz pin map"
        data-testid="quiz-pin-map"
      />

      <div className="quiz-pin-meta-grid">
        <label className="quiz-field">
          <span>Pinned latitude</span>
          <input
            type="number"
            step="0.000001"
            value={hasPin ? String(activeLat) : ''}
            onChange={(event) => {
              const v = Number(event.target.value);
              onChange({ pinLat: Number.isFinite(v) ? v : undefined });
            }}
            placeholder="16.043100"
          />
        </label>
        <label className="quiz-field">
          <span>Pinned longitude</span>
          <input
            type="number"
            step="0.000001"
            value={hasPin ? String(activeLng) : ''}
            onChange={(event) => {
              const v = Number(event.target.value);
              onChange({ pinLng: Number.isFinite(v) ? v : undefined });
            }}
            placeholder="120.333300"
          />
        </label>
        <label className="quiz-field">
          <span>Location label</span>
          <input
            type="text"
            maxLength={160}
            value={locationLabel ?? ''}
            onChange={(event) => onChange({ locationLabel: event.target.value })}
            placeholder="e.g. Dagupan City Plaza Landmark"
          />
        </label>
        <label className="quiz-field">
          <span>Municipality{recognizing ? ' (detecting…)' : ''}</span>
          <input
            type="text"
            maxLength={120}
            value={municipality ?? ''}
            onChange={(event) => onChange({ municipality: event.target.value })}
            placeholder="e.g. Dagupan City"
          />
        </label>
      </div>
    </div>
  );
}

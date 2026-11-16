import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';

export interface TrailStopPoint {
  position: number;
  spot_id: string;
  name: string;
  municipality: string;
  lat: number | string;
  lng: number | string;
  leg_minutes?: number;
  leg_km?: number;
  approximate?: boolean;
}

export function TrailMapPreview({ stops }: { stops: TrailStopPoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || stops.length === 0) return;

    const coords = stops
      .map((s) => ({ ...s, nLat: Number(s.lat), nLng: Number(s.lng) }))
      .filter((s) => Number.isFinite(s.nLat) && Number.isFinite(s.nLng));
    if (coords.length === 0) return;

    try {
      const map = L.map(el, {
        center: [coords[0].nLat, coords[0].nLng],
        zoom: 12,
        scrollWheelZoom: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(map);

      const latLngs: L.LatLngExpression[] = coords.map((c) => [c.nLat, c.nLng]);
      if (latLngs.length > 1) {
        const hasApprox = coords.some((c) => c.approximate);
        L.polyline(latLngs, {
          color: '#28735a',
          weight: 4,
          dashArray: hasApprox ? '7 6' : undefined,
        }).addTo(map);
      }

      coords.forEach((stop, index) => {
        const icon = L.divIcon({
          className: 'trail-leaflet-pin',
          html: `<span>${index + 1}</span>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        L.marker([stop.nLat, stop.nLng], { icon })
          .bindTooltip(`${index + 1}. ${stop.name}${stop.municipality ? ` (${stop.municipality})` : ''}`)
          .addTo(map);
      });

      if (latLngs.length > 1) {
        map.fitBounds(L.latLngBounds(latLngs), { padding: [24, 24] });
      }
      mapRef.current = map;

      return () => {
        map.remove();
        mapRef.current = null;
      };
    } catch {
      return undefined;
    }
  }, [stops]);

  const towns = stops
    .map((stop) => stop.municipality)
    .filter((town, index, array) => Boolean(town) && array.indexOf(town) === index)
    .join(' · ');

  return (
    <div className="trail-studio-map" role="img" aria-label={`Route preview with ${stops.length} stops`}>
      <div ref={containerRef} className="trail-leaflet-canvas" />
      <span className="trail-studio-map-caption">
        <MapPin size={13} aria-hidden="true" /> {towns || 'Route preview'}
      </span>
    </div>
  );
}

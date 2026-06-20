'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

interface Store {
  id: number;
  name: string;
  lat: number;
  lng: number;
  address: string;
  phone?: string;
  website?: string;
  hasLiveData: boolean;
  livePrice?: number;
  liveAvailable?: boolean;
}

interface GeoPoint { lat: number; lng: number; displayName: string; }

interface Props {
  stores: Store[];
  center: GeoPoint;
  productName: string;
}

export default function NearbyMap({ stores, center, productName }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<unknown>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    let isCancelled = false;

    // Dynamically import leaflet only on client
    import('leaflet').then(L => {
      if (isCancelled || mapInstance.current || !mapRef.current) return;
      if ((mapRef.current as any)._leaflet_id) return;

      // Fix default icon paths broken by webpack
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      if (!mapRef.current) return;
      const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: false })
        .setView([center.lat, center.lng], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      // User location pin
      const userIcon = L.divIcon({
        html: `<div style="width:14px;height:14px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 4px rgba(59,130,246,0.3)"></div>`,
        className: '',
        iconAnchor: [7, 7],
      });
      L.marker([center.lat, center.lng], { icon: userIcon })
        .addTo(map)
        .bindPopup('<b>Your location</b>');

      // Store pins
      stores.forEach(store => {
        const color = store.hasLiveData ? '#22c55e' : '#f59e0b';
        const icon = L.divIcon({
          html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4)"></div>`,
          className: '',
          iconAnchor: [6, 6],
        });

        const popupContent = `
          <div style="font-family:Inter,sans-serif;min-width:200px">
            <b style="font-size:14px">${store.name}</b><br/>
            <span style="color:#64748b;font-size:12px">${store.address}</span>
            ${store.phone ? `<br/><a href="tel:${store.phone}" style="color:#3b82f6;font-size:12px">📞 ${store.phone}</a>` : ''}
            ${store.hasLiveData
              ? `<div style="margin-top:8px;padding:6px 10px;background:rgba(34,197,94,0.1);border-radius:6px;font-size:13px">
                  <b style="color:#22c55e">Live price: $${store.livePrice?.toFixed(2) ?? 'N/A'}</b>
                  <br/><span style="color:#64748b">${store.liveAvailable ? '✓ In stock' : '✗ Out of stock'}</span>
                 </div>`
              : `<div style="margin-top:8px;padding:6px 10px;background:rgba(245,158,11,0.1);border-radius:6px;font-size:12px;color:#f59e0b">
                  📞 Nearby — call to confirm stock
                 </div>`
            }
          </div>`;

        L.marker([store.lat, store.lng], { icon })
          .addTo(map)
          .bindPopup(popupContent);
      });

      mapInstance.current = map;
    });

    return () => {
      isCancelled = true;
      if (mapInstance.current) {
        (mapInstance.current as { remove: () => void }).remove();
        mapInstance.current = null;
      }
    };
  }, [stores, center]);

  return (
    <div className="card fade-up-2">
      <p className="section-label">🗺️ Nearby Stores</p>
      <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
          Live price/stock (via Wire)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
          Nearby — call to confirm
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6', border: '2px solid #fff', display: 'inline-block' }} />
          Your location
        </div>
      </div>
      <div ref={mapRef} className="map-container" style={{ height: 340 }} />
      <p style={{ marginTop: 10, fontSize: 12, color: '#475569' }}>
        Found {stores.length} stores matching "{productName}" near {center.displayName.split(',')[0]}. Click pins for details.
      </p>
    </div>
  );
}

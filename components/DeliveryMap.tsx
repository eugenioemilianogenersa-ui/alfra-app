"use client";

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";

// --- Icono ALFRA Delivery ---
const alfraDeliveryIcon = L.icon({
  iconUrl: "/alfra-delivery.png",
  iconRetinaUrl: "/alfra-delivery.png",
  iconSize: [60, 60],
  iconAnchor: [30, 60],
  popupAnchor: [0, -60],
});

// --- Recentrar el mapa cuando cambia la posición (sin tocar zoom) ---
function RecenterAutomatically({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();

  useEffect(() => {
    const currentZoom = map.getZoom(); // mantiene el zoom actual
    map.setView([lat, lng], currentZoom, { animate: true });
  }, [lat, lng, map]);

  return null;
}

interface DeliveryMapProps {
  lat: number;
  lng: number;
}

const DeliveryMap = ({ lat, lng }: DeliveryMapProps) => {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={18}            // ✅ más zoom (calles)
      minZoom={3}
      maxZoom={19}
      scrollWheelZoom={true}
      style={{ height: "340px", width: "100%", borderRadius: "12px", zIndex: 0 }} // ✅ un poco más grande
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <Marker position={[lat, lng]} icon={alfraDeliveryIcon}>
        <Popup>
          🍺 <strong>¡Tu pedido está aquí!</strong> <br />
          En camino hacia vos.
        </Popup>
      </Marker>

      <RecenterAutomatically lat={lat} lng={lng} />
    </MapContainer>
  );
};

export default DeliveryMap;

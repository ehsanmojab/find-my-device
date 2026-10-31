import L from 'leaflet'

/**
 * Creates modern, state-of-the-art navigation base map layers.
 */
export function createTileLayers() {
  const dark = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png',
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20,
    }
  )

  const street = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20,
    }
  )

  const satellite = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      maxZoom: 19,
    }
  )

  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  })

  return {
    defaultLayer: dark,
    baseLayers: {
      '🌙 Dark Navigation': dark,
      '🗺️ Street Navigation': street,
      '🛰️ Satellite View': satellite,
      '🌐 OpenStreetMap': osm,
    },
  }
}

/**
 * Creates a modern glowing radar beacon icon for device tracking.
 */
export function createRadarIcon(color = '#3b82f6', isLive = true) {
  return L.divIcon({
    className: '',
    html: `
      <div class="radar-beacon">
        ${
          isLive
            ? `<div class="radar-ring" style="background: ${color}40;"></div>
               <div class="radar-ring radar-ring-2" style="background: ${color}25;"></div>`
            : ''
        }
        <div class="radar-pin" style="background: ${color};">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="0">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
            <circle cx="12" cy="18" r="1" fill="#0f172a"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -26],
  })
}

/**
 * Creates a clean start point icon for journeys.
 */
export function createStartIcon() {
  return L.divIcon({
    className: '',
    html: `
      <div style="width:28px;height:28px;border-radius:50%;background:#22c55e;border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="white">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  })
}

/**
 * Calculates total route distance in kilometers using the Haversine formula.
 */
export function calculateTotalDistanceKm(points) {
  if (!points || points.length < 2) return 0
  let totalMeters = 0
  const R = 6371e3 // Earth radius in meters

  for (let i = 0; i < points.length - 1; i++) {
    const lat1 = (points[i].lat * Math.PI) / 180
    const lat2 = (points[i + 1].lat * Math.PI) / 180
    const dLat = ((points[i + 1].lat - points[i].lat) * Math.PI) / 180
    const dLon = ((points[i + 1].lon - points[i].lon) * Math.PI) / 180

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    totalMeters += R * c
  }

  return (totalMeters / 1000).toFixed(2)
}

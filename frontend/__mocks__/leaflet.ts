// Leaflet mock for Jest (Leaflet requires a real browser DOM, not jsdom)
const mockMap = {
  remove: jest.fn(),
  panTo: jest.fn(),
  flyTo: jest.fn(),
  addLayer: jest.fn(),
};

const mockMarker = {
  addTo: jest.fn().mockReturnThis(),
  bindPopup: jest.fn().mockReturnThis(),
  setLatLng: jest.fn().mockReturnThis(),
  setIcon: jest.fn().mockReturnThis(),
  setPopupContent: jest.fn().mockReturnThis(),
};

const mockPolyline = {
  addTo: jest.fn().mockReturnThis(),
  setLatLngs: jest.fn().mockReturnThis(),
};

const mockTileLayer = {
  addTo: jest.fn().mockReturnThis(),
};

const L = {
  map: jest.fn(() => mockMap),
  tileLayer: jest.fn(() => mockTileLayer),
  marker: jest.fn(() => mockMarker),
  polyline: jest.fn(() => mockPolyline),
  circle: jest.fn(() => ({ addTo: jest.fn().mockReturnThis() })),
  divIcon: jest.fn(() => ({})),
  Icon: {
    Default: {
      prototype: { _getIconUrl: jest.fn() },
      mergeOptions: jest.fn(),
    },
  },
};

export default L;

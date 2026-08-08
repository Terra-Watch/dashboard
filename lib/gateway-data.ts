export type NodeStatus = 'ONLINE' | 'OFFLINE' | 'SOS';
export type AlertSeverity = 'NORMAL' | 'WARNING' | 'SOS' | 'OFFLINE';
export type PacketKind = 'HEARTBEAT TX' | 'HEARTBEAT RX' | 'HEARTBEAT ACK' | 'DATA RX' | 'DATA ACK' | 'NODE ONLINE';

export interface GatewayNode {
  id: string;
  name: string;
  status: NodeStatus;
  lastSeen: string;
  rssi: number;
  snr: number;
  battery: number;
  temperature: number;
  latitude: number;
  longitude: number;
  sequence: number;
  lastAck: string;
  rtt: number;
  packets: number;
  retries: number;
}

export interface GatewayEvent {
  id: number;
  time: string;
  nodeId: string;
  type: PacketKind;
  sequence: number;
  detail: string;
  status: 'OK' | 'PENDING' | 'INFO';
  rssi?: number;
  snr?: number;
}

export interface GatewaySnapshot {
  gateway: {
    status: 'ONLINE' | 'OFFLINE';
    lora: 'LISTENING' | 'OFFLINE';
    frequency: string;
    uptime: string;
    freeHeap: string;
    packetsReceived: number;
    packetsTransmitted: number;
    ackCount: number;
    errors: number;
    deliveryRate: number;
  };
  nodes: GatewayNode[];
  events: GatewayEvent[];
  rssiHistory: number[];
  snrHistory: number[];
  batteryHistory: number[];
  rttHistory: number[];
  updatedAt: Date;
}

const baseEvents: GatewayEvent[] = [
  { id: 1, time: '14:32:08', nodeId: '0x01', type: 'HEARTBEAT ACK', sequence: 1842, detail: 'ACK confirmed · 86 ms RTT', status: 'OK' },
  { id: 2, time: '14:32:07', nodeId: '0x01', type: 'HEARTBEAT RX', sequence: 1842, detail: 'Validated heartbeat received', status: 'OK', rssi: -71, snr: 8.4 },
  { id: 3, time: '14:31:58', nodeId: '0x01', type: 'HEARTBEAT TX', sequence: 1841, detail: 'Transmission successful', status: 'OK' },
  { id: 4, time: '14:29:15', nodeId: '0x01', type: 'NODE ONLINE', sequence: 1838, detail: 'Node registered with gateway', status: 'INFO' },
  { id: 5, time: '14:28:52', nodeId: 'GW', type: 'DATA ACK', sequence: 92, detail: 'Gateway link check complete', status: 'OK' },
];

export function createMockSnapshot(): GatewaySnapshot {
  return {
    gateway: {
      status: 'ONLINE', lora: 'LISTENING', frequency: '433 MHz', uptime: '04:18:27', freeHeap: '373 KB',
      packetsReceived: 1842, packetsTransmitted: 1861, ackCount: 1838, errors: 4, deliveryRate: 99.4,
    },
    nodes: [{
      id: '0x01', name: 'BoatNode 1', status: 'ONLINE', lastSeen: '2 sec ago', rssi: -71, snr: 8.4,
      battery: 84, temperature: 29.6, latitude: 12.9718, longitude: 74.8234, sequence: 1842,
      lastAck: '14:32:08', rtt: 86, packets: 1842, retries: 7,
    }],
    events: baseEvents,
    rssiHistory: [-78, -75, -73, -75, -70, -72, -71, -71, -69, -71, -70, -71],
    snrHistory: [6.8, 7.4, 7.1, 8.2, 8.1, 8.8, 8.4, 8.7, 8.2, 8.6, 8.4, 8.4],
    batteryHistory: [88, 87, 87, 86, 86, 85, 85, 85, 84, 84, 84, 84],
    rttHistory: [102, 94, 91, 89, 92, 85, 88, 84, 86, 83, 86, 86],
    updatedAt: new Date(),
  };
}

export interface GatewayDataProvider {
  getSnapshot(): GatewaySnapshot;
  subscribe(listener: (snapshot: GatewaySnapshot) => void): () => void;
}

export class MockGatewayProvider implements GatewayDataProvider {
  private snapshot = createMockSnapshot();
  private listeners = new Set<(snapshot: GatewaySnapshot) => void>();
  private timer: ReturnType<typeof setInterval> | undefined;

  getSnapshot() { return this.snapshot; }

  subscribe(listener: (snapshot: GatewaySnapshot) => void) {
    this.listeners.add(listener);
    listener(this.snapshot);
    if (!this.timer) this.timer = setInterval(() => this.tick(), 3200);
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size && this.timer) { clearInterval(this.timer); this.timer = undefined; }
    };
  }

  private tick() {
    const current = this.snapshot.nodes[0];
    const sequence = current.sequence + 1;
    const rssi = Math.round(current.rssi + (Math.random() * 6 - 3));
    const snr = Number(Math.max(5.5, current.snr + (Math.random() * 1.2 - 0.6)).toFixed(1));
    const rtt = Math.round(82 + Math.random() * 18);
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const node = { ...current, sequence, rssi, snr, rtt, lastSeen: 'now', lastAck: time, packets: current.packets + 1 };
    const event: GatewayEvent = { id: Date.now(), time, nodeId: node.id, type: 'HEARTBEAT RX', sequence, detail: 'Validated heartbeat received', status: 'OK', rssi, snr };
    this.snapshot = {
      ...this.snapshot,
      gateway: { ...this.snapshot.gateway, packetsReceived: this.snapshot.gateway.packetsReceived + 1, ackCount: this.snapshot.gateway.ackCount + 1, packetsTransmitted: this.snapshot.gateway.packetsTransmitted + 1 },
      nodes: [node], events: [event, ...this.snapshot.events].slice(0, 8),
      rssiHistory: [...this.snapshot.rssiHistory.slice(-11), rssi], snrHistory: [...this.snapshot.snrHistory.slice(-11), snr],
      rttHistory: [...this.snapshot.rttHistory.slice(-11), rtt], updatedAt: now,
    };
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
}

export const mockGatewayProvider = new MockGatewayProvider();

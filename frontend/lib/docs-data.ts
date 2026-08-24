export type DocStatus =
  | "IMPLEMENTED"
  | "VALIDATED"
  | "INTEGRATION PENDING"
  | "IN PROGRESS"
  | "PLANNED"
  | "NOT IMPLEMENTED";

export interface DocSection {
  id: string;
  number: string;
  title: string;
  slug: string;
  category: string;
  description: string;
  status: DocStatus;
  statusDetail?: string;
  keywords: string[];
}

export interface DocCategory {
  title: string;
  items: DocSection[];
}

export const DOC_SECTIONS: DocSection[] = [
  {
    id: "overview",
    number: "01",
    title: "Overview",
    slug: "/docs",
    category: "Getting Started",
    description: "Core problem, mission, system objectives, architecture overview, and 7-phase networking progression.",
    status: "IMPLEMENTED",
    statusDetail: "Foundation & Architecture Defined",
    keywords: ["overview", "problem", "maritime", "safety", "connectivity", "phases", "architecture", "status", "lora", "jalari"],
  },
  {
    id: "architecture",
    number: "02",
    title: "System Architecture",
    slug: "/docs/architecture",
    category: "System Architecture",
    description: "End-to-end data flow from fisherman to operations dashboard, component boundaries, and offline-first principles.",
    status: "IMPLEMENTED",
    statusDetail: "Multi-tiered System Boundary Established",
    keywords: ["flow", "data flow", "end-to-end", "boundaries", "offline-first", "fisherman", "boatnode", "gateway", "backend", "dashboard"],
  },
  {
    id: "networking",
    number: "03",
    title: "Networking & LoRa Protocol",
    slug: "/docs/networking",
    category: "Core Protocols",
    description: "Protocol v3 frame structure, packet ID, sequence mechanics, hop-by-hop ACK, retry policies, duplicate detection, and multihop roadmap.",
    status: "IMPLEMENTED",
    statusDetail: "Protocol v3 & Single-hop ACK Implemented; Multi-hop in Progress",
    keywords: ["protocol", "packet", "frame", "ack", "retry", "timeout", "duplicate", "dedup", "ttl", "hop", "lbt", "listen-before-talk", "crc-16"],
  },
  {
    id: "boatnode",
    number: "04",
    title: "BoatNode Firmware",
    slug: "/docs/boatnode",
    category: "Hardware & Firmware",
    description: "ESP32-S3 + SX1278 vessel node firmware architecture, HAL decoupling, EventBus, AckManager, NeighborManager, and flashing.",
    status: "IMPLEMENTED",
    statusDetail: "Firmware v0.1.0 (ESP32-S3 + SX1278) Compiled; Hardware RF Pending",
    keywords: ["boatnode", "esp32-s3", "sx1278", "firmware", "eventbus", "packetqueue", "ackmanager", "neighbormanager", "hal", "platformio"],
  },
  {
    id: "gateway",
    number: "05",
    title: "Gateway Firmware",
    slug: "/docs/gateway",
    category: "Hardware & Firmware",
    description: "Maritime edge gateway firmware, continuous LoRa reception, immediate ACK transmission, liveness tracking, and HTTP ingestion.",
    status: "IMPLEMENTED",
    statusDetail: "Firmware v0.1.0 (LoRa RX + HTTP Ingestion Queue); Verified via Host Contract Test",
    keywords: ["gateway", "firmware", "reception", "ack", "heartbeatack", "ingestion", "wi-fi", "deviceregistry", "liveness", "esp32-s3"],
  },
  {
    id: "android",
    number: "06",
    title: "Android Application",
    slug: "/docs/android",
    category: "Client Applications",
    description: "Vessel mobile companion app, Kotlin MVVM architecture, Room outbox pattern, BLE BoatNode link, offline maps, and multilingual STT.",
    status: "IN PROGRESS",
    statusDetail: "Architecture & Protocols Defined; Full Android App in Development",
    keywords: ["android", "kotlin", "ble", "bluetooth", "sos", "room", "outbox", "offline maps", "speech-to-text", "voice"],
  },
  {
    id: "ai",
    number: "07",
    title: "AI & TinyML (WristNode)",
    slug: "/docs/ai",
    category: "Intelligence & Edge AI",
    description: "WristNode wearable safety detection, IMU 6-axis data preprocessing, windowing, SVM / CNN-TFLite pipeline, and edge deployment status.",
    status: "IN PROGRESS",
    statusDetail: "jalari-ai Repository Scaffolded; Model Research Active; Edge BoatNode Inference Planned",
    keywords: ["ai", "tinyml", "wristnode", "imu", "svm", "cnn", "tflite", "preprocessing", "windowing", "man-overboard"],
  },
  {
    id: "maritime-intelligence",
    number: "08",
    title: "Maritime Intelligence",
    slug: "/docs/maritime-intelligence",
    category: "Intelligence & Edge AI",
    description: "Planned maritime intelligence layers: geofencing, restricted border zones, ocean current drift prediction, and vessel risk scoring.",
    status: "PLANNED",
    statusDetail: "Specifications Formulated; Execution Post-Telemetry Density",
    keywords: ["geofencing", "drift", "prediction", "maritime intelligence", "risk", "zones", "international maritime boundary", "safety"],
  },
  {
    id: "backend",
    number: "09",
    title: "Backend & Database",
    slug: "/docs/backend",
    category: "Web Platform",
    description: "FastAPI service architecture, PostgreSQL + SQLAlchemy persistence, Alembic migrations, deduplicated Gateway ingestion handler, and REST APIs.",
    status: "IMPLEMENTED",
    statusDetail: "FastAPI REST API & Idempotent Ingestion Operational",
    keywords: ["backend", "fastapi", "postgresql", "sqlalchemy", "alembic", "rest", "ingestion", "deduplication", "pydantic"],
  },
  {
    id: "dashboard",
    number: "10",
    title: "Operations Dashboard",
    slug: "/docs/dashboard",
    category: "Web Platform",
    description: "Central shore station dashboard architecture, views breakdown (Boats, Map, Alerts, Telemetry, History, Gateway, System Status), and UX philosophy.",
    status: "IMPLEMENTED",
    statusDetail: "Next.js 15 UI with Neutral Unavailable State Handling Operational",
    keywords: ["dashboard", "frontend", "next.js", "leaflet", "map", "boats", "alerts", "telemetry", "history", "system status"],
  },
  {
    id: "protocols",
    number: "11",
    title: "Protocols & Interfaces",
    slug: "/docs/protocols",
    category: "Core Protocols",
    description: "Complete binary packet wire specifications, BLE GATT profiles, Gateway HTTP JSON payload schema, and Backend REST contracts.",
    status: "IMPLEMENTED",
    statusDetail: "Protocol v3 Binary Spec & HTTP Ingest Schema Formally Documented",
    keywords: ["protocols", "contracts", "binary", "frame", "ble gatt", "http", "json", "rest", "api", "interfaces"],
  },
  {
    id: "testing",
    number: "12",
    title: "Testing & Validation",
    slug: "/docs/testing",
    category: "Validation & Ops",
    description: "Honest verification status across firmware host contract tests, backend pytest suite, single-hop tests, and planned RF mesh stress tests.",
    status: "VALIDATED",
    statusDetail: "Software & Protocol Contracts Host-Validated; Hardware RF Trials Pending",
    keywords: ["testing", "validation", "contract test", "pytest", "unit tests", "packet loss", "hardware validation", "simulation"],
  },
  {
    id: "deployment",
    number: "13",
    title: "Deployment & Setup",
    slug: "/docs/deployment",
    category: "Validation & Ops",
    description: "Developer environment installation guide for PlatformIO firmware, Python backend with PostgreSQL, and Next.js frontend.",
    status: "IMPLEMENTED",
    statusDetail: "Environment Setup & Run Scripts Available for Local & Field Staging",
    keywords: ["deployment", "setup", "installation", "environment", "platformio", "docker", "python", "npm", "next.js"],
  },
  {
    id: "research",
    number: "14",
    title: "Research & Strategy",
    slug: "/docs/research",
    category: "Research & Architecture",
    description: "Research problem formulation, related academic work, novelty breakdown, experimental hypotheses, ablation study design, and publication strategy.",
    status: "IN PROGRESS",
    statusDetail: "Research Strategy & Evaluation Methodology Formulated",
    keywords: ["research", "academic", "paper", "novelty", "meshtastic", "ablation", "hypothesis", "pdr", "maritime mesh"],
  },
  {
    id: "troubleshooting",
    number: "15",
    title: "Troubleshooting",
    slug: "/docs/troubleshooting",
    category: "Validation & Ops",
    description: "Field and lab troubleshooting guide for firmware compilation, SPI wiring, serial logs, database connectivity, and packet loss.",
    status: "IMPLEMENTED",
    statusDetail: "Common Failure Modes & Diagnostic Procedures Documented",
    keywords: ["troubleshooting", "debug", "errors", "spi", "lora", "database", "baud", "platformio", "network"],
  },
  {
    id: "decisions",
    number: "16",
    title: "Architecture Decisions",
    slug: "/docs/decisions",
    category: "Research & Architecture",
    description: "Architecture Decision Records (ADRs) explaining key technical choices: Custom Binary vs Protobuf, LBT vs CAD/TDMA, Hop-by-Hop ACK, and BLE.",
    status: "IMPLEMENTED",
    statusDetail: "5 Core ADRs Documented with Rationale & Trade-offs",
    keywords: ["adr", "decisions", "architecture decisions", "binary protocol", "listen-before-talk", "hop-by-hop ack", "ble"],
  },
  {
    id: "changelog",
    number: "17",
    title: "Changelog & Roadmap",
    slug: "/docs/changelog",
    category: "Getting Started",
    description: "Project version history, progression through the 7 networking phases, and upcoming technical milestones.",
    status: "IMPLEMENTED",
    statusDetail: "Current Status: Phase 1 Done, Phase 2 in Refinement, Phase 3 Next",
    keywords: ["changelog", "roadmap", "version", "phases", "milestones", "history", "v0.1.0"],
  },
];

export const DOC_CATEGORIES: DocCategory[] = [
  {
    title: "Getting Started",
    items: DOC_SECTIONS.filter((s) => s.category === "Getting Started"),
  },
  {
    title: "System Architecture",
    items: DOC_SECTIONS.filter((s) => s.category === "System Architecture"),
  },
  {
    title: "Hardware & Firmware",
    items: DOC_SECTIONS.filter((s) => s.category === "Hardware & Firmware"),
  },
  {
    title: "Core Protocols",
    items: DOC_SECTIONS.filter((s) => s.category === "Core Protocols"),
  },
  {
    title: "Intelligence & Edge AI",
    items: DOC_SECTIONS.filter((s) => s.category === "Intelligence & Edge AI"),
  },
  {
    title: "Client & Web Platform",
    items: DOC_SECTIONS.filter(
      (s) => s.category === "Client Applications" || s.category === "Web Platform"
    ),
  },
  {
    title: "Validation & Operations",
    items: DOC_SECTIONS.filter((s) => s.category === "Validation & Ops"),
  },
  {
    title: "Research & Decisions",
    items: DOC_SECTIONS.filter((s) => s.category === "Research & Architecture"),
  },
];

export function getDocSectionBySlug(slug: string): DocSection | undefined {
  return DOC_SECTIONS.find((s) => s.slug === slug);
}

export function getDocPagination(currentSlug: string): {
  prev: DocSection | null;
  next: DocSection | null;
} {
  const index = DOC_SECTIONS.findIndex((s) => s.slug === currentSlug);
  if (index === -1) return { prev: null, next: null };
  return {
    prev: index > 0 ? DOC_SECTIONS[index - 1] : null,
    next: index < DOC_SECTIONS.length - 1 ? DOC_SECTIONS[index + 1] : null,
  };
}

import { DocsStatusBadge } from "@/components/docs/DocsStatusBadge";
import { DocsCodeBlock } from "@/components/docs/DocsCodeBlock";
import { DocsNavPagination } from "@/components/docs/DocsNavPagination";
import { getDocPagination } from "@/lib/docs-data";

export default function DeploymentDocPage() {
  const pagination = getDocPagination("/docs/deployment");

  return (
    <article>
      <header className="docs-page-header">
        <div className="docs-page-num-tag">SECTION 13</div>
        <h1 className="docs-page-title">Deployment & Setup</h1>
        <p className="docs-page-lead">
          Step-by-step developer guide for configuring, building, and launching the complete Jalari firmware, backend, database, and frontend web services.
        </p>
        <DocsStatusBadge
          status="IMPLEMENTED"
          detail="Development Toolchains & Build Pipelines Documented"
        />
      </header>

      <section className="docs-section">
        <h2 className="docs-h2">Prerequisites</h2>
        <ul className="docs-ul">
          <li className="docs-li"><strong className="docs-strong">Firmware:</strong> PlatformIO CLI or VS Code PlatformIO IDE Extension, C++17 compiler</li>
          <li className="docs-li"><strong className="docs-strong">Backend:</strong> Python 3.11+, PostgreSQL 15+ (or Docker engine)</li>
          <li className="docs-li"><strong className="docs-strong">Frontend:</strong> Node.js 20+ LTS, npm 10+</li>
        </ul>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">1. Backend & Database Setup</h2>
        <p className="docs-p">
          Set up the PostgreSQL database and launch the FastAPI ingestion and REST API server:
        </p>
        <DocsCodeBlock
          language="bash"
          filename="website/backend setup"
          code={`cd /Users/kireeti/Desktop/Projects/RESQ/website/backend

# Create and activate Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env

# Edit .env with your PostgreSQL database credentials:
# DATABASE_URL=postgresql://jalri_user:jalri_pass@localhost:5432/jalri_db

# Run Alembic database migrations
alembic upgrade head

# Start the FastAPI development server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`}
        />
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">2. Frontend & Operations Dashboard Setup</h2>
        <DocsCodeBlock
          language="bash"
          filename="website/frontend setup"
          code={`cd /Users/kireeti/Desktop/Projects/RESQ/website/frontend

# Install dependencies
npm install

# Start Next.js development server
npm run dev

# Open http://localhost:3000 in your browser`}
        />
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">3. Firmware Build & Flashing (BoatNode & Gateway)</h2>
        <DocsCodeBlock
          language="bash"
          filename="PlatformIO Firmware Commands"
          code={`# --- BoatNode Firmware ---
cd /Users/kireeti/Desktop/Projects/RESQ/jalari-node-firmware
pio run --target upload

# --- Gateway Firmware ---
cd /Users/kireeti/Desktop/Projects/RESQ/jalri-gateway-firmware
# Configure Wi-Fi and backend URL in include/BuildConfig.h
pio run --target upload`}
        />
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Environment Variables Reference</h2>
        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Variable Name</th>
                <th>Default / Example</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Backend</td>
                <td><code>DATABASE_URL</code></td>
                <td><code>postgresql://user:pass@localhost:5432/jalri</code></td>
                <td>PostgreSQL database connection string</td>
              </tr>
              <tr>
                <td>Backend</td>
                <td><code>LOG_LEVEL</code></td>
                <td><code>INFO</code></td>
                <td>Backend logging verbosity (DEBUG, INFO, WARNING)</td>
              </tr>
              <tr>
                <td>Frontend</td>
                <td><code>NEXT_PUBLIC_API_URL</code></td>
                <td><code>http://localhost:8000</code></td>
                <td>FastAPI backend endpoint base URL</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <DocsNavPagination prev={pagination.prev} next={pagination.next} />
    </article>
  );
}

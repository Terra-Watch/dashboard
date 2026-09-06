import { JalariLogo } from "./JalariLogo";

export function JalariLoading({ label = "Loading Jalari" }: { label?: string }) {
  return <main className="jalari-loading" aria-label={label} role="status">
    <div className="jalari-loading-mark" aria-hidden="true"><JalariLogo /></div>
    <p className="jalari-loading-name">JALARI</p>
    <p className="jalari-loading-label">{label}</p>
  </main>;
}

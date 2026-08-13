import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";

export function LiveMapWorkspace() {
  return (
    <Card className="live-map-workspace">
      <SectionHeader title="Live Map" />
      <div className="live-map-empty-state">
        <p className="live-map-empty-title">No vessel positions available</p>
        <p className="live-map-empty-message">Location data will appear here when connected.</p>
      </div>
    </Card>
  );
}


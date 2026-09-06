"use client";

import { useEffect, useState } from "react";
import { fetchMessages, OperationsMessage } from "../../lib/api";
import { Card } from "../ui/Card";
import { DataTable } from "../ui/DataTable";
import { SectionHeader } from "../ui/SectionHeader";

function messageStatus(status: string): string {
  return status.replaceAll("_", " ");
}

export function MessagesOverview() {
  const [messages, setMessages] = useState<OperationsMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadMessages() {
      try {
        const data = await fetchMessages();
        if (!mounted) return;
        setMessages(data);
        setError(null);
      } catch (reason) {
        if (!mounted) return;
        setError(reason instanceof Error ? reason.message : "Unable to load crew messages.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadMessages();
    const interval = setInterval(() => void loadMessages(), 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="history-page">
      <header className="history-header">
        <h1>Crew Messages</h1>
        <p>Messages sent from vessel crew through the Jalari communication channel.</p>
      </header>
      <section className="history-records" aria-label="Crew messages">
        <SectionHeader title={`Messages (${messages.length})`} />
        <Card className="boats-table-card">
          <DataTable>
            {loading ? (
              <div className="history-empty-state"><p className="history-empty-title">Loading crew messages...</p></div>
            ) : error ? (
              <div className="history-empty-state"><p className="history-empty-title">Messages unavailable</p><p className="history-empty-message">{error}</p></div>
            ) : messages.length === 0 ? (
              <div className="history-empty-state"><p className="history-empty-title">No crew messages</p><p className="history-empty-message">Messages sent by fishermen will appear here after the backend accepts them.</p></div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead><tr style={{ borderBottom: "2px solid #e2e8f0", color: "#475569", fontSize: "0.85rem", fontWeight: 600 }}>
                  <th style={{ padding: "0.75rem 1rem" }}>TIME</th><th style={{ padding: "0.75rem 1rem" }}>VESSEL</th><th style={{ padding: "0.75rem 1rem" }}>FROM</th><th style={{ padding: "0.75rem 1rem" }}>MESSAGE</th><th style={{ padding: "0.75rem 1rem" }}>STATUS</th>
                </tr></thead>
                <tbody>{messages.map((item) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9", fontSize: "0.85rem" }}>
                    <td style={{ padding: "0.6rem 1rem", color: "#334155", whiteSpace: "nowrap" }}>{new Date(item.createdAt).toLocaleString()}</td>
                    <td style={{ padding: "0.6rem 1rem", color: "#0284c7", fontWeight: 600 }}>{item.boatId}</td>
                    <td style={{ padding: "0.6rem 1rem", color: "#334155" }}>{item.sourceUserName}<br /><small>{item.sourceUserEmail}</small></td>
                    <td style={{ padding: "0.6rem 1rem", color: "#334155", maxWidth: 420, whiteSpace: "pre-wrap" }}>{item.text}</td>
                    <td style={{ padding: "0.6rem 1rem", color: "#475569", fontWeight: 600 }}>{messageStatus(item.status)}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </DataTable>
        </Card>
      </section>
    </div>
  );
}

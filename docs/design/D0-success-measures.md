# D0: Success measures (definitions; targets to be set with you)

No target numbers are proposed here. A target set without a baseline or an authority's agreement would be invented. Each measure below is defined so it can be measured from the audit trail and client events from day one, and compared with a baseline from the pilot.

| ID | Measure | Definition | Source | Why it matters |
|---|---|---|---|---|
| M1 | Report completion | Reports sent / reports started | client events | Is the flow usable under stress? |
| M2 | Time to report | Median and 90th percentile, first screen to "sent" | client events | Speed in an emergency |
| M3 | Offline success | Reports queued offline that reached the server without duplicates | idempotency key log | Weak connectivity is the stated condition |
| M4 | Duplicate rate | Reports merged as duplicates / reports received | incident clusters | Operator load |
| M5 | Time to first review | Report received to first human action | audit log | Responsiveness |
| M6 | Acknowledgement time | Assignment created to accepted or declined | assignment history | Silent non-response |
| M7 | Verification turnaround | Assigned to first observation submitted | verifications | Field loop speed |
| M8 | Closure quality | Share of closed incidents with a structured reason | incident close reason (new field) | Reviewability |
| M9 | False-alarm share | Incidents closed as "not a fire" / all closed | close reason | Trust in reports; spam signal |
| M10 | Citizen clarity | Survey: "I knew what happened to my report" | in-app question | Closure of the loop |
| M11 | Moderation latency | Community report to decision | moderation actions | Safety of Community |
| M12 | Accessibility defects | Open defects at WCAG 2.2 AA | automated plus manual audit | Inclusion |
| M13 | Reliability | Request error rate; time to restore | metrics | Availability when it matters |

**Guardrails**: no measure is used to rank or penalise individual Range Officers or operators; analytics must not store precise citizen locations; any survey is optional.
**Decision needed from you**: which measures matter most, and who sets the targets.

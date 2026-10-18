# D5 — Community: notices, discussion and chat, reasoned by role

Replaces D2 section 4. It starts from what a community space is *for* in a fire-prone region, and from what it can do wrong.

## 1. Purpose, and the harm to design against

**What it is for:** (1) neighbours sharing preparedness knowledge (water points, routes, safe practices); (2) mutual help; (3) getting official notices in one trusted place; (4) cutting rumours by showing what is official and what is not.

**What can go wrong, and what that forces**

| Risk | Consequence | Design response |
|---|---|---|
| People report a fire in a post and wait | Delay, nobody comes | Every composer says "Seeing a fire? Report it"; emergency words in a draft trigger a prompt with a Report button; posts never notify responders |
| Rumour or panic ("the whole ridge is burning") | Panic, bad decisions | Official notices pinned above everything; community posts labelled "not verified"; during an active notice for a region, chat is in slow mode |
| Unsafe advice ("burn a firebreak yourself") | Injury | Flag reason "Unsafe advice" jumps the moderation queue; staff can reply with a "Staff" badge |
| Doxxing homes, phone numbers, abuse | Harm | Phone numbers, links and coordinates are held for review; posts show area (district) only; harassment is a top flag reason |
| Spam and scams | Trust loss | Rate limits, new-member limits, held links |
| Moderators swamped | Harm persists | Queue ordered by severity, grouped by item, canned reasons, age shown, every action audited |
| Staff voice confused with neighbours | Mixed signals | Three separate surfaces with different rules (below) |
| People with poor networks or other languages left out | Exclusion | Offline reading, saved drafts, English / हिन्दी / ଓଡ଼ିଆ, language tag and filter |

## 2. Three surfaces, three rule sets

| | **Notices** | **Discussion** | **Chat** |
|---|---|---|---|
| Voice | Official only | Neighbours (staff may reply with a Staff badge) | Neighbours |
| Who writes | Control Room, approved by a second person | Signed-in citizens | Signed-in citizens |
| Shape | Pinned cards, newest first, with area, time, expiry | Topics with threaded replies | Regional rooms, short messages |
| Length | Up to 1,000 characters | Up to 2,000; replies up to 1,000 | Up to 500 |
| Lifetime | Until expiry or withdrawal, then archived | Kept; author may edit for 15 minutes and delete any time | Messages expire after a configured number of days |
| Moderation | Approval flow | Flags, hold-for-review, staff removal with reason | Slow mode, room freeze, removal with reason |

Why chat stays: nearby people want a quick place to ask "road open?". Why it is constrained: real-time chatter is where rumours grow, so rooms are regional, slow, short-lived and freezable.

## 3. By role

**Citizen (full participation)**
- Reads Notices first, then Discussion, with Chat one tab away.
- Posts a topic: type (Question, Local information, Thanks), area (district, from a list), language, text. "Local information" always carries "Not verified" and cannot contain phone numbers or links without review.
- Reacts with a single "Helpful" mark (no down-votes), replies, edits for 15 minutes, deletes anytime, flags others' content with a reason, mutes a person for themselves.
- Chat: joins the room of their district, sees the last 50 messages, new-message pill, no read receipts or presence, messages up to 500 characters, slow mode when the room asks for it.
- Choices in Account: notified of replies to my posts (default on) and official notices for my area (default on); nothing else.
- Offline: reads what was loaded; drafts are saved on the device and sent when the connection returns.
- States designed: loading skeleton, empty ("Be the first to ask"), error with retry, rate-limited ("wait N seconds"), held for review ("A moderator will look at this before it appears"), removed ("Removed by a moderator: reason"), offline.

**Control Room (official voice and moderation; lives under Notices)**
- **Notices tab:** compose a notice (title, text, area drawn on the map or chosen from districts, start and expiry, severity), save draft, send for approval; a second authorised person approves or returns it with a reason; approved notices appear to citizens of that area and as the advisory layer on the map; withdraw or let expire. Every revision is kept.
- **Moderation tab:** one queue of flagged and held items ordered by severity then age; each shows the content, who flagged and why, the author's history; actions: approve held item, remove (reason required), dismiss flag, warn the author, mute the author for a period, freeze or slow a chat room. Every action is in the audit log and the author sees the reason.
- Staff replies in Discussion show a **Staff** badge; formal statements go through Notices, not replies.
- Needs: queue counts and age on the Notices tab badge; keyboard actions; canned reasons editable by administrators.

**Range Officer (no participation)**
- Officers do not use Community: field safety and focus come first, and operational talk belongs in assignments, not public chat.
- They see approved Notices read-only in Me, so they know what the public was told.

**Administrator**
- Everything a Control Room lead does, plus creating moderator canned reasons, room settings (slow mode seconds, retention days) and viewing sanction history.

## 4. Data and rules that follow

- **Posts:** `status` (published, held, removed), `topic`, `language`, `region` (district), author, timestamps, edit and removal fields (already added), `helpful_count` from a reactions table (one per person per post).
- **Chat:** `resq_community_rooms` (region, slow-mode seconds, frozen, retention days) and messages with a room; messages expire by room retention (a purge job that only runs when retention is configured).
- **Sanctions:** `resq_community_sanctions` (user, kind warn/mute, reason, until, by) checked on every write.
- **Content checks (server side):** phone numbers, links and coordinates put a post or message into `held`; emergency phrases do not block but return a hint the client shows.
- **Privacy:** only a display name is shown (first name and initial by default); email never shown; account deletion removes the person's posts and replaces them with "deleted by author".
- **Rates:** per person per time window, stricter for new accounts; all limits configurable, none silent.
- **Audit:** every moderation and sanction action.

## 5. What gets built (and tested)

1. Backend: statuses and held flow, content checks, reactions, rooms and slow mode, sanctions, retention purge, richer moderation queue with severity ordering — tests on real PostgreSQL for each rule, including that officers cannot post and citizens cannot read the queue.
2. Citizen Community screen in three tabs (Notices, Discussion, Chat) following section 3, phone-first, with all states.
3. Control Room Notices screen with Approval and Moderation tabs.
4. Notices read-only list in the Range Officer's Me tab.
5. Browser tests for every state listed, in three languages for the headings.

# Owner Portal Architecture & Evolution Plan

## Executive Overview
The **Owner Portal** is the executive command center of **WhatsApp Commerce OS** (Aura Luxe Boutique). While the **Customer Storefront** serves shoppers and the **Staff Dashboard** handles daily fulfillment and frontline support, the **Owner Portal** empowers the business proprietor to govern revenue, supervise team members, monitor anti-misuse audit trails, and control the AI sales agent.

This plan details the **necessary upgrades, architectural changes, and new modules** required to elevate the existing dashboard into an enterprise-grade Owner Portal.

---

## 1. Core Architectural Pillars of the Owner Portal

```
┌────────────────────────────────────────────────────────────────────────┐
│                        OWNER PORTAL PILLARS                            │
├─────────────────────┬──────────────────────────────────────────────────┤
│ 1. Team Governance  │ RBAC staff directory, roles, credential resets,  │
│    & Permissions    │ active session revocation, and performance metrics│
├─────────────────────┼──────────────────────────────────────────────────┤
│ 2. Security & Audit │ Tamper-proof visual ledger of all staff actions, │
│    Control Center   │ before/after diffs, and mandatory justifications │
├─────────────────────┼──────────────────────────────────────────────────┤
│ 3. Financials &     │ Gateway settlements (Razorpay/PhonePe), refund   │
│    Settlements      │ approvals (>₹5k), and staff discount caps        │
├─────────────────────┼──────────────────────────────────────────────────┤
│ 4. AI Sales Agent   │ Meera's persona & prompt versioning, sales       │
│    Governance       │ aggressiveness slider, testing sandbox           │
├─────────────────────┼──────────────────────────────────────────────────┤
│ 5. Store Policies & │ Visual brand customizer (colors, fonts, logos),  │
│    Storefront Theme │ order cancellation and address modification locks│
├─────────────────────┼──────────────────────────────────────────────────┤
│ 6. Executive Funnel │ WhatsApp chat-to-order conversion metrics, drop- │
│    Intelligence     │ off analysis, customer LTV cohorts               │
└─────────────────────┴──────────────────────────────────────────────────┘
```

---

## 2. Gap Analysis: Current Dashboard vs. Required Owner Portal

| Module / Area | Current State | Required State in Owner Portal | Priority |
| :--- | :--- | :--- | :--- |
| **User & Staff Management** | None. Single owner login shared by all. | Multi-user RBAC directory. Invite staff, assign roles (`STORE_MANAGER`, `FULFILLMENT_LEAD`, `SUPPORT_CONCIERGE`), toggle access, track activity. | **CRITICAL (P0)** |
| **Anti-Misuse Audit Ledger** | DB table exists (`AuditLog`), but zero UI. | Visual Audit Ledger (`/audit`) with filters by staff, entity, and date. Git-style diff inspection and justification verification. | **CRITICAL (P0)** |
| **Financial Controls & Refunds** | List of raw transactions. | High-value refund approval queue, gateway balance settlements, and staff price discount caps. | **HIGH (P1)** |
| **AI Prompt & Persona Control** | Raw JSON text area in settings. | Visual Persona Studio: Meera's tone, sales rules, max allowable discounts, and prompt version history rollback. | **HIGH (P1)** |
| **Store Branding & Policies** | Hardcoded JSON defaults in DB. | Live Theme Customizer (Palette, Serif/Sans typography) + cutoff policy controls (address edit / cancel timeouts). | **HIGH (P1)** |
| **WhatsApp Conversion Funnel** | Basic orders & GMV charts. | End-to-end conversational funnel: Chats ➔ Catalog Views ➔ Carts ➔ Checkout ➔ Paid conversions. | **MEDIUM (P2)** |

---

## 3. New Modules Specification

### 3.1 Module: Team Governance & RBAC (`/team`)
- **Staff Directory Table**:
  - Staff Name, Avatar, Contact (Email & Phone).
  - Assigned Role badge (`SUPER_ADMIN`, `STORE_MANAGER`, `FULFILLMENT_LEAD`, `SUPPORT_CONCIERGE`).
  - Status indicator (`ACTIVE`, `SUSPENDED`).
  - Last Active timestamp & active session count.
- **Actions**:
  - **Invite New Staff**: Form requesting Full Name, Email, Temporary Password, and Role selection.
  - **Role Reassignment**: Upgrade or downgrade permissions instantly.
  - **Revoke / Suspend Access**: 1-click lock that invalidates all active JWT tokens for that staff member immediately.
  - **Staff Activity Summary**: View recent orders handled or notes added by this staff member.

### 3.2 Module: Tamper-Proof Audit Control Center (`/audit`)
- **Primary Search & Filter Toolbar**:
  - Filter by **Staff Member** (dropdown of all staff).
  - Filter by **Entity** (`Order`, `Customer`, `Address`, `Product`, `Policy`).
  - Filter by **Action Type** (`STATUS_CHANGE`, `ADDRESS_UPDATE`, `ORDER_CANCELLED`, `REFUND_INITIATED`, `STOCK_OVERRIDE`).
  - Search by **Order Number** or **Customer Phone**.
- **Audit Timeline Stream**:
  - Interactive cards showing timestamp, staff avatar + name, action pill, and target entity.
  - **Mandatory Reason Card**: Highlights the staff member's justification (e.g. *"Customer requested delivery change via WhatsApp voice call"*).
  - **Diff Visualizer**:
    ```diff
    - Line 1: Shivaganga Nilaya, Janatha Colony
    + Line 1: Prestige Tech Park, Building 3, Floor 2
    ```
- **Flagged Suspicious Activity Alerts**:
  - Automatic alerts for anomaly patterns: e.g. address change within 30 minutes of dispatch, or multiple refunds issued by the same staff member.

### 3.3 Module: Financial Governance & Refund Authorizations (`/financials`)
- **Payout & Settlement Tracking**:
  - Razorpay & PhonePe current available balance vs. in-flight settlements.
  - Commission and gateway transaction fee breakdown.
- **Refund & Cancellation Approval Queue**:
  - If a staff member marks an order for cancellation or refund exceeding **₹5,000**, it enters **"Awaiting Owner Approval"** state.
  - Owner can click **Approve** or **Reject** with an owner note.
- **Discount & Price Guardrails**:
  - Owner sets maximum manual discount percentage that staff can offer (e.g. max 10% off for VIP concierges).

### 3.4 Module: AI Persona & Conversational Tuning Studio (`/ai-agent`)
- **Persona Configurator for Meera**:
  - Brand Voice toggle: `Regal & Formal` | `Warm Luxury Concierge` | `Brisk & Professional`.
  - Allowed Languages: English, Hindi, Kannada, Tamil, Telugu (bilingual support).
  - Bargaining / Discount policy:
    - *Can Meera offer discounts?* (Yes/No, with maximum discount cap, e.g. 5% on orders > ₹15,000).
- **Prompt Versioning & Instant Rollback**:
  - List of past prompt versions with author, date, and performance rating.
  - 1-click **Rollback** to any previous version if conversion dips.
- **Live Conversation Inspection**:
  - Filter WhatsApp conversations by satisfaction rating, AI handoff triggers, or failed intents.

### 3.5 Module: Store Branding & Shopping Policies (`/settings/store`)
- **Visual Storefront Theme Editor**:
  - Primary Color picker (default `#0C0C0C`).
  - Accent Color picker (default `#C5A880` Champagne Gold).
  - Font Style selector (`Classic Luxury Serif` vs `Contemporary Sans`).
  - Boutique Tagline and Header Subtitle editor.
- **Self-Service Customer Cutoff Rules**:
  - *Address Modification Cutoff*: Stop allowing customers to change addresses once order reaches `SHIPPED` or `PROCESSING`.
  - *Order Cancellation Cutoff*: Allow customer cancellation only until `PROCESSING`.
  - *Inventory Reservation TTL*: Default 15 minutes hold time during checkout before restocking.

---

## 4. UI/UX Design & Layout Changes for Owner Portal

### 4.1 Navigation Hierarchy & Role Switching
The Owner navigation bar in [Sidebar.tsx](file:///Users/jeevanriship/AI%20WhatsApp%20Sales%20Agent/apps/dashboard/src/components/Sidebar.tsx) will be organized into clean operational sections:

```
⚡ COMMERCE OS — AURA LUXE BOUTIQUE
[👑 Owner Portal] Jeevan Rishi P

EXECUTIVE
  📊 Executive Overview   (/)
  📈 Funnel Analytics    (/analytics)
  💳 Financials & Payouts (/financials)

GOVERNANCE & SECURITY
  👥 Team & Staff RBAC    (/team)
  🛡️ Audit Ledger (Logs)  (/audit)
  ⚡ AI Agent Tuning      (/ai-agent)

OPERATIONS OVERSIGHT
  🛍️ Orders Pipeline      (/orders)
  👥 Customers 360        (/customers)
  📦 Inventory & Catalog  (/inventory)
  💬 WhatsApp Inbound     (/conversations)

CONFIGURATION
  ⚙️ Store Theme & Policy (/settings/store)
  🔌 Integrations & Keys  (/settings/integrations)
```

### 4.2 Top Header Badge & Quick Staff View Switcher
- The header displays an **Owner Mode Indicator** (`[👑 OWNER / SUPER ADMIN]`).
- A **"View as Role" Simulator** (Owner can preview the dashboard as `STORE_MANAGER` or `FULFILLMENT_LEAD` to verify what permissions their staff see).

---

## 5. Technical Implementation Steps

### Step 1: Database Schema Additions
- `StaffUser`: Store team accounts, hashed passwords, roles (`OWNER`, `STORE_MANAGER`, `FULFILLMENT_LEAD`, `SUPPORT_CONCIERGE`).
- `DataRevisionLog`: Append-only snapshots of all order/customer modifications.
- `OrderInternalNote`: Threaded staff comments.
- `Tenant` policy fields: Store refund approval thresholds and discount caps.

### Step 2: Auth & Session Upgrade
- Update `apps/dashboard/src/lib/auth.ts`:
  - Include `staffId`, `role`, and `permissions` in `SessionPayload`.
  - Route protection middleware to ensure `/team`, `/audit`, and `/financials` are accessible **only to the Owner / Super Admin**.

### Step 3: Staff Management & Audit Views
- Build `/team` page (list, invite modal, role change).
- Build `/audit` page (real-time stream, diff inspector, search by order/phone).

### Step 4: AI Persona & Store Theme Studio
- Build `/ai-agent` visual configuration panel.
- Build `/settings/store` theme & operational policies editor.

### Step 5: Verification & End-to-End Testing
- Verify Owner can create a staff user.
- Log in as staff user, make a change to an order.
- Log back in as Owner and observe the change, timestamp, and diff in the `/audit` ledger.


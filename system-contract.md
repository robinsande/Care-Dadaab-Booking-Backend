# SYSTEM_CONTRACT.md

# CARE Accommodation Management System (CAMS)

Version: 2.0

---

# Purpose

This document is the single source of truth for CAMS.

Both the frontend and backend MUST follow this specification.

Guest-submitted booking requests are reviewed by staff before becoming bookings.

---

# System Overview

CAMS is an accommodation management platform for CARE staff and guests.

Guests can submit booking requests through the public guest portal. Accommodation Officers review requests, assign available rooms, and create confirmed bookings.

The system supports multiple CARE accommodation facilities (camps).

Camp hierarchy: **Camp → Block → Room**

Current camps: CARE Dadaab, CARE Hagadera, CARE Ifo.

---

# Technology

## Backend

- Node.js, Express.js, MongoDB, Mongoose
- JWT authentication, bcrypt, Nodemailer
- REST API at `/api/v1/`

## Architecture

```
routes → controllers → services → models
```

Business logic belongs in services. Controllers stay thin.

---

# User Roles

## Accommodation Officer

- Login
- Create, edit, cancel bookings
- Check in / check out guests
- View bookings and invoices

## Super Admin

Everything the Accommodation Officer can do, plus:

- Manage users, camps, blocks, rooms, rates
- Manage payment settings and system settings
- View reports

---

# Booking Workflow

1. A guest submits a booking request with their stay type and requested dates.
2. The guest receives a request acknowledgement, and active Accommodation Officers/Super Admins and the support address receive an action-needed email for every guest-portal request.
3. An officer reviews the request, assigns an available room for the requested camp and dates, and completes the booking.
4. The booking is created with status **Booked**. The guest receives a confirmation email and, for billable bookings, a PDF invoice attachment. Active Accommodation Officers/Super Admins and the support address also receive a new-booking email.
5. The officer checks the guest in → **Checked In**, then checks the guest out → **Checked Out**.

Guest requests are separate from bookings and do not reserve rooms until staff complete them. Booking statuses remain Booked, Checked In, Checked Out, or Cancelled.

---

# Booking Statuses

Only these statuses exist:

- Booked
- Checked In
- Checked Out
- Cancelled

---

# Booking Reference

Format: `CARE-YYYYMMDD-000123` (globally unique, never changes, no camp code).

---

# Guest Information

Guests have no accounts. Fields captured on each booking:

First Name, Last Name, Email, Phone, Organisation, Gender, Contract Type, Reason for Visit, Arrival Date, Departure Date, Driver Pickup, Departure Country, Remarks.

---

# Camps, Blocks, Rooms

- Each booking belongs to exactly one camp.
- Blocks belong to a camp; block names may repeat across camps.
- Rooms belong to a block; uniqueness: Camp + Block + Room Number.
- Room statuses: Available, Maintenance only.
- Occupancy is NEVER stored; it is calculated from active bookings (Booked, Checked In).

---

# Stay Types

Short Stay (up to 21 nights) and Long Stay (22 nights or longer). Selected manually by the officer at booking creation (never auto-determined).

Long Stay bookings are billed by whole months, including stays longer than 12 months.

---

# Rates

Per camp: one Short Stay rate per night and one Long Stay rate per month (configurable by Super Admin only).

Seed defaults: CARE Dadaab Long Stay is KES 6,500 per month; CARE Hagadera and CARE Ifo are KES 4,500 per month. Short Stay remains billed nightly. CARE Staff bookings are waived and do not display rates.

An MOU may be attached to a Long Stay booking for reference but does not set the accommodation rate.

Rate history is supported. Each booking stores the applied rate at creation time.

Future rate changes must not affect historical bookings or invoices.

---

# Booking Editing

**Booked:** all fields editable (guest, dates, camp, block, room, stay type, remarks).

**Checked In:** guest information and remarks only; location, dates, stay type locked.

**Checked Out / Cancelled:** not editable.

---

# Cancellation

Officers cancel directly. Cancellation reason is required. Guest receives cancellation email. Audit log records who, when, and why.

Cancellable from Booked or Checked In.

---

# Invoices

Generated and emailed automatically on check-out, including when an invoice already exists. The guest and the officer who created the booking receive the PDF.

Recipients: guest and the officer who created the booking.

Invoice number format: `INV-YYYY-000001` (sequential, unique).

Contains: invoice number, booking reference, guest details, camp, block, room, dates, nights, stay type, applied rate, total amount, payment instructions.

Payment instructions are global settings (M-Pesa paybill, bank details). Payments are NOT processed by the system.

Invoice payment status: Unpaid, Paid, Waived (for outstanding invoice tracking).

---

# Reports (Super Admin only)

bookings-by-camp, bookings-by-date, stay-type-breakdown, room-utilization, occupancy, revenue, outstanding-invoices, arrivals, departures.

Filters: date range, camp, stay type. Export: JSON, CSV (Excel-compatible).

---

# Dashboard (all staff)

Today's arrivals, today's departures, occupied rooms, available rooms, outstanding invoices, recent bookings, bookings by camp.

---

# Email Notifications

Booking Created, Booking Updated, Booking Cancelled, Invoice Generated, Check-in, Check-out, and guest-request acknowledgement/review alerts. Email delivery requires configured SMTP credentials or `BREVO_API_KEY`.

---

# API Standards

All endpoints require authentication except `POST /auth/login`.

```json
{ "success": true, "message": "", "data": {} }
{ "success": false, "message": "", "errors": [] }
```

---

# Collections

users, camps, blocks, rooms, bookings, rates, invoices, audit_logs, settings

Future: payments, notifications

---

# Development Rules

- Apply the configured camp rate; seed defaults only initialize camp rates
- Never delete bookings
- Soft-deactivate camps, blocks, rooms where appropriate
- Validate every request on the backend
- Prevent overlapping room bookings
- If unclear, stop and ask

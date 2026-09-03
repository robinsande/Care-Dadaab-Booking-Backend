# SYSTEM_CONTRACT.md

# CARE Accommodation Management System (CAMS)

Version: 2.0

---

# Purpose

This document is the single source of truth for CAMS.

Both the frontend and backend MUST follow this specification.

Version 1 (guest booking request workflow) is retired. Any conflicting v1 requirement must be ignored.

---

# System Overview

CAMS is an internal accommodation management platform for CARE staff.

Guests do NOT access the application. Guests do NOT create bookings.

Accommodation Officers create and manage all bookings.

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

Accommodation Officer logs in → creates booking → selects camp, block, room, stay type → booking created immediately → guest receives confirmation email → check in → check out → invoice generated and emailed.

There is NO approval workflow. There are NO public booking endpoints.

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

Short Stay and Long Stay. Selected manually by the officer at booking creation (never auto-determined).

---

# Rates

Per camp: one Short Stay rate and one Long Stay rate (configurable by Super Admin only).

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

Generated automatically on check-out.

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

Booking Created, Booking Updated, Booking Cancelled, Invoice Generated.

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

- Never hardcode rates or invent business rules
- Never delete bookings
- Soft-deactivate camps, blocks, rooms where appropriate
- Validate every request on the backend
- Prevent overlapping room bookings
- If unclear, stop and ask

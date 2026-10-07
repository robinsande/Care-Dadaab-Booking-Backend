# CARE Accommodation Management System (CAMS) — Backend

Backend REST API for managing CARE accommodation across multiple camps. Built with Node.js, Express, and MongoDB (Mongoose).

> Implementation of [`system-contract.md`](./system-contract.md) (CAMS v2).

---

## Tech Stack

- **Node.js** + **Express.js**
- **MongoDB** + **Mongoose**
- **JWT** + **bcryptjs**
- **Nodemailer**, **express-validator**, **helmet**, **cors**

---

## Architecture

```
src/
  config/       Environment & database
  models/       Camp, Block, Room, Booking, Rate, Invoice, User, Settings, AuditLog
  services/     Business logic
  controllers/  Thin HTTP adapters
  routes/       Endpoint definitions
  middleware/   Auth, roles, validation, errors
  validators/   express-validator rules
  utils/        ApiError, ApiResponse, constants, dates
  scripts/      Seed script
```

---

## Getting Started

```bash
npm install
cp .env.example .env   # set MONGODB_URI and JWT_SECRET
npm run seed           # imports 65 rooms from room-inventory.json (sourced from Rooms no..xlsx)
npm run dev
```

Base URL: `http://localhost:5000/api/v1`

Default seed logins:

- Super Admin: `admin@care.org` / `ChangeMe123!`
- Officer: `officer@care.org` / `ChangeMe123!`

---

## Roles

| Role | Capabilities |
|------|--------------|
| **Accommodation Officer** | Create/edit/cancel bookings, check-in/out, view invoices |
| **Super Admin** | Everything above + manage camps, blocks, rooms, rates, users, settings, reports |

All endpoints require JWT except `POST /auth/login`.

---

## API Overview

### Auth
- `POST /auth/login` — public
- `GET /auth/me`, `PATCH /auth/change-password`

### Camps & Blocks
- `GET/POST/PUT/DELETE /camps`
- `GET/POST /camps/:campId/blocks`
- `GET/PUT/DELETE /camps/:campId/blocks/:blockId`

### Rooms
- `GET /rooms`, `GET /rooms/available`, `GET/POST/PUT/DELETE /rooms/:id`

### Rates (per camp)
- `GET /camps/:campId/rates`
- `GET /camps/:campId/rates/history` (Super Admin)
- `POST /camps/:campId/rates` (Super Admin)

### Bookings
- `GET/POST /bookings`
- `GET/PUT /bookings/:id`
- `POST /bookings/:id/cancel`
- `POST /bookings/:id/check-in`
- `POST /bookings/:id/check-out` (generates invoice)

### Invoices
- `GET /invoices`, `GET /invoices/:id`
- `PATCH /invoices/:id/payment-status`
- Marking an invoice Paid creates a numbered receipt, stores its PDF and payment/invoice snapshot for audit, and emails the receipt PDF to the guest.
- Print and Download use the same server-generated PDF; paid invoices return the saved receipt PDF.

### Dashboard
- `GET /dashboard`

### Reports (Super Admin)
- `GET /reports/:type?from=&to=&campId=&stayType=&format=json|csv|xlsx|pdf`

### Users & Settings (Super Admin)
- `GET/POST/PUT/DELETE /users`
- `GET/PUT /settings`

### Guest booking requests
- Guests submit a request at `POST /guest/public-requests` or through the guest portal.
- The guest receives an acknowledgement email for each request. Active Accommodation Officers and Super Admins, plus the support email, receive a separate action-needed message for every guest-portal request.
- Staff complete a request by assigning a room available for the requested camp and dates. The resulting booking confirmation and billable PDF invoice are emailed to the guest only.
- Every completed booking also sends a booking alert to active Accommodation Officers and Super Admins, plus the support email. On check-out, the invoice PDF is sent to the guest and the officer who created the booking, even if the invoice was generated earlier.
- Configure SMTP (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`) or `BREVO_API_KEY` to deliver request and booking emails. Delivery failures are logged and can be recovered from the booking screen with **Resend Emails**.

---

## Booking Statuses

`Booked` → `Checked In` → `Checked Out` | `Cancelled`

---

## Response Envelope

```json
{ "success": true, "message": "...", "data": {} }
{ "success": false, "message": "...", "errors": [] }
```

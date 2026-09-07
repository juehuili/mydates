# Daybridge

A reality-aware daily planner that connects Google Tasks with Google Calendar.

## Features

- Sign in with Google using Google Identity Services
- Read, create, and complete Google Tasks
- Read today's Google Calendar events
- Turn tasks into Google Calendar focus blocks
- Automatically plan open tasks around calendar events
- Responsive desktop and mobile interface

## Local development

1. Copy `.env.example` to `.env.local`.
2. Add a Google OAuth 2.0 Web Client ID to `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
3. Add `http://localhost:3000` to the client's Authorized JavaScript origins.
4. Enable Google Calendar API and Google Tasks API for the Google Cloud project.
5. Run `pnpm install` and `pnpm dev`.

## Deploy to Vercel

Deploy the repository as a Next.js project, then add these Vercel environment variables:

- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- `NEXT_PUBLIC_APP_URL`

Add the production Vercel origin, such as `https://daybridge.vercel.app`, to the OAuth client's Authorized JavaScript origins before testing Google sign-in.

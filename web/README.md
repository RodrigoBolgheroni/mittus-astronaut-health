This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Ceres (AI recommendation)

Insights and Plan consume `POST /api/check-ins/{id}/actions/evaluate` from the NestJS backend. It generates and persists the recommendation and every task, using canonical session-owned data. Task titles and progress survive reloads and tabs; there is no browser generation pipeline or sessionStorage title bridge.

Configure `CERES_URL` only on the backend. Ceres remains a separately deployed service; unavailable generation produces a clearly labeled persisted basic summary without hiding an independently available Eres forecast. `NEXT_PUBLIC_API_URL` selects the backend origin; send credentials and keep the session cookie visible to both API surfaces.

Mission registration requires a signed session and JSON. Browser Origin must match trusted `WEB_ORIGIN` (or the Next request origin when unconfigured); nonbrowser requests without Origin still require the signed session. Public registrations cannot change the global demo mission; that selection is seed/manual-admin-only.

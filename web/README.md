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

The "Make sense of the changes" card and the AI task titles come from the Ceres service (`../ceres`). The browser never calls Ceres (it has no authentication); it calls the Next.js route `POST /api/recommendations`, which strips the payload to the seven contract fields (no `description`, no session id) and forwards it to Ceres.

| Variable | Use |
| --- | --- |
| `CERES_URL` | Server-only base URL of Ceres, e.g. `http://localhost:8000`. Unset or unreachable: the Insights screen shows the basic summary and the check-in is unaffected. |

Ceres takes 6–45 s per call, so the result is cached per tab by check-in revision and forecast (`src/lib/ceres/recommendation-cache.ts`). Once the backend persists the Ceres tasks (`title` on `check_in_actions`), the Plan screen prefers that title.

# hotelsync-api-gateway

Internal API gateway for HotelSync. It is deployed behind the Next.js BFF and is
not a public entrypoint for end users.

- `GET /health` — public liveness check.
- `/<service>/*` — proxy to the matching service; every proxied request requires
  `x-gateway-secret`.

Route table and env keys live in `src/routes.ts` and `src/config.ts`. Copy
`.env.example` to `.env` for local runs.

```bash
npm ci
npm run lint
npm test
npm run build
npm start
```

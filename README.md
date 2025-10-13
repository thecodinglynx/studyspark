# StudySpark

A modern flashcard study companion built with Next.js 14, Prisma, Tailwind CSS, and NextAuth.

## Getting started

```powershell
npm install
npm run prisma:migrate
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) after the dev server starts.

## Exposing the dev server on your local network

1. Ensure your computer and target device (for example, an Android phone) are on the same Wi‑Fi network.
2. Set the public URL so NextAuth sessions work off localhost:

   ```powershell
   $env:NEXTAUTH_URL="http://<your-lan-ip>:3000"
   ```

   Replace `<your-lan-ip>` with the IPv4 address returned by `ipconfig` (for example, `192.168.1.42`).

3. Start the server in LAN mode:

   ```powershell
   npm run dev:lan
   ```

4. On your phone, open `http://<your-lan-ip>:3000`. The site should load and allow authentication with the LAN URL that you set.

> Tip: If you need remote access outside your network, wrap the dev server with a tunneling tool such as [ngrok](https://ngrok.com/) or the [Vercel CLI preview proxy](https://vercel.com/docs/cli/tunnel).

## Mobile optimization highlights

- Responsive typography and spacing for the landing page and study views.
- Flip cards adapt to smaller screens with dynamic height, padding, and word wrapping.
- Study statistics, control buttons, and recent-session lists collapse gracefully on phones.

Use your browser's device toolbar (Chrome DevTools `Ctrl+Shift+M`) to preview different breakpoints.

## Useful scripts

| Command                   | Description                                              |
| ------------------------- | -------------------------------------------------------- |
| `npm run dev`             | Start the dev server on localhost.                       |
| `npm run dev:lan`         | Start the dev server bound to `0.0.0.0` for LAN testing. |
| `npm run build`           | Create a production build.                               |
| `npm run start`           | Run the production build.                                |
| `npm run lint`            | Run ESLint.                                              |
| `npm run prisma:migrate`  | Apply Prisma migrations locally.                         |
| `npm run prisma:generate` | Regenerate the Prisma client.                            |
| `npm run prisma:deploy`   | Apply migrations in production.                          |

## Environment variables

Copy `.env.example` to `.env` and provide values for:

- `DATABASE_URL` (and optionally `NEON_DATABASE_URL` for clarity)
- `DIRECT_URL` (and optionally `NEON_DIRECT_URL`)
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`

For LAN access, keep `NEXTAUTH_URL` aligned with the hostname you're using (e.g., `http://192.168.1.42:3000`).

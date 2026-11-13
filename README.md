# StudySpark

A modern flashcard study companion built with Next.js 16, Prisma, Tailwind CSS, and NextAuth.

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
| `npm run typecheck`       | Type-check the project with TypeScript.                  |
| `npm test`                | Run the full test suite once.                            |
| `npm run test:watch`      | Re-run tests as files change.                            |
| `npm run prisma:migrate`  | Apply Prisma migrations locally.                         |
| `npm run prisma:generate` | Regenerate the Prisma client.                            |
| `npm run prisma:deploy`   | Apply migrations in production.                          |

## Admin and invite codes

An admin can give new users access to chosen subjects at signup:

1. Make an existing account an admin (see below), then log out and back in. An **Admin** link appears in the navigation.
2. On the Admin page, tick one or more subjects (every subject from every user is listed), choose Viewer or Editor access, optionally set a maximum number of signups, and click **Generate code**. Leave the custom code blank to get a random 8-character code, or type your own (4 to 32 letters and numbers, such as `karateisfun`).
3. Give the code to the new user. They enter it in the optional **Invite code** field when signing up and immediately have access to those subjects, shown as shared subjects on their dashboard.

Codes are case-insensitive and stored in capitals; a custom code that is already taken is refused.

Click **Edit** on an existing code to add or remove its subjects, change its access level, or change its signup limit. The code itself can never be changed, because it may already have been handed out. Edits only affect people who sign up afterwards: anyone who already used the code keeps exactly the access they were given. A wrong, revoked or used-up code stops the signup and no account is created. Revoking a code stops further signups with it; people who already used it keep their access.

Admins are made from the command line, because there is deliberately no way to become one from the website. The script talks to whichever database `DATABASE_URL` points at, so to promote an account on the live site run it with the production `DATABASE_URL`:

```powershell
npm run admin:grant -- <username>
npm run admin:revoke -- <username>
```

The role is checked against the database on every admin request, so revoking it takes effect immediately.

## Testing

```powershell
npm test
```

The suite is built on [Vitest](https://vitest.dev/) and has two parts:

- **Server tests** (`tests/api`, `tests/pages`, `tests/lib`) call the API route handlers and server-rendered pages directly against a real PostgreSQL database. Only the login session, cache revalidation and navigation are faked.
- **Component tests** (`tests/components`) render client components in a simulated browser with `fetch`, the router and next-auth mocked.

The server tests need PostgreSQL running. They never touch your development data: they use a separate database named after the one in `DATABASE_URL` with a `_test` suffix (for example `studyspark_test`), create it and apply migrations automatically, and empty its tables before every test. Set `TEST_DATABASE_URL` to use a different database; it must be on localhost and its name must end in `_test`.

To run one part or one file:

```powershell
npx vitest run --project ui
npx vitest run --project server tests/api/sessions.test.ts
```

Pushing to `main` deploys to production, so run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` first.

## Environment variables

Copy `.env.example` to `.env` and provide values for:

- `DATABASE_URL` (and optionally `NEON_DATABASE_URL` for clarity)
- `DIRECT_URL` (and optionally `NEON_DIRECT_URL`)
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`

For LAN access, keep `NEXTAUTH_URL` aligned with the hostname you're using (e.g., `http://192.168.1.42:3000`).

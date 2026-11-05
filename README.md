# STI Research Hub

ResearchHub supports SQLite for local development and MongoDB Atlas with Vercel Functions for deployment. Both modes use the same authentication, authorization, account, class, profile, and shared-research routes.

## Run locally

1. Install Node.js 24 or later.
2. Open a terminal in this folder.
3. If you are using the local SQLite database, create the first administrator. The password is masked while typing:

   ```sh
   npm.cmd run create-admin
   ```

   Choose a password with at least 12 characters. This is a one-time setup for a new database; there is no default administrator password and no public Admin registration. To create an Admin in Atlas instead, configure `MONGODB_URI` in `.env` first; the same command will use Atlas.
4. Start the server. With `MONGODB_URI` set in `.env`, the app uses MongoDB; otherwise it uses the local SQLite database:

   ```sh
   npm.cmd start
   ```
5. Open the local URL shown by the server (by default `http://127.0.0.1:3000`).

Use the Node.js server URL for the site, sign-in, and profile pages. Opening the HTML files through VS Code Live Server (usually port 5500) bypasses the authentication routes and can show “Page not found” for `/profile`.

The server binds to loopback by default. `PORT`, `HOST`, and `DB_PATH` can be set in the environment. SQLite data is written to `data/research-hub.sqlite`. To develop against Atlas locally, create a private Vercel Blob store connected to Development and use `vercel env pull` to populate the local environment file.

## Accounts and roles

- Public registration creates **Student** accounts only.
- Admins can create accounts, assign the **Admin**, **Teacher**, or **Student** role, reset another user's password, and remove accounts.
- Admins create classes, assign teachers, and enroll students.
- Teachers can view and update records only in classes assigned to them.
- Students can view only their own class records.
- Each user can open their profile by clicking their name in the lower-left account area, then update their display name, email, phone number, and bio. Username and role remain read-only, and profile information is returned only to that signed-in user.
- All existing Discover, Library, and About pages require an authenticated account. Role-specific dashboard pages and API endpoints enforce authorization on the server.
- A user cannot change or remove their own account through the Admin user-management controls. Password resets revoke the target account's active sessions.

Passwords are stored as salted scrypt hashes, never as plaintext. Sessions use random opaque cookies whose hashes are stored in the database, with `HttpOnly`, `SameSite=Strict`, session expiry, CSRF tokens, login throttling, and security response headers. Production cookies require HTTPS. The Vercel handler trusts Vercel's forwarded protocol; for other reverse proxies, set `TRUST_PROXY=true` only when the server is actually behind that trusted proxy.

The existing **My Library** upload controls continue to use per-account browser storage; those files are not uploaded to the server or shared between devices. The separate **Shared research** page supports server-backed academic submissions: all signed-in roles can submit PDF, DOC, DOCX, or TXT files up to 25 MB; submissions remain private to the submitter and Admin/Teacher reviewers until approved. Approved work is visible to signed-in users, and the submitter can see review feedback. SQLite mode stores uploads outside the public web root in `data/shared-research/`; MongoDB/Vercel mode uploads directly to a private Vercel Blob store and serves downloads only after server-side permission checks. This workflow does not modify personal-library records.

To add one clearly labeled, synthetic approved record for testing the shared repository and Research Library search, run:

```sh
npm.cmd run seed-demo-research
```

The command is idempotent and adds no duplicate if the demo record already exists. The sample contains no real research, participants, or findings.

The research assistant can send your question and up to four relevant document excerpts to Groq to generate an answer. Avoid sending confidential or sensitive material. PDF and DOCX uploads in **My Library** currently contribute their saved metadata, not extracted file contents.

## Enable Groq AI

1. Create an API key in the [Groq Console](https://console.groq.com/keys). Keep it private; do not paste it into source code or commit it.
2. Copy `.env.example` to `.env` and add your key:

   ```dotenv
   GROQ_API_KEY=gsk_your_key_here
   GROQ_MODEL=openai/gpt-oss-120b
   ```

3. Restart the server with `npm.cmd start` (or `npm start` in a Unix-like shell). The server reads `.env` at startup; never use a frontend variable for the API key.
4. Open the Research Hub and try the AI assistant button. Without a configured key, the assistant will explain how to enable it.

The browser sends chat requests only to the authenticated Research Hub server. The server calls Groq using the secret key, validates request sizes, and limits each account to 12 requests per minute. The assistant is instructed to help only with using the Research Hub website; it cannot change website data or perform actions for users. Change `GROQ_MODEL` in `.env` to a model available to your Groq account.

## Deploy on Vercel with MongoDB Atlas

The Vercel entry point is `api/index.js`. It uses Atlas database `researchhub` and private Vercel Blob storage; Vercel's rewrite sends page, asset, and API requests through the authenticated handler so protected HTML files are not exposed as static downloads. The `public` output directory intentionally contains no site pages: publishing the repository root as static output can expose the API source instead of invoking the function.

1. Upload the contents of the project ZIP to the root of your GitHub repository. In Vercel, import that repository and leave **Root Directory** set to `./` (the repository root, where `package.json` lives). If you place the project inside a subfolder instead, set Root Directory to that folder.
2. In Vercel **Storage**, connect a **private** Blob store to this project. Keep its read/write token private. The store must include the Production and Preview environments (and Development if you develop locally).
3. In Vercel **Settings → Environment Variables**, set `MONGODB_URI` to the Atlas connection string for your dedicated database user. The app selects the `researchhub` database. Add `GROQ_API_KEY` only if you want the AI assistant enabled. Vercel Blob supplies `BLOB_READ_WRITE_TOKEN` when the store is connected.
4. In Atlas, allow network connections from Vercel and grant the dedicated database user access to the `researchhub` database. Vercel's outbound IPs may be dynamic; use static egress if available, or if Atlas requires `0.0.0.0/0`, protect access with a unique strong password and least-privilege database user. Never commit connection strings or tokens to GitHub.
5. **Optional: migrate local SQLite data only when the target `researchhub` database is brand new and empty.** Copy the Atlas URI and Blob token privately into `.env`, then run a dry run:

   ```sh
   npm.cmd run migrate-to-atlas
   ```

   Review the counts and confirm the target is empty before the one-time import:

   ```sh
   npm.cmd run migrate-to-atlas -- --apply
   ```

The importer refuses to write into non-empty collections, copies real shared uploads to private Vercel Blob, skips the specifically labeled synthetic demo, and leaves the local SQLite database untouched. Active login sessions are not migrated; users sign in again after cutover. In the current local database, the shared-research record is only the synthetic demo, so no research file will be imported. **If `researchhub` already contains an account or other data, do not run the import or delete existing data to make it pass. Skip this optional migration and use the existing Atlas database.** Do not share the URI or token in chat.

6. In **Settings → Build and Deployment**, use **Other**, set **Build Command** to `npm run build`, and set **Output Directory** to `public` (never `.`). Then deploy the project. Node.js 24 is selected through `package.json`. If the Atlas database has no Admin account, create one from an interactive terminal with `npm.cmd run create-admin` after setting `MONGODB_URI` in `.env`; the command refuses to add another Admin when one already exists.

## Test

Run the database-backed authentication and role-authorization integration tests:

```sh
npm.cmd test
```

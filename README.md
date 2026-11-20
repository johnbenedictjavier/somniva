# Somniva | The Mystery

Somniva is a private, installable PWA backed by Supabase. The dream collection is accessible only after the owner password is verified by the Supabase Edge Function. The browser never receives a Supabase service key and never reads the database directly.

## Private Access

The owner password is stored only as the Supabase Edge Function secret:

```text
SOMNIVA_PASSWORD=<owner-password>
SOMNIVA_TOKEN_SECRET=<random-long-secret>
```

There is no Supabase Auth login and no anonymous sign-in. The Edge Function issues a short-lived session token after the password is verified. Stories, awards, votes, winner selections, and images are protected by private RLS/storage policies.

## Supabase Migration

The current project already contains the seeded dream collection. For a fresh or updated project:

```powershell
supabase link --project-ref nirtjqjcqaxlrskuvpjy
supabase db push --linked --include-all
```

The migration makes the existing tables private, adds `image_prompt`, and changes votes to one owner score per story and award.

Set the Edge Function secrets without committing them:

```powershell
supabase secrets set --project-ref nirtjqjcqaxlrskuvpjy `
    SOMNIVA_PASSWORD='<owner-password>' `
    SOMNIVA_TOKEN_SECRET='generate-a-random-32-byte-secret'
```

Deploy the password gateway:

```powershell
supabase functions deploy somniva-api --project-ref nirtjqjcqaxlrskuvpjy --no-verify-jwt
```

The function uses Supabase's server-side `SUPABASE_SERVICE_ROLE_KEY` automatically. Never place that key in GitHub, `config.js`, or Vercel.

## Image Workflow

1. Open Add dream after unlocking Somniva.
2. Enter the title, date, and paragraphs.
3. Choose whether the dream opens a new page or joins an existing page. The page number and link are generated automatically.
4. Create the dream without an image.
5. From the dream's story card, choose **Generate** to create and copy the fixed Somniva prompt.
6. Use **Upload photo** beside the story to add or replace its private cover image later.
7. The copied prompt and uploaded image are stored in private Supabase records/storage.

The generator always uses the same cinematic surreal dream-journal style: indigo, violet, midnight blue, moonlight, symbolic atmosphere, painterly realism, softly blurred unrecognizable faces, and no text or watermarks.

## Frontend Configuration

`config.js` contains only the public Edge Function URL. No Vercel environment variable is required for this static frontend.

The local `img` folder is used as the migration source but is ignored by Git so private dream artwork is not published in the public repository. The uploaded copies remain in private Supabase Storage.

## GitHub

After authenticating GitHub, push the dedicated app repository:

```powershell
git push -u origin main
```

The repository is `https://github.com/johnbenedictjavier/somniva`.

## Vercel

Create the Vercel site yourself by importing the GitHub repository. Use the **Other** framework preset, no build command, and `.` as the output directory. Do not add the Supabase service-role key to Vercel.

The site must use HTTPS for the service worker and PWA installation.

## PWA Installation

- Android/Chrome: use the install prompt or browser menu.
- Desktop Chrome/Edge: use the install icon in the address bar.
- iPhone/iPad: use Safari **Share > Add to Home Screen**.

## Local Preview

Use a local server instead of opening the HTML file directly:

```powershell
npx --yes serve .
```

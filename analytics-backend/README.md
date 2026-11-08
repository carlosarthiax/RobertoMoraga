# Roberto Moraga — first-party analytics backend

This stack is intentionally separate from the public static-site deployment.

## Architecture

- `api`: accepts only `POST`/preflight requests to `/v1/events` through the existing Traefik network. It does not expose analytics queries or documentation.
- `dashboard`: listens on the VPS Tailscale address only (`100.97.161.103:5007` by default) and uses HTTP Basic authentication as a second layer.
- `db`: PostgreSQL on an internal Docker network only; no published database port.
- Events are allow-listed and normalized. The service never stores request IP addresses, full referrer URLs, query strings, form values, or arbitrary event payloads.

## Deploy on the VPS

1. Clone this repository on the VPS at a dedicated path and enter `analytics-backend/`:

   ```sh
   git clone --branch analytics-backend --single-branch https://github.com/carlosarthiax/RobertoMoraga.git /opt/roberto-analytics-src
   cd /opt/roberto-analytics-src/analytics-backend
   ```

2. Create secrets locally on the VPS (do not commit `.env`):

   ```sh
   cp .env.example .env
   openssl rand -hex 32
   ```

   Generate two different values, set `POSTGRES_PASSWORD` and `DASHBOARD_PASSWORD`, and set `DATABASE_URL` to use exactly the same PostgreSQL password. Keep `.env` readable only by root (`chmod 600 .env`). Confirm `DASHBOARD_BIND_IP` matches `tailscale ip -4` on this VPS.

3. Validate before starting anything:

   ```sh
   docker compose config --quiet
   ```

4. Start the new stack only:

   ```sh
   docker compose up -d --build
   ```

   This creates a new PostgreSQL volume and new containers. It does not recreate or restart Coolify, Traefik, or any existing app.

5. Verify the API certificate and private dashboard:

   ```sh
   curl -i https://data.robertomoraga.com/v1/events
   curl -I http://100.97.161.103:5007/
   docker compose ps
   ```

   The API endpoint intentionally returns `405 Method Not Allowed` to GET; only POST is accepted. The dashboard should request its own credentials and be reachable only while connected to the tailnet.

## Data and privacy

- Consent must be granted for analytics before the browser sends events.
- Visitor and session IDs are random UUIDs, not fingerprints.
- Page paths have query strings and fragments stripped. Referrers are reduced to hostnames.
- Only event names and explicitly defined metadata are stored; no form values or message bodies.
- Raw IP addresses are not persisted. Uvicorn access logs are disabled.
- Default retention is 395 days; change `RETENTION_DAYS` in the private `.env` to adjust it.
- Back up the `analytics_db` Docker volume using a database dump; do not rely on the volume alone.

## Important

This initial backend does not yet send events from the public website. The website integration and cookie-policy update are a separate, controlled change after deployment and verification.

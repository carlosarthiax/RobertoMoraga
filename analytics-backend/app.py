import asyncio
import html
import os
import re
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlsplit
from uuid import UUID

from fastapi import FastAPI, HTTPException, Request, Response, Depends
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel, ConfigDict, Field, field_validator
from psycopg_pool import ConnectionPool
from psycopg.types.json import Jsonb
from starlette.middleware.cors import CORSMiddleware

DATABASE_URL = os.environ["DATABASE_URL"]
ROLE = os.getenv("APP_ROLE", "api")
RETENTION_DAYS = max(30, min(int(os.getenv("RETENTION_DAYS", "395")), 3650))
ALLOWED_ORIGINS = [x.strip() for x in os.getenv(
    "ALLOWED_ORIGINS",
    "https://www.roberto-moraga.com,https://roberto-moraga.com"
).split(",") if x.strip()]
pool: ConnectionPool | None = None
cleanup_task: asyncio.Task | None = None
security = HTTPBasic()

EVENT_NAMES = {
    "roberto_moraga_page_view", "roberto_moraga_section_view",
    "roberto_moraga_scroll_depth", "roberto_moraga_click",
    "roberto_moraga_whatsapp_click", "whatsapp_click",
    "roberto_moraga_hero_cta_click", "roberto_moraga_navigation_intent",
    "roberto_moraga_language_switch", "roberto_moraga_route_intent",
    "roberto_moraga_project_open", "roberto_moraga_form_start",
    "roberto_moraga_form_submit",
}
ALLOWED_ATTRIBUTES = {
    "scroll_percent", "click_type", "click_text", "click_id", "click_class",
    "click_section", "click_role", "click_target", "click_path",
    "whatsapp_location", "cta_type", "cta_location", "nav_area",
    "target_language", "route_key", "project_title", "project_path",
    "open_source", "form_id", "form_name", "form_method", "form_section",
    "form_field", "submitter_text", "submitter_type", "section_name",
    "section_id", "section_label", "section_class", "page_body_id",
    "page_template",
}
TEXT_LIMITS = {
    "click_type": 40, "click_text": 120, "click_id": 100,
    "click_class": 160, "click_section": 100, "click_role": 40,
    "click_target": 40, "click_path": 300, "whatsapp_location": 40,
    "cta_type": 40, "cta_location": 100, "nav_area": 30,
    "target_language": 8, "route_key": 100, "project_title": 120,
    "project_path": 300, "open_source": 30, "form_id": 100,
    "form_name": 100, "form_method": 10, "form_section": 100,
    "form_field": 100, "submitter_text": 120, "submitter_type": 40,
    "section_name": 100, "section_id": 100, "section_label": 120,
    "section_class": 160, "page_body_id": 100, "page_template": 100,
}
RATE_WINDOW_SECONDS = 60
RATE_MAX_EVENTS = 120
visitor_rate: dict[str, tuple[float, int]] = {}


class AnalyticsEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    visitor_id: UUID
    session_id: UUID
    event_name: str = Field(min_length=3, max_length=80)
    occurred_at: datetime | None = None
    page_path: str = Field(default="/", min_length=1, max_length=500)
    page_title: str = Field(default="", max_length=180)
    page_language: str = Field(default="es", max_length=8)
    page_type: str = Field(default="", max_length=80)
    referrer_url: str = Field(default="", max_length=1000)
    device_type: str = Field(default="unknown", max_length=20)
    browser_family: str = Field(default="unknown", max_length=40)
    os_family: str = Field(default="unknown", max_length=40)
    viewport_width: int | None = Field(default=None, ge=0, le=10000)
    viewport_height: int | None = Field(default=None, ge=0, le=10000)
    attributes: dict[str, Any] = Field(default_factory=dict)

    @field_validator("event_name")
    @classmethod
    def validate_event_name(cls, value: str) -> str:
        if value not in EVENT_NAMES:
            raise ValueError("Unsupported event")
        return value

    @field_validator("page_path")
    @classmethod
    def clean_path(cls, value: str) -> str:
        path = value.split("?", 1)[0].split("#", 1)[0]
        if not path.startswith("/") or len(path) > 300:
            raise ValueError("Invalid page path")
        return path

    @field_validator("page_language")
    @classmethod
    def clean_language(cls, value: str) -> str:
        return "en" if value.lower().startswith("en") else "es"


class EventBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    events: list[AnalyticsEvent] = Field(min_length=1, max_length=20)


def normalized_attributes(raw: dict[str, Any]) -> dict[str, Any]:
    clean: dict[str, Any] = {}
    for key, value in raw.items():
        if key not in ALLOWED_ATTRIBUTES:
            continue
        if key == "scroll_percent":
            try:
                clean[key] = max(0, min(100, int(value)))
            except (TypeError, ValueError):
                continue
        elif key in TEXT_LIMITS and isinstance(value, (str, int, float, bool)):
            clean[key] = str(value).strip()[:TEXT_LIMITS[key]]
    # Never persist raw hrefs, form values, arbitrary objects, or unknown keys.
    for key in ("click_path", "project_path"):
        if key in clean:
            candidate = str(clean[key]).split("?", 1)[0].split("#", 1)[0]
            clean[key] = candidate if candidate.startswith("/") else ""
    return clean


def referrer_host(value: str) -> str:
    try:
        host = urlsplit(value).hostname or ""
        return host.lower()[:180]
    except ValueError:
        return ""


def ensure_schema() -> None:
    assert pool is not None
    with pool.connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS analytics_events (
                id BIGSERIAL PRIMARY KEY,
                visitor_id UUID NOT NULL,
                session_id UUID NOT NULL,
                event_name VARCHAR(80) NOT NULL,
                occurred_at TIMESTAMPTZ NOT NULL,
                received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                page_path VARCHAR(300) NOT NULL,
                page_title VARCHAR(180) NOT NULL DEFAULT '',
                page_language VARCHAR(8) NOT NULL DEFAULT 'es',
                page_type VARCHAR(80) NOT NULL DEFAULT '',
                referrer_host VARCHAR(180) NOT NULL DEFAULT '',
                device_type VARCHAR(20) NOT NULL DEFAULT 'unknown',
                browser_family VARCHAR(40) NOT NULL DEFAULT 'unknown',
                os_family VARCHAR(40) NOT NULL DEFAULT 'unknown',
                viewport_width INTEGER,
                viewport_height INTEGER,
                attributes JSONB NOT NULL DEFAULT '{}'::jsonb
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_analytics_events_time ON analytics_events (occurred_at DESC)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_analytics_events_visitor ON analytics_events (visitor_id, occurred_at DESC)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON analytics_events (event_name, occurred_at DESC)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_analytics_events_path ON analytics_events (page_path)")
        conn.commit()


def delete_expired() -> None:
    assert pool is not None
    with pool.connection() as conn:
        conn.execute(
            "DELETE FROM analytics_events WHERE occurred_at < now() - (%s * interval '1 day')",
            (RETENTION_DAYS,)
        )
        conn.commit()


async def retention_loop() -> None:
    while True:
        await asyncio.sleep(24 * 60 * 60)
        try:
            await asyncio.to_thread(delete_expired)
        except Exception:
            # Do not leak database details or event data to public responses.
            pass


@asynccontextmanager
async def lifespan(_: FastAPI):
    global pool, cleanup_task
    pool = ConnectionPool(conninfo=DATABASE_URL, min_size=1, max_size=5, open=True)
    for attempt in range(30):
        try:
            await asyncio.to_thread(ensure_schema)
            break
        except Exception:
            if attempt == 29:
                raise
            await asyncio.sleep(2)
    await asyncio.to_thread(delete_expired)
    cleanup_task = asyncio.create_task(retention_loop())
    yield
    if cleanup_task:
        cleanup_task.cancel()
    if pool:
        pool.close()


app = FastAPI(
    title="Roberto Moraga Analytics",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["Content-Type"],
    max_age=600,
)


def check_role(expected: str) -> None:
    if ROLE != expected:
        raise HTTPException(status_code=404, detail="Not found")


def dashboard_auth(credentials: HTTPBasicCredentials = Depends(security)) -> str:
    expected_user = os.getenv("DASHBOARD_USER", "")
    expected_password = os.getenv("DASHBOARD_PASSWORD", "")
    user_ok = secrets.compare_digest(credentials.username.encode(), expected_user.encode())
    password_ok = secrets.compare_digest(credentials.password.encode(), expected_password.encode())
    if not (expected_user and expected_password and user_ok and password_ok):
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


@app.get("/healthz")
def healthz():
    return {"status": "ok", "role": ROLE}


@app.post("/v1/events", status_code=202)
def ingest(batch: EventBatch, request: Request):
    check_role("api")
    origin = request.headers.get("origin", "")
    if origin not in ALLOWED_ORIGINS:
        raise HTTPException(status_code=403, detail="Origin not allowed")

    # Rate limiting is keyed by the random first-party visitor ID. No IP address is read or stored.
    now = asyncio.get_event_loop_policy().get_event_loop().time()
    accepted: list[tuple[Any, ...]] = []
    for event in batch.events:
        key = str(event.visitor_id)
        start, count = visitor_rate.get(key, (now, 0))
        if now - start >= RATE_WINDOW_SECONDS:
            start, count = now, 0
        if count >= RATE_MAX_EVENTS:
            raise HTTPException(status_code=429, detail="Rate limit exceeded")
        visitor_rate[key] = (start, count + 1)

        occurred = event.occurred_at or datetime.now(timezone.utc)
        if occurred.tzinfo is None:
            occurred = occurred.replace(tzinfo=timezone.utc)
        # Ignore client timestamps outside a reasonable clock-skew window.
        current = datetime.now(timezone.utc)
        if abs((current - occurred).total_seconds()) > 7 * 24 * 3600:
            occurred = current

        accepted.append((
            event.visitor_id, event.session_id, event.event_name, occurred,
            event.page_path, event.page_title.strip(), event.page_language,
            event.page_type.strip()[:80], referrer_host(event.referrer_url),
            event.device_type if event.device_type in {"mobile", "tablet", "desktop", "unknown"} else "unknown",
            event.browser_family.strip()[:40], event.os_family.strip()[:40],
            event.viewport_width, event.viewport_height, Jsonb(normalized_attributes(event.attributes))
        ))

    assert pool is not None
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.executemany("""
                INSERT INTO analytics_events (
                    visitor_id, session_id, event_name, occurred_at, page_path,
                    page_title, page_language, page_type, referrer_host,
                    device_type, browser_family, os_family, viewport_width,
                    viewport_height, attributes
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, accepted)
        conn.commit()
    return {"accepted": len(accepted)}


def dashboard_html() -> str:
    assert pool is not None
    with pool.connection() as conn:
        total = conn.execute("SELECT count(*) FROM analytics_events").fetchone()[0]
        visitors = conn.execute(
            "SELECT count(DISTINCT visitor_id) FROM analytics_events WHERE occurred_at >= now() - interval '30 days'"
        ).fetchone()[0]
        sessions = conn.execute(
            "SELECT count(DISTINCT session_id) FROM analytics_events WHERE occurred_at >= now() - interval '30 days'"
        ).fetchone()[0]
        views = conn.execute(
            "SELECT count(*) FROM analytics_events WHERE event_name='roberto_moraga_page_view' AND occurred_at >= now() - interval '30 days'"
        ).fetchone()[0]
        pages = conn.execute("""
            SELECT page_path, count(*) AS views
            FROM analytics_events
            WHERE event_name='roberto_moraga_page_view' AND occurred_at >= now() - interval '30 days'
            GROUP BY page_path ORDER BY views DESC LIMIT 12
        """).fetchall()
        events = conn.execute("""
            SELECT event_name, count(*) AS total
            FROM analytics_events
            WHERE occurred_at >= now() - interval '30 days'
            GROUP BY event_name ORDER BY total DESC LIMIT 15
        """).fetchall()
        devices = conn.execute("""
            SELECT device_type, count(*) AS total
            FROM analytics_events
            WHERE occurred_at >= now() - interval '30 days'
            GROUP BY device_type ORDER BY total DESC
        """).fetchall()

    def rows(items, first_label):
        if not items:
            return f'<tr><td colspan="2">Sin datos todavía</td></tr>'
        return "".join(
            f"<tr><td>{html.escape(str(row[0]))}</td><td>{int(row[1]):,}</td></tr>"
            for row in items
        )

    return f"""<!doctype html>
<html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Analítica · Roberto Moraga</title>
<style>
:root{{color-scheme:dark}}*{{box-sizing:border-box}}body{{margin:0;background:#111a17;color:#eef2ee;font:15px/1.5 system-ui,sans-serif}}
main{{max-width:1100px;margin:auto;padding:32px 20px}}h1{{font-size:28px;margin:0}}p{{color:#aebbb3}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin:24px 0}}
.card,section{{background:#1c2923;border:1px solid #34483d;border-radius:12px;padding:18px}}.metric{{font-size:32px;font-weight:700}}.tables{{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}}
h2{{font-size:17px;margin:0 0 12px}}table{{width:100%;border-collapse:collapse}}td{{padding:9px 4px;border-bottom:1px solid #34483d;overflow-wrap:anywhere}}td:last-child{{text-align:right;font-variant-numeric:tabular-nums}}small{{color:#aebbb3}}
</style><main>
<h1>Analítica · Roberto Moraga</h1><p>Resumen de actividad · últimos 30 días. Total histórico de eventos: {total:,}.</p>
<div class="grid">
<div class="card"><small>Visitantes únicos</small><div class="metric">{visitors:,}</div></div>
<div class="card"><small>Sesiones</small><div class="metric">{sessions:,}</div></div>
<div class="card"><small>Vistas de página</small><div class="metric">{views:,}</div></div>
<div class="card"><small>Eventos almacenados</small><div class="metric">{total:,}</div></div>
</div>
<div class="tables">
<section><h2>Páginas más visitadas</h2><table>{rows(pages, "Página")}</table></section>
<section><h2>Eventos</h2><table>{rows(events, "Evento")}</table></section>
<section><h2>Dispositivos</h2><table>{rows(devices, "Dispositivo")}</table></section>
</div><p><small>Retención configurada: {RETENTION_DAYS} días. No se almacenan IP completas ni contenido de formularios.</small></p>
</main></html>"""


@app.get("/", response_class=HTMLResponse)
def dashboard(_: str = Depends(dashboard_auth)):
    check_role("dashboard")
    return dashboard_html()


@app.get("/v1/events")
def reject_get():
    raise HTTPException(status_code=405, detail="POST required")

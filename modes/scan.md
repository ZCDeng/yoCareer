# Modo: scan — Scanner China-first (señales de empleo)

Escanea señales de empleo desde páginas públicas y entradas manuales, filtra por relevancia de título, deduplica y agrega nuevos ítems al pipeline.

## Principio operativo

`scan.mjs` funciona como pipeline de providers:
- `company_page`: extrae enlaces de carreras públicas con Playwright (principal).
- `manual_signal_import`: lee señales fragmentadas desde `data/signals.ndjson`.
- `reach_signal_search`: búsqueda opcional de señales públicas (si existe bridge configurado).
- `manual_only`: plataformas restringidas, solo revisión/importación manual.

## Configuración (portals.yml)

Campos clave:
- `title_filter`: positive / negative / seniority_boost.
- `tracked_companies`: empresas con `careers_url` público.
- `search_queries`: búsquedas amplias (normalizadas como `reach_signal_search`).
- `signal_imports`: inbox local de señales (`data/signals.ndjson`).
- `signal_searches`: búsquedas de señales comunitarias/sociales.
- `restricted_platforms`: plataformas con acceso restringido (modo manual).

### Recomendado (externo): Aditly MCP

- yoCareer no embebe Aditly; se conecta de forma opcional por bridge.
- Si `YOCAREER_ADITLY_PREFER=true`, los bridges intentan primero:
  - `${YOCAREER_ADITLY_BASE_URL}/mcp/`
  - health: `${YOCAREER_ADITLY_BASE_URL}/health`
- Si Aditly no está disponible, el scanner hace fallback al bridge local sin romper el flujo.

## Flujo de ejecución

1. Leer `portals.yml` y construir grupos por provider.
2. Cargar dedup sources:
   - `data/scan-history.tsv`
   - `data/pipeline.md`
   - `data/applications.md`
3. Ejecutar providers por lotes:
   - `ats_api` (si existe en config)
   - `manual_only`
   - `manual_signal_import`
   - `reach_signal_search`
   - `company_page` (con Playwright)
   - `reach_read_url` (si está configurado)
4. Normalizar señales a esquema común.
5. Aplicar filtros:
   - match con `title_filter`
   - dedup por URL y company+role
6. Enrutado:
   - señales confiables -> `pipeline.md`
   - señales débiles o comunitarias -> `data/signal-review.md`
7. Persistir historial en `data/scan-history.tsv`.
8. Imprimir resumen final (found/filtered/duplicates/held/new/errors).

## Reglas de clasificación

- `community_post` entra por defecto a revisión manual.
- Si `recommended_action` es `save_for_manual_review`, va a review.
- Si `confidence` cae por debajo del umbral por tipo, va a review.
- Señales con riesgo (outsourcing/spam/evidencia insuficiente) se retienen para revisión.

## Salidas

- `data/pipeline.md`: nuevas señales listas para evaluación.
- `data/scan-history.tsv`: registro de señales vistas y estatus.
- `data/signal-review.md`: cola de revisión manual para señales inciertas.

## Cumplimiento y límites

Para plataformas domésticas restringidas (BOSS, Zhaopin, Liepin, 51job, Lagou, Maimai, Xiaohongshu, WeChat OA, Weibo):
- No automatizar login/CAPTCHA.
- No simular interacción de cuenta.
- No hacer mensajería masiva ni envío automático.
- Usar señales públicas + importación manual como camino por defecto.

## Operación recomendada

```bash
npm run scan
npm run scan -- --dry-run
npm run scan -- --company Tencent
```

Después del scan:
- revisar `data/signal-review.md` cuando haya señales retenidas,
- promover/descartar con `npm run signals -- list|draft|promote|discard`,
- ejecutar `/yoCareer pipeline` para evaluar nuevas entradas del pipeline.

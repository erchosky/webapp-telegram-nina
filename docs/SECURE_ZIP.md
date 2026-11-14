# ZIP limpio seguro

Para generar un paquete sin secretos ni artefactos locales:

```bash
npm run zip:clean
```

El script crea `_exports/webapptelegram-nina-clean.zip` y ejecuta
`scripts/verify-clean-zip.sh` automáticamente.

La verificación falla si el ZIP contiene `.env.local`, `.vercel/`,
`node_modules/`, `.next/`, `*.tsbuildinfo`, `.DS_Store`, `__MACOSX/`, `._*`,
duplicados `* 2.*` / `* 2/` o patrones comunes de tokens reales.

Para verificar manualmente un ZIP ya creado:

```bash
npm run zip:verify -- _exports/webapptelegram-nina-clean.zip
```

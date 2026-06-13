# Changelog — Tesseract 2.0

## [2026-06-03] — Logo, Auth Removal & Bugfixes

### Changed
- **Logo reemplazado**: Se reemplazó el inline SVG (rectángulo + checkmark) por `Tesseract_Logo.svg` externo en dashboard, login, admin y panel flotante.
- **Animación del logo**: El spin del dashboard cambió de 2D (`rotate`) a 3D horizontal (`perspective + rotateY`).
- **Tamaño del logo**: Dashboard 280px → 340px. Login 200px → 280px.
- **Admin layout**: Eliminado `<h1>TESSERACT ADMIN</h1>`, el logo se movió dentro de `.header-info`.
- **Eliminado `<h1>TESSERACT</h1>`** de dashboard, login, popup y admin.
- **Icono de extensión**: Reemplazados `icon16/48/128.png` con `descarga.png` redimensionado.

### Fixed
- **btnClose no funcionaba**: El CSS tenía `display:block !important` que sobreescribía `style.display='none'`. Se cambió a `toggleMin()` que funciona correctamente.
- **Dist desactualizado**: Los archivos `dist/` aún tenían los inline SVGs viejos. Se sincronizaron con `src/`.
- **Reminder.js**: Se eliminó todo el sistema de recordatorios (alarma audible + notificación visual "TASA DE RESPUESTA EN RIESGO"). Reemplazado con stubs vacíos.
- **talky-sweep.js**: Removidas llamadas a `onOperatorResponded()`.

### Removed
- **Autenticación del bot panel**: Eliminado completamente:
  - Login screen HTML (formulario email/clave)
  - Funciones `doLogin()` y `doLogout()`
  - `tryRefreshToken()`
  - CSS de autenticación (`.auth-section`, `.auth-form`, etc.)
  - `tess_auth` de `saveAllStates()` / `loadAllStates()`
  - `isAuthenticated` ahora es `true` por defecto
  - `currentUser` tiene valor default `'agente@tesseract.com'`
  - `startPeriodicSync()` se inicia automáticamente al cargar el panel

### Project
- Carpeta renombrada a `Tesseract 2.0` y movida a la raíz de Downloads.

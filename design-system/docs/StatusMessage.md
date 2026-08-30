---
category: Estado
---

# StatusMessage

Estado de una sección que todavía no tiene contenido: cargando, error o vacío.

Va **dentro** del `Panel` que reemplaza, no encima. La sección conserva su título y su
marco mientras el contenido no está, así la pantalla no salta cuando los datos llegan.

`kind="error"` pinta el borde y el texto de rojo `--red` y agrega `role="alert"`, así que
un lector de pantalla lo anuncia solo. Los otros dos tonos quedan atenuados a propósito:
son estados de espera, no problemas.

```jsx
<Panel title="Discos">
  <StatusMessage kind="loading">Cargando discos…</StatusMessage>
</Panel>

<StatusMessage kind="error" onRetry={recargar}>
  No se pudo conectar con la API.
</StatusMessage>

<StatusMessage kind="empty">Este agente todavía no tiene discos cargados.</StatusMessage>
```

`onRetry` agrega un botón chico alineado a la derecha. Pasalo solo cuando reintentar
realmente pueda cambiar el resultado — en un estado vacío casi nunca corresponde.

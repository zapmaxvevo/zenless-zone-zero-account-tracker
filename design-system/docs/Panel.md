---
category: Contenedores
---

# Panel

Contenedor de sección: fondo `--bg-panel`, borde sutil y esquinas de 10px. Es la superficie
sobre la que se apoya casi todo el contenido de la app.

Una pantalla se arma **apilando Panels** dentro de una columna de ancho máximo 1080px con
`gap: 0.75rem`. No anides Panels: si necesitás una subdivisión visual, usá `EntityCard` o
una lista.

El `title` se renderiza en mayúsculas y en amarillo `--accent`; es el único lugar donde ese
color se usa para texto largo. Las `actions` van alineadas a la derecha del título.

```jsx
<Panel title="Roster" actions={<LinkButton size="sm" href="/agents/new">Agregar</LinkButton>}>
  <EntityGrid>{/* … */}</EntityGrid>
</Panel>
```

Sin `title` ni `actions` el encabezado no se emite: queda una tarjeta limpia.

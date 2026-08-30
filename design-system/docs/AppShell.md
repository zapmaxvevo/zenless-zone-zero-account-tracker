---
category: Base
---

# AppShell

Raíz de toda pantalla. Pinta el fondo New Eridu (un degradado radial que aclara apenas la
parte superior sobre `--bg`), fija el color de texto y la tipografía, y centra el contenido
en una columna de 1080px con `gap: 0.75rem` entre secciones.

**Envolvé siempre la pantalla en esto.** Todos los demás componentes asumen texto claro
sobre fondo oscuro: fuera del shell quedan ilegibles sobre el blanco del navegador.

```jsx
<AppShell>
  <h1>ZZZ Tracker</h1>

  <Panel title="Cuenta">
    <MetaList items={[{ label: 'UID', value: '1300000123' }]} />
  </Panel>

  <Panel title="Roster" actions={<LinkButton size="sm" href="#">Agregar</LinkButton>}>
    <EntityGrid>{/* … */}</EntityGrid>
  </Panel>
</AppShell>
```

Los hijos directos se apilan verticalmente, así que poné `Panel` (o encabezados sueltos)
como hijos y dejá que el shell maneje el espaciado — no envuelvas todo en un `div` propio.

`maxWidth` angosta la columna para pantallas de un solo formulario, donde 1080px estira
demasiado los campos.

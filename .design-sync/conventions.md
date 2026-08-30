# Cómo construir con este sistema

Tema **oscuro únicamente**, estilo New Eridu (Zenless Zone Zero). No hay modo claro: no
escribas `@media (prefers-color-scheme)` ni alternativas en claro.

## Envolvé todo en `AppShell`

`AppShell` es la raíz de toda pantalla. Pinta el fondo, fija el color de texto y la
tipografía, y centra el contenido en una columna de 1080px con `gap: 0.75rem` entre hijos.

**Sin él, todo queda ilegible**: los componentes asumen texto claro y quedarían sobre el
blanco del navegador. No hay ningún otro provider ni contexto que configurar.

```jsx
<AppShell>
  <h1>ZZZ Tracker</h1>
  <Panel title="Cuenta">…</Panel>
  <Panel title="Roster">…</Panel>
</AppShell>
```

Los hijos directos se apilan solos — no envuelvas todo en un `div` con tu propio flex.

## El idioma: clases del sistema + tokens `var(--*)`

No hay props de estilo ni utilidades tipo Tailwind. Se estiliza de dos maneras:

**1. Clases del sistema.** Cada componente ya trae la suya; estas son las que podés usar
sobre marcado propio:

| Clase | Para qué |
|---|---|
| `.dim` | texto secundario (`--text-dim`) |
| `.small` | 0.85rem |
| `.mono` | tipografía monoespaciada — usala para **toda cifra o identificador** |
| `.tags` | fila que envuelve etiquetas |
| `.panel` | superficie de sección (preferí el componente `Panel`) |

**2. Tokens CSS** para cualquier cosa que escribas a mano. Nunca hardcodees un color:

- Superficies: `--bg` `--bg-panel` `--bg-panel-2`
- Bordes: `--border` `--border-strong`
- Texto: `--text` `--text-dim`
- Acento y semánticos: `--accent` (amarillo `#f3e600`) `--accent-dim` `--green` `--red`
- Rareza: `--rank-s` `--rank-a` `--rank-b`
- Atributos: `--element-fire` `--element-ice` `--element-electric` `--element-physics` `--element-ether`
- Tipografías: `--ui` `--mono`
- Radios: `--radius-sm` (6px) `--radius-md` (8px) `--radius-lg` (10px) `--radius-pill`

El amarillo `--accent` es el color de la marca y se gasta rápido: úsalo para los títulos de
`Panel`, los enlaces, **una sola** acción principal por vista, y nada más.

## Reglas que el sistema ya decidió por vos

- **Rareza** → `RankBadge` con `rank="S" | "A" | "B"`. No hay rangos por debajo de B.
- **Atributo elemental** → `ElementTag` con `element`. El color lo fija el componente; no lo
  pases por fuera ni lo repliques con `Tag`.
- **Estados de carga, error y vacío** → `StatusMessage`, **dentro** del `Panel` que
  reemplaza, para que la sección no salte cuando llegan los datos.
- **Controles de formulario** → siempre adentro de `Field` (etiqueta arriba, ayuda abajo);
  varios `Field` en una fila van dentro de `FieldRow`.
- **Navegación** → `LinkButton` (emite un `<a>` real), no `Button` con `onClick`.
- **Posiciones vacías** → `EmptySlot`, para que la grilla conserve su forma.

## Dónde está la verdad

Leé estos archivos antes de estilizar algo a mano:

- `_ds/<carpeta>/styles.css` y lo que importa — los tokens y todas las clases, tal como se
  compilan.
- `components/<grupo>/<Nombre>/<Nombre>.prompt.md` — cuándo usar cada componente, con
  ejemplos reales y las trampas de cada uno.

## Ejemplo idiomático

```jsx
<AppShell>
  <Panel
    title="Roster"
    actions={<LinkButton size="sm" href="/agents/new" variant="accent">Agregar</LinkButton>}
  >
    <EntityGrid>
      <EntityCard
        href="/agents/1091"
        title="Ellen Joe"
        subtitle="Nv. 60 · M2"
        portraitFallback="1091"
        rank="S"
      >
        <TagList>
          <ElementTag element="ice" />
          <Tag>Atacante</Tag>
        </TagList>
        <p className="dim small">Deep Sea Visitor · Nv. 60 · P1</p>
      </EntityCard>
    </EntityGrid>
  </Panel>
</AppShell>
```

El control viene de la biblioteca; el pegamento propio (esa última línea) usa las clases del
sistema, nunca estilos inline con colores literales.

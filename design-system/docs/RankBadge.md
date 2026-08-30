---
category: Etiquetas
---

# RankBadge

Insignia de rareza. A diferencia de `Tag`, es una pastilla **rellena** con texto oscuro:
tiene que leerse de un vistazo sobre un retrato.

La escala es la que usa ZZZ, de mayor a menor: `S` amarillo `--rank-s`, `A` violeta
`--rank-a`, `B` azul `--rank-b`. No hay rangos por debajo de B.

```jsx
<RankBadge rank="S" />
```

Dentro de `EntityCard` la insignia se ancla sola a la esquina inferior derecha del retrato,
así que pasá la prop `rank` de la tarjeta en vez de componerla a mano:

```jsx
<EntityCard title="Ellen Joe" rank="S" portraitUrl={url} />
```

---
category: Contenedores
---

# EntityCard

Tarjeta de entidad: retrato cuadrado de 64px a la izquierda, texto a la derecha. Es la
unidad de los listados de agentes, W-Engines y discos.

Con `href` la tarjeta entera es un enlace y toma el borde amarillo al pasar el mouse; sin
`href` es un bloque estático. No metas botones adentro de una tarjeta enlazada — anidar
controles dentro de un `<a>` rompe el clic.

Cuando no hay imagen, `portraitFallback` ocupa el hueco. Poné ahí el id del juego: se
renderiza en monoespaciada y atenuado, y sirve para depurar datos incompletos.

```jsx
<EntityGrid>
  <EntityCard
    href="/account/1300000123/agents/1091"
    title="Ellen Joe"
    subtitle="Nv. 60 · M2"
    portraitUrl={ellen.iconUrl}
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
```

El cuerpo (`children`) va debajo del subtítulo. Mantenelo en dos o tres líneas: la grilla
alinea las tarjetas por arriba y una tarjeta mucho más alta que el resto desbalancea la fila.

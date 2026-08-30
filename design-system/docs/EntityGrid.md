---
category: Contenedores
---

# EntityGrid

Grilla responsiva para `EntityCard`: columnas de mínimo 230px que se reparten el ancho
disponible, con `gap: 0.9rem`.

No hace falta configurar nada ni pasar el número de columnas — se ajusta sola al ancho del
`Panel` que la contiene.

```jsx
<Panel title="Roster">
  <EntityGrid>
    {agentes.map((a) => (
      <EntityCard key={a.id} title={a.nombre} rank={a.rango} />
    ))}
  </EntityGrid>
</Panel>
```

Para listas de una sola columna (equipos, cuentas) no uses esta grilla: apilá los elementos
con un `display: grid` y `gap: 0.9rem` propios.

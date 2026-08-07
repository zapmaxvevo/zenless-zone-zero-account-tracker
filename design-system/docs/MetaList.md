---
category: Datos
---

# MetaList

Lista de definición en dos columnas para datos de cabecera: nivel Inter-Knot, UID, fecha de
la última sincronización.

Las etiquetas quedan atenuadas y los valores en monoespaciada, así las cifras alinean
verticalmente aunque las etiquetas midan distinto. La primera columna se ajusta a la
etiqueta más larga.

```jsx
<Panel title="Cuenta">
  <MetaList
    items={[
      { label: 'UID', value: '1300000123' },
      { label: 'Nivel Inter-Knot', value: '55' },
      { label: 'Agentes', value: '32' },
      { label: 'Última sincronización', value: 'hace 2 horas' },
    ]}
  />
</Panel>
```

Es para datos **estáticos de identificación**. Si los valores son estadísticas comparables
entre sí (ataque, crítico, penetración) usá `StatList`, que los alinea a la derecha.

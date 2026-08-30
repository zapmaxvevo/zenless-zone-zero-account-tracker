---
category: Datos
---

# StatList

Lista de estadísticas etiqueta-valor con el valor alineado a la derecha en monoespaciada.
Es la lista de subestadísticas de un disco y también sirve para los atributos de un agente.

`note` agrega una anotación corta pegada al valor, en amarillo atenuado `--accent-dim`. En
los discos son las tiradas de mejora (`+3`): información secundaria que no debe competir
con la cifra principal.

```jsx
<StatList
  items={[
    { label: 'Crítico', value: '9.6%', note: '+3' },
    { label: 'Daño crítico', value: '19.2%', note: '+2' },
    { label: 'Ataque', value: '38' },
    { label: 'Penetración', value: '9' },
  ]}
/>
```

Para datos de identificación que no se comparan entre sí (UID, nivel, fecha) usá `MetaList`.

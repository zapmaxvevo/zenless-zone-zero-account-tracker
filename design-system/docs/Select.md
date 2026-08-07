---
category: Formularios
---

# Select

Desplegable nativo con los estilos del sistema. Comparte superficie, borde y foco con
`TextInput`, así los formularios mixtos se ven parejos.

Las opciones van como `<option>` hijos: no hay componente `Option` intermedio, a propósito.
El desplegable nativo funciona bien en móvil y con teclado, y no vale la pena reemplazarlo.

```jsx
<Field label="Atributo" htmlFor="attr">
  <Select id="attr" defaultValue="ice">
    <option value="fire">Fuego</option>
    <option value="ice">Hielo</option>
    <option value="electric">Eléctrico</option>
    <option value="physics">Físico</option>
    <option value="ether">Éter</option>
  </Select>
</Field>
```

Si las opciones son pocas y excluyentes (dos o tres), considerá botones en vez de un
desplegable: se ve el conjunto completo sin abrir nada.

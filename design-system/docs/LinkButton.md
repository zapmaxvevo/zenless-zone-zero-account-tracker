---
category: Acciones
---

# LinkButton

Ancla con la apariencia exacta de `Button`. Mismas props `variant` y `size`.

Usalo siempre que la acción lleve a otra pantalla. Emitir un `<a href>` real mantiene el
clic con el botón del medio, el menú contextual y la navegación por teclado, cosas que un
`<button onClick={navegar}>` rompe.

```jsx
<LinkButton href="/account/1300000123/agents/new" variant="accent">
  Agregar agente
</LinkButton>
```

En la app real, envolvelo en el `Link` del router o pasale el `href` que el router genere.

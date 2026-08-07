import { Button } from "zzz-ui";

export function Variantes() {
  return (
    <div
      style={{
        display: "flex",
        gap: "0.6rem",
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <Button variant="accent">Guardar build</Button>
      <Button>Cancelar</Button>
      <Button variant="danger">Borrar equipo</Button>
    </div>
  );
}

export function Tamanos() {
  return (
    <div
      style={{
        display: "flex",
        gap: "0.6rem",
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <Button variant="accent">Sincronizar cuenta</Button>
      <Button variant="accent" size="sm">
        Sincronizar
      </Button>
      <Button size="sm">Editar</Button>
    </div>
  );
}

export function Deshabilitado() {
  return (
    <div
      style={{
        display: "flex",
        gap: "0.6rem",
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <Button variant="accent" disabled>
        Sincronizando…
      </Button>
      <Button disabled>Cancelar</Button>
    </div>
  );
}

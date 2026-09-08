# Warhost — front React

Aplicacion web para jugar a los sistemas de One Page Rules: base de datos de
ejercitos, partidas asistidas, asociaciones e indice de reglas y misiones.

React + Vite + TypeScript, con Appwrite como unico backend.

## Arrancar

```bash
cp .env.example .env   # apunta a tu proyecto de Appwrite
pnpm install
pnpm dev
```

Variables (`.env`):

| Variable | Para que |
|---|---|
| `VITE_APPWRITE_ENDPOINT` | URL del API de Appwrite. |
| `VITE_APPWRITE_PROJECT_ID` | Id del proyecto. |
| `VITE_APPWRITE_DATABASE_ID` | Base de datos, por defecto `warhost`. |
| `VITE_APPWRITE_BUCKET_ID` | Bucket de imagenes, por defecto `army_assets`. |
| `VITE_APPWRITE_NOTIFY_FUNCTION_ID` | Funcion de solicitud de acceso. |
| `VITE_APPWRITE_ARMY_FORGE_FUNCTION_ID` | Proxy de Army Forge. |

El dominio desde el que sirvas el front tiene que estar dado de alta como
plataforma Web en la consola de Appwrite, o el navegador recibira errores de CORS.

## Comprobaciones

```bash
pnpm test:import     # importa listas reales de Army Forge y valida el resultado
pnpm test:builder    # construye con datos reales del catalogo y valida los topes
pnpm test:profile    # lee armamento, equipo y opciones de todas las unidades
pnpm test:spells     # lee los hechizos de los 226 libros del catalogo
```

Ninguna de las dos necesita navegador: ejecutan los modulos que se despliegan
(`src/lib/armyForgeResolve.ts` y `src/lib/builder.ts`), que estan separados de la
capa de red justamente para poder ejercitarlos desde Node. `test:builder` lee de
Appwrite con la CLI, que toma el proyecto del repo del backend; si lo tienes en
otro sitio, pasale `APPWRITE_DIR`.

## Como esta montado

```
src/
  lib/         cliente de Appwrite, tipos de fila, sistemas de juego, formato
  api/         una funcion por operacion contra Appwrite; nada de SDK en las vistas
  context/     sesion (AuthContext) y modo de juego elegido (GameSystemContext)
  components/  Layout, puerta de acceso y piezas reutilizables
  pages/       una carpeta por area funcional
```

Las vistas nunca hablan con el SDK directamente: todo pasa por `src/api`, que es
donde viven los ids de tabla, las consultas y los permisos de fila.

## Acceso

`RequireAccess` es la unica puerta de la app:

- **sin sesion** → `/login`
- **email sin verificar** → pantalla de verificacion, con reenvio de email
- **verificado pero sin la label `aceptado`** → pantalla de espera, con un boton
  que avisa al administrador (y admite un mensaje)
- **aceptado** → la app

Es una comodidad, no una barrera: quien manda son los permisos de Appwrite.

## Ambientacion y modo de juego

Al entrar se elige ambientacion (Grimdark / Age of Fantasy) y modo (GF, Firefight,
AoF, Skirmish, Regiments). La eleccion se guarda en `localStorage` y filtra
ejercitos, partidas, reglas y misiones. Tambien tine la interfaz.

## Areas

- **Ejercitos** — CRUD con imagenes en el bucket. Pega el enlace de una lista
  compartida de Army Forge y se importa entera: puntos, miniaturas y unidades con
  su Calidad, Defensa, heridas y reglas especiales.
- **Partidas** — al crearlas se copian las unidades de cada ejercito como
  marcadores. La vista en vivo tiene marcador (puntos, VP, CP), estado por unidad
  (heridas, activada, aturdida, fatigada, destruida, contadores libres), la carta
  de mision y el buscador de reglas, todo sin salir de la pantalla. Los cambios se
  propagan en tiempo real a quien tenga la partida abierta.
- **Asociaciones** — clubes con miembros, sus partidas y una clasificacion
  (3 puntos por victoria, 1 por empate).
- **Reglas y misiones** — contenido de solo lectura servido desde Appwrite,
  con busqueda en cliente y "robar carta" para las misiones.

## Army Forge

El navegador no puede llamar a `army-forge.onepagerules.com` por CORS, asi que
las importaciones pasan por la funcion `army_forge_proxy` del backend. Si Army
Forge cambia sus rutas, la accion `raw` del proxy permite apuntar a una nueva sin
redesplegar el front.

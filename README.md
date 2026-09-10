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
pnpm test:edit       # compone, guarda, rehidrata y modifica un ejercito
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

## La carta de unidad

`components/UnitCard.tsx` pinta una unidad con aire de carta de juego: apaisada
y clara sobre el fondo oscuro, banda de titulo con los atributos en cajas, y el
armamento en tabla. La estetica viene del generador de cartas de kt-cartas.

Tiene dos variantes, porque son dos preguntas distintas sobre la misma unidad:

- **`catalogo`** (ficha de faccion): con que armas viene de serie y **como se
  configura** — cada seccion de mejora con sus opciones, su precio y a cuantos
  modelos alcanza.
- **`ejercito`** (ejercito guardado): con que ha acabado **esta** unidad, ya
  aplicados los reemplazos, y que mejoras se le compraron.

A diferencia de una carta impresa, no tiene tamano fijo: el contenido manda,
porque una unidad puede llevar dos armas o diez.

Toda regla que aparece en la carta es un **chip**, y al pulsarlo se abre la
carta de esa regla con su descripcion: las innatas de la unidad, las que concede
cada pieza de equipo y tambien las **reglas de arma** de la tabla de armamento
—AP, Blast, Rending—. Era justo la columna donde mas falta hace: se lee "AP(1)"
en mitad de una partida y hay que saber que hace.

Las reglas de arma se cubren al 91%: `Reliable` y `Limited` no traen
descripcion en ningun libro de ejercito, porque son del reglamento basico. Su
chip sale en punteado y su carta lo dice, que es mejor que inventarselas.

## Editar un ejercito

Un ejercito guardado lleva dos cosas en `listJson`: las **unidades resueltas**,
que es lo que necesitan la ficha y la partida, y las **elecciones** que las
produjeron (`entries`), que es lo unico que permite reabrir el constructor sin
perder informacion. El resultado no se puede desandar; las elecciones si.

Tambien guarda `source.bookKey`, la faccion del catalogo de la que salio. Sin
ese dato no se pueden anadir unidades, y la ficha lo dice en vez de ofrecer un
boton que no llevaria a ninguna parte.

Un ejercito **importado** de Army Forge no tiene `entries`, pero si el JSON
original: la composicion se reconstruye de ahi, porque los identificadores de
unidad y de opcion son los mismos que usa el catalogo. Lo que se pierde en esa
reconstruccion son las unidades y opciones que ya no existan en la version
actual del libro, y el constructor avisa de cuantas.

### La carta de hechizo

Un hechizo va en carta de tarot **vertical**, 70 x 120 mm: la misma piel y las
mismas medidas que la de unidad, girada. Lleva otra cosa —no hay perfil ni tabla,
solo un valor y un efecto—, asi que el texto se lleva la carta y el valor manda
desde la cabecera, que es como se busca un hechizo en mesa.

El cuerpo va generoso (3,9 mm) porque sobra sitio: el efecto mas largo del
catalogo son 209 caracteres y ocupa seis lineas de las que caben.

### Iconos de arma

Cada arma lleva delante su simbolo, para recorrer la tabla sin leer las reglas:
espada en cuerpo a cuerpo, y a distancia **proyectiles en grimdark y arco en
fantasy**. Se dibujan los dos y el CSS esconde el que no toca, asi que el icono
correcto sale tambien donde no hay contexto de React, como en el banco de
pruebas.

Van macizos y de pie a proposito. Se probaron primero con el lienzo apaisado de
kt-cartas y con trazo fino: a 2 mm el arco quedaba en una raya con una curva y
la espada en una mota. Una silueta rellena se reconoce; una linea no.

## Mirar las cartas

La carta de unidad mide **120 x 70 mm**, que es una carta de tarot, y esta
definida en milimetros y no en pixeles con una proporcion parecida. En pantalla
se mira con un aumento (`--ucard-esc`, 1.15 por defecto); al imprimir vuelve a 1
y sale a tamano real. Eso significa que el diseno solo se puede juzgar viendola llena, y con
las unidades que mas la aprietan, no con una de dos lineas:

```bash
pnpm preview:cards                       # unidades: Grimdark, Battle Brothers
pnpm preview:cards <bookKey> fantasy     # la otra ambientacion
pnpm preview:spells [bookKey] [tema]     # hechizos
pnpm preview:hoja [bookKey]              # la ficha grande de catalogo
```

Dibuja el componente que se despliega con el CSS que se despliega y datos del
catalogo, elige la unidad con mas armas, la de mas reglas y una con equipo, y
saca una foto. Usa el Chrome del sistema, asi que Playwright no se baja el suyo.

Una caja de tamano fijo no puede con todo, y lo que decide si desborda no es el
numero de armas sino los renglones que ocupan: un arma con cuatro reglas
envuelve y cuenta por dos. Asi que la carta **aprieta su tipografia** cuando va
cargada, en dos escalones, como hacen las secciones compactas de kt-cartas. La
banda de titulo nunca se toca: es lo que identifica la carta de un vistazo.

Que eso baste no se decide mirando: se comprueba.

```bash
pnpm check:cards [nLibros]    # pasa TODAS las unidades y avisa de las que se recortan
pnpm test:impresion           # comprueba que salen dos fichas por hoja A4
```

Renderiza cada unidad en sus dos formatos y cada hechizo, le pregunta al
navegador si el contenido cabe en su caja y falla si alguno se pasa. Ultima
pasada: **14 libros, 816 cartas —366 de unidad, 366 fichas y 84 hechizos—,
ninguna se recorta**. Si tocas tamanos, tipos o espaciados de la carta, esto es
lo que dice si te has pasado.

## La ficha de catalogo

La carta de tarot es para la mesa: la unidad ya configurada, con lo que se
consulta en turno. Pero una unidad **sin** configurar se mira para elegir, y
entonces lo importante son sus opciones —hay unidades con 35 repartidas en 8
secciones—, que no caben en 120 x 70 mm.

Asi que la vista de faccion y el asistente de anadir unidades usan otro formato:
**190 x 134 mm**, el ancho util de un A4 y la mitad de su alto, con las opciones
dentro de la propia ficha en tres columnas. Dos por hoja, sin cortar ninguna.
`@page` fija A4 vertical con 10 mm de margen y `--uhoja-esc` vuelve a 1 al
imprimir, para que salga a tamano real.

Lo que decide si desborda no es cuantas opciones hay sino cuanto ocupan: hay
opciones de un renglon —"Jetpacks (Ambush, Flying)"— y otras de tres —"Energy
Hammer (A1, Blast(3)), Combat Shield (Shielded)"—. El peso se estima por
renglones, no por numero de opciones, y la ficha aprieta la tipografia en dos
escalones cuando hace falta.

## Reemplazos de equipo

Una seccion `replace` dice en `targets` que armas quita. Dos cosas que hay que
saber, porque cuando fallan no se ve nada raro: simplemente no se quita.

**El objetivo viene como suena en la frase.** Una seccion "Replace all Adrenaline
Fueleds" apunta a `"Adrenaline Fueleds"` aunque el equipo se llame `"Adrenaline
Fueled"`. De los 6193 objetivos del catalogo, 883 (14%) solo casan quitando la
"s" final.

**`affects: all` cambia todas las copias de una vez.** Una unidad con 3 copias
acaba con 3 del nuevo equipo, no con 1, y la seccion solo se puede coger una vez.

```bash
pnpm test:reemplazos
```

Ojo al comprobarlo: hay opciones que quitan un `CCW (A2)` y devuelven un
`CCW (A1)` distinto, asi que hay que comparar etiquetas y no nombres.

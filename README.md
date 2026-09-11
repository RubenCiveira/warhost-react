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

Todas traen descripcion: 100% de los 2823 usos de reglas de unidad y de los
1474 de reglas de arma. No siempre fue asi —`Fast`, `Aircraft`, `Transport`,
`Reliable` y companía no salen en ningun libro de ejercito, porque son del
reglamento basico—, y la carta lo decia en vez de inventarselas. Ahora se
vuelcan de `/api/rules/common/<sistema>`, que es la misma fuente que usa la web
de Army Forge; ver el README de warhost-appwrite.

Sigue habiendo chip punteado para lo que no tenga texto, porque queda un caso:
un objeto puede conceder un **arma** —el Combat Shield concede `Bash`— y la
ficha la pinta como si fuera una regla. Son 8 usos de 126 en el equipo.

Lo mismo vale para las **opciones de mejora**, que es donde mas falta hace: una
opcion se consulta justo antes de comprarla. `lib/opciones.ts` desmonta cada
opcion en lo que da —armas con su perfil, equipo, y las reglas de ambos— a
partir de sus `gains` y no partiendo el texto de la etiqueta, que ya viene
armado por Army Forge y volver a partirlo seria adivinar. Del catalogo entero
(4899 opciones) se desmontan todas, el 97,7% traen alguna regla que consultar, y
`pnpm test:opciones` comprueba que no se pinta nada que no estuviera en la
etiqueta original.

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
se mira con un aumento (`--ucard-esc`, 1.45 en escritorio y menos segun baja el
ancho; los hechizos llevan el suyo, `--scard-esc`, porque son verticales y con
1.45 no cabrian de alto); al imprimir vuelve a 1
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
pnpm test:opciones [nLibros]  # desmonta todas las opciones del catalogo
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

En la ficha las opciones estan **siempre a la vista**, y su titulo es un rotulo
—"Opciones"— y no un desplegable: es lo que se viene a leer, y en papel un
desplegable no se puede abrir. Fuera de la ficha si se pliega, porque la carta
de mesa ensena la unidad ya configurada y sus opciones son consulta.

Asi que la vista de faccion y el asistente de anadir unidades usan otro formato:
**190 x 134 mm**, el ancho util de un A4 y la mitad de su alto, con las opciones
dentro de la propia ficha en tres columnas. Dos por hoja, sin cortar ninguna.
`@page` fija A4 vertical con 10 mm de margen y `--uhoja-esc` vuelve a 1 al
imprimir, para que salga a tamano real.

Cuando las opciones no caben, la ficha aprieta la tipografia, en cuatro
escalones. Elegir el escalon contando opciones y poniendo umbrales a ojo no
funciona: falla en las dos direcciones, aprieta fichas con sitio de sobra y
recorta las que no. Asi que `pasoDeOpciones` estima en **milimetros**, que es la
unidad en la que esta escrita la carta, y coge el escalon mas grande que quepa.

Lo que hay que modelar, y lo que pasa si te lo saltas:

1. **Cuanto ocupa cada opcion**, no cuantas hay: "Jetpacks (Ambush, Flying)" es
   un renglon y "Energy Hammer (A1, Blast(3)), Combat Shield (Shielded)" son
   tres.
2. **Como reparte el navegador las columnas.** Las secciones no se parten
   (`break-inside: avoid`) y se reparten *en orden* hacia una altura objetivo
   —el total entre tres—, cortando cuando la columna queda mas cerca del
   objetivo sin la siguiente seccion que con ella. Ni se reparte de mayor a
   menor ni se busca el minimo que quepa, que es lo que sale solo al escribirlo:
   las dos cosas subestiman el alto. Medido en fichas reales, 37/52/77 mm y
   63/82/34 donde un reparto optimo habria dado 56 y 59.
3. **El hueco que dejan armas, reglas y equipo.** Un titan con ocho armas
   desborda antes que un capitan con treinta y cinco opciones. Estos numeros
   estan *medidos* en el navegador, no estimados: la cabecera son 12,2 mm
   clavados y la zona de opciones va de 96 mm con un arma a 61 mm en la ficha
   mas cargada.
4. **Que un aura ocupa dos chips**, porque lleva pegada la regla que concede.
5. **Que un chip ocupa mas que su texto**, y que el texto se parte por palabras:
   una linea casi nunca se llena del todo. El ancho de letra que sale de medir
   (0,68 em) no es el ancho real de la letra (0,52 em).

Las constantes salen de comparar el modelo con lo que pinta el navegador:
`MEDIR=1 pnpm check:cards` vuelca las alturas reales de cada ficha a
`/tmp/medidas.json`, y `UNA="<unidad>" pnpm check:cards` saca la geometria de
una sola, columnas incluidas. Sin eso serian numeros inventados. De 740 fichas
del catalogo, 609 salen a tamano completo, 55 densas, 34 muy densas y 42 en el
ultimo escalon, donde los chips pierden el marco y se quedan en subrayado
punteado: se cae el marco, no la funcion —siguen abriendo la carta de la regla.

El comprobador pinta las cartas **como se ven**: con el glosario cargado, que es
lo que hace salir los chips dobles de aura, y con el boton de la esquina. Las
dos veces que se le olvido alguna de esas dos cosas estaba midiendo una pagina
que nadie ve, y aparecieron recortes en cuanto se anadio.

## Inconsistencias del catalogo

El catalogo de Army Forge escribe el objetivo de un reemplazo de tres maneras
distintas para el mismo objeto —`"Bio-Spiners"` cuando el equipo se llama
`"Bio-Spiner"`, `"Heavy Razor Claw"` cuando se llama `"Heavy Razor Claws"`, y
`"3x Heavy Razor Claws"` con la cantidad dentro del nombre—, ademas de en
mayusculas (`"CCWS"` por `CCW`). Son **443 desajustes en 295 unidades de 58
libros**.

```bash
pnpm audit:opciones [nLibros]                # recorre el catalogo, ~10 min
node scripts/informe-opciones.mjs > ../warhost-appwrite/ARMY-FORGE-DATA-ISSUES.md
```

Va en dos pasos porque recorrer el catalogo tarda y el texto del informe se
reescribe muchas mas veces que los datos. El informe esta en ingles, para poder
reportarlo aguas arriba.

Lo que el auditor **no** cuenta como fallo: una seccion puede reemplazar algo
que otra opcion de la misma unidad te dio antes —"Replace Energy Sword" despues
de comprar la Energy Sword—, y eso es correcto. Sin ese filtro el informe se
llena de falsos positivos.

## Cartas de mision

Se transcriben del PDF oficial con OCR, porque alli las cartas son imagenes y no
texto (el porque, en el README de warhost-appwrite). Eso significa que entran
**sin repasar**, con erratas y, en casi la mitad, sin los puntos de victoria.

La pagina lo dice en vez de disimularlo: aviso arriba con cuantas faltan, filtro
para ver solo esas, borde punteado en las que no se han repasado y `?VP` cuando
el numero no se pudo leer. Quien lleve la etiqueta **`editor`** corrige nombre,
texto y puntos desde la propia carta, y al guardar puede marcarla repasada.

`isEditor` incluye a los admin, y como el resto de comprobaciones de etiqueta en
el front solo decide que controles se ensenan: quien manda es el permiso de la
tabla.

## Auras

Una regla de aura no dice que hace: dice que regla concede. "Bane in Melee Aura"
significa que la unidad gana **Bane**, y Bane es lo que quieres leer en mitad de
una partida. Asi que su chip sale doble —`Bane in Melee Aura → Bane`—, con los
dos tramos pulsables y cada uno abriendo su carta.

La regla concedida se saca de la **descripcion** —"This model and its unit get
Bane in melee."— y no del nombre. La descripcion es la que declara lo que
concede, y cuando el aura incrusta su efecto en vez de conceder una regla
—"Courage Aura: +1 to morale test rolls"— no hay nada que enlazar, y eso
tambien lo dice la descripcion. De 448 auras del catalogo, 234 conceden una
regla que se puede consultar; el resto se explican solas.

`pnpm test:auras` comprueba las dos direcciones: que ninguna ofrezca una regla
que no existe, y que ninguna que declare una se quede sin enlazar.

## Cuantas mejoras deja comprar una seccion

Son dos limites distintos y confundirlos cuesta caro:

- **`affects`** dice a cuantos modelos alcanza la seccion: `exactly 1`,
  `up to 2`, `any`, `all`.
- **`select`** dice cuantas opciones distintas puedes elegir: `exactly 1`,
  `any`, o nada.

Que una mejora alcance a todos los modelos no significa que solo puedas comprar
una: "Upgrade all models with any" con dos opciones son dos mejoras, cada una
para todos los modelos. Tomar `affects: all` como tope de la seccion entera
hacia que la primera bloquease las demas.

Con `all` el tope de uno es **por opcion**: alcanzar a todos ya lo hace a la
primera, y comprarlo dos veces solo cobra dos veces. La excepcion es el
reemplazo, donde si es por seccion: "Replace all Bio-Spiners" se lleva los
Bio-Spiners enteros y un segundo reemplazo no tendria nada que quitar.

## Solo se edita el borrador

Viendo un ejercito sin borrador, la vista es de **consulta**: no hay botones de
configurar, ni de quitar, ni el flotante de anadir, y el formulario de datos va
bloqueado. En su sitio, donde estaria "Guardar", hay un boton **Editar** que
abre el borrador; a partir de ahi vuelven "Guardar", "Mas" y todas las acciones
sobre las unidades.

El paso a edicion es explicito a proposito. Antes, escribir en el nombre abria
un borrador por detras: se salia de la vista de consulta sin querer y sin
enterarse.

Los tres estados son: **sin borrador** (consulta, con "Editar"), **con borrador
pero mirando lo publicado** (consulta, con "Borrador" para decidir que hacer con
el) y **en el borrador** (edicion, con "Guardar"). Un solo `editable` los
resuelve, y el formulario de datos va dentro de un `fieldset` para que lo que se
anada manana quede bloqueado tambien sin acordarse.

## Quitar una unidad

Junto a "Configurar" en cada carta. Tiene el mismo cuidado con los indices que
reconfigurar, mas uno propio: `attachedTo` es un **indice**, asi que quitar una
unidad corre los de las que van detras, y la que estuviera unida a la que se va
se queda suelta en vez de apuntar a quien no es. `pnpm test:reconfigurar` lo
comprueba en las dos direcciones.

## Reconfigurar una unidad puesta

Cada carta del ejercito lleva en su esquina inferior derecha un boton que abre
el asistente sobre **esa** unidad, ya elegida y con lo que tenia puesto, para
cambiarlo. Es el mismo asistente que anade unidades, sin el paso de elegirla.

Va dentro del marco de la carta y no en su pie porque es una accion sobre esta
unidad, no sobre la lista. Al imprimir no sale.

Lo que hay que mirar con lupa aqui es **a que unidad se aplica el cambio**. El
`sortOrder` de una carta es su indice en `entries`, porque `composeArmyPayload`
escribe `units` y `entries` del mismo array. Pero rehidratar descarta las
unidades que ya no estan en el libro, asi que el indice deja de valer en cuanto
se rehidrata: se aplica sobre lo guardado y se rehidrata despues. Aplicarlo al
reves reconfigura otra unidad sin que nada avise, y eso es lo que comprueba
`pnpm test:reconfigurar`, con el caso malo incluido.

## Unidades combinadas y notas

Una unidad **combinada** —"combined" en Army Forge— es el doble de miniaturas y
el doble de puntos. Lo que no se dobla es la configuracion: **se elige sobre la
unidad normal y se dobla el resultado**. Unos Pathfinders de 5 con Heavy Pistol
que cambian todas por Heavy Rifle y luego tres de esos por Sniper Rifle quedan
en 2 Heavy y 3 Sniper; combinados son 10 miniaturas, 4 Heavy, 6 Sniper y el
doble de puntos.

Por eso hay dos funciones y no una: `entryLoadout` da el equipo de la unidad
normal —de ahi sale con que cuenta para decidir que reemplazos estan
disponibles, y esos se resuelven sobre la unidad de siempre— y
`entryLoadoutFinal` lo dobla para lo que sale a la mesa. Los limites de cada
seccion tampoco cambian: "Replace up to three" siguen siendo tres.

Un Heroe no se puede combinar: combinar es juntar dos unidades iguales, y un
Heroe es una miniatura.

Army Forge guarda una unidad combinada como **dos** selecciones, las dos con
`combined`, la segunda apuntando a la primera con `joinToUnit` y sin mejoras
propias. Al importar se descarta la segunda: es la otra mitad, no otra unidad.

Cada unidad admite ademas una **nota** del jugador, que se guarda con el
ejercito y se pinta en su carta.

## Reemplazos encadenados

Los Pathfinders de Battle Brothers llevan Flamer Pistol, y una de sus secciones
es "Replace Gravity Pistol". El objetivo no esta mal escrito: esa seccion
**encadena** con otra que si da la Gravity Pistol, y hasta que no la compres no
hay nada que reemplazar.

Asi que un reemplazo solo se puede elegir si la unidad lleva su objetivo **en
ese momento**, contando lo ya comprado. Cuando no, la opcion se bloquea y dice
donde se consigue: *"Esta unidad no lleva Gravity Pistol. Primero hay que
cogerlo en «Replace Flamer Pistol»"*.

Hubo aqui una adivinanza que hacia justo lo contrario: cuando el objetivo no
aparecia, el reemplazo caia sobre el CCW —el arma que todo modelo lleva de
serie— y quitaba lo que no tocaba. El emparejamiento vuelve a ser estricto: solo
las tres formas en que el catalogo escribe el mismo objeto (plural, singular y
con la cantidad delante), y nada mas.

De 1479 secciones con objetivo en 30 libros, 1172 estan disponibles de entrada y
307 se abren al comprar la opcion que las habilita. **Ninguna queda sin salida**,
y `test:reemplazos` lo comprueba: una seccion que no se abriera con nada seria
catalogo mal escrito, o nosotros leyendolo mal.

## Armas dentro de objetos

Lo que un objeto lleva en `content` no siempre son reglas: tambien hay armas. El
Combat Shield concede `Bash`, que es un cuerpo a cuerpo con su perfil, y la
Custodian Jetbike trae un `Heavy Rifle Array (24", A6, AP(1))`. Son 96 en 30
libros.

Tratarlas como reglas las hacia desaparecer por partida doble: se pintaban como
un chip sin descripcion, y un "Replace Heavy Rifle Array" no encontraba a que
apuntar aunque la unidad lo llevase puesto. Eran las 4 secciones que quedaban
sin salida.

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

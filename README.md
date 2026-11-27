# parcellaire

Public data about a French land parcel, and the drawing of its cadastral plan.

Fifteen TypeScript modules with no runtime dependency. They read the open data
published by the French State: the Base Adresse Nationale (addresses), the IGN
cadastre (parcels), the Référentiel National des Bâtiments (buildings) and the
DGFiP and IGN map layers.

## Modules

| Module                        | What it does                                                         |
| ----------------------------- | -------------------------------------------------------------------- |
| `parcellaire/ban`             | Base Adresse Nationale: streets, municipalities, address search      |
| `parcellaire/cadastre`        | IGN parcels, and which parcels an address sits on                    |
| `parcellaire/bati`            | BD TOPO buildings: footprint, height, floors, dwellings, year built  |
| `parcellaire/rnb`             | The building of an address, and its share on each parcel             |
| `parcellaire/plan`            | A cadastral plan drawn as SVG, computed on the server                |
| `parcellaire/cotes`           | The length of each parcel boundary, and its kind                     |
| `parcellaire/vue`             | Zoom and pan of a plan, carried in the URL                           |
| `parcellaire/geometrie`       | Rings, point in polygon, distance to an edge                         |
| `parcellaire/lambert`         | WGS 84 to Lambert-93, distances and areas in metres                  |
| `parcellaire/reseau`          | A `fetch` with a cache and a timeout                                 |
| `parcellaire/arrondissements` | Paris, Lyon and Marseille: the code to query, the name to display    |
| `parcellaire/casse`           | Casing of French proper names                                        |
| `parcellaire/francais`        | French articles: « de Nantes », « du Mans », « de la Mayenne »       |
| `parcellaire/fonds`           | Base maps: cadastre, aerial photo, IGN plan, and their WMS addresses |
| `parcellaire/cadastre-gouv`   | Search on the cadastre.gouv.fr service                               |

The package ships no component, no style, no route and no data. It only calls
public APIs with `fetch`, and works on any runtime that has it.

## Install

```bash
npm install github:florianmousseau/parcellaire
```

Node 20 or later.

## Example

```ts
import { chercher } from 'parcellaire/ban';
import { parcellesAutour, rattacherLaParcelle } from 'parcellaire/cadastre';
import { dessiner } from 'parcellaire/plan';

const [adresse] = await chercher('20 avenue de Ségur Paris');
const { lon, lat } = adresse.point;

const autour = await parcellesAutour(lon, lat);
const rattachement = rattacherLaParcelle(null, autour, lon, lat, null);

const plan = rattachement ? dessiner(autour, rattachement.parcelle.idu) : null;
```

## Gate

```bash
npm run gate
```

Formatting, lint, type check and unit tests. No test touches the network. The
same gate runs on every pull request.

## License

[MIT](LICENSE)

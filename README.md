# parcellaire

Les données publiques d'une parcelle française, et le calcul de son plan.

Douze modules sans dépendance, écrits en TypeScript, qui lisent les sources
ouvertes de l'État et calculent ce qu'il faut pour en faire une page : la Base
Adresse Nationale, le cadastre de l'IGN, le Référentiel National des Bâtiments,
les fonds de la DGFiP et de l'IGN.

Extraits de [aucadastre.fr](https://aucadastre.fr) et
[edifiable.fr](https://edifiable.fr), qui les servent en production.

## Ce que le paquet contient

| Module                        | Ce qu'il fait                                                          |
| ----------------------------- | ---------------------------------------------------------------------- |
| `parcellaire/ban`             | La Base Adresse Nationale : une voie, une commune, la recherche        |
| `parcellaire/cadastre`        | Les parcelles de l'IGN, et laquelle porte une adresse                  |
| `parcellaire/bati`            | Les bâtiments de la BD TOPO : forme, hauteur, étages, logements, année |
| `parcellaire/rnb`             | Le bâtiment d’une adresse, et la part posée sur chaque parcelle        |
| `parcellaire/plan`            | Le tracé d'un plan cadastral, en SVG, calculé sur le serveur           |
| `parcellaire/cotes`           | La longueur de chaque limite d'une parcelle, et sa nature              |
| `parcellaire/vue`             | Le zoom et le déplacement d'un plan, par l'adresse                     |
| `parcellaire/geometrie`       | Anneaux, appartenance d'un point, distance à un bord                   |
| `parcellaire/lambert`         | WGS 84 vers Lambert-93, distances et aires en mètres                   |
| `parcellaire/reseau`          | Un `fetch` qui met en cache et qui abandonne au bout du temps imparti  |
| `parcellaire/arrondissements` | Paris, Lyon et Marseille : le code a interroger, le nom a afficher     |
| `parcellaire/casse`           | La casse d'un nom propre français                                      |
| `parcellaire/francais`        | Les articles : « de Nantes », « du Mans », « de la Mayenne »           |
| `parcellaire/fonds`           | Les fonds de carte : cadastre, photo, plan IGN, et leur adresse WMS    |
| `parcellaire/cadastre-gouv`   | La recherche du service cadastre.gouv.fr                               |

### Ce qui n'a pas encore pu partir

Le retour d'attente et l'aide à la saisie sont écrits DEUX fois : c'est du code
de DOM, lié au balisage de chaque site, et ce qui se dessine n'appartient pas au
paquet.

`toponyme.ts` chez edifiable répond à la même question que `francais.ts`, avec
une AUTRE implémentation : 1 076 désaccords sur 32 735 noms de communes, tous
sur l'article « La », qui ne se contracte pas. Les échanger change un texte
visible en ligne : c'est une décision, pas une extraction.

## Ce qu'il ne contient pas

**Aucun composant, aucun style, aucune route.** Ce qui se dessine et ce qui
s'adresse appartient au site qui consomme le paquet : deux sites n'ont ni les
mêmes couleurs, ni les mêmes URL, ni la même façon de nommer une page.

**Aucune donnée.** Le paquet interroge des API publiques ; il n'embarque ni la
liste des communes ni celle des départements.

**Aucune dépendance à un moteur d'exécution.** Pas de `cloudflare:workers`, pas
de variable de build, pas de base de données : quinze modules qui n'utilisent que
`fetch` et le calcul. C'est cette pureté qui rend le paquet transportable, et
c'est le critère qui a servi à tracer sa frontière.

## Installer

```bash
npm install github:florianmousseau/parcellaire
```

## Un exemple

```ts
import { chercher } from 'parcellaire/ban';
import { parcellesAutour, rattacherLaParcelle } from 'parcellaire/cadastre';
import { dessiner, cadreSurLObjet } from 'parcellaire/plan';

const trouvailles = await chercher('22 rue Émile Chaillou Trélazé');
```

## Mesurer

```bash
npm run gate
```

Format, lint, types, et les tests unitaires. Aucun test ne touche le réseau :
ce qui se calcule se teste, ce qui s'appelle se mesure sur le site.

## Licence

MIT.

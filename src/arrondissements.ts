/*
 * PARIS, LYON ET MARSEILLE : L'ARRONDISSEMENT A UN CODE, LES SOURCES NE LE
 * TRAITENT PAS PAREIL.
 *
 * Ces quarante-cinq codes sont des subdivisions de la COMMUNE, pas des
 * communes. Chaque source choisit son camp, et les deux choix se paient :
 *
 *   - le plan cadastral ne connait QUE les trois villes : `?code_insee=75102`
 *     rend zero parcelle, `75056` en rend douze ;
 *   - le geocodeur inverse rend le code de l'arrondissement (`citycode`
 *     75102) avec le nom de la ville (`city` « Paris ») - un couple faux, dont
 *     le nom fabrique une adresse de page qui n'est pas la bonne.
 *
 * D'ou ce module : le code a poser dans une requete, et le nom a afficher.
 * Ce n'est pas la liste des communes que le paquet s'interdit d'embarquer,
 * mais trois plages fermees du code officiel geographique.
 */

const VILLES_A_ARRONDISSEMENTS: readonly {
	readonly ville: string;
	readonly nom: string;
	readonly premier: number;
	readonly dernier: number;
}[] = [
	{ ville: '75056', nom: 'Paris', premier: 75101, dernier: 75120 },
	{ ville: '69123', nom: 'Lyon', premier: 69381, dernier: 69389 },
	{ ville: '13055', nom: 'Marseille', premier: 13201, dernier: 13216 }
];

/* La Corse rend `NaN` et ne tombe dans aucune plage, ce qui est la reponse. */
const arrondissementDe = (insee: string) => {
	const code = Number(insee);
	return Number.isInteger(code)
		? (VILLES_A_ARRONDISSEMENTS.find((v) => code >= v.premier && code <= v.dernier) ?? null)
		: null;
};

/** Vrai pour les vingt de Paris, les neuf de Lyon et les seize de Marseille. */
export const estUnArrondissement = (insee: string): boolean => arrondissementDe(insee) !== null;

/**
 * Le code commune sous lequel le cadastre range une parcelle.
 *
 * Le code lu dans l'identifiant partout, SAUF dans les 45 arrondissements, qui
 * n'existent pas au plan cadastral.
 */
export const communeDuCadastre = (insee: string): string => arrondissementDe(insee)?.ville ?? insee;

/**
 * Le nom d'une commune, arrondissement compris.
 *
 * Le nom du code officiel geographique se CALCULE a partir du code, et c'est
 * lui qui nomme la page : « Paris 2e Arrondissement », pas « Paris ». Le nom
 * rendu par la source passe tel quel partout ailleurs.
 */
export function nomDeLaCommune(insee: string, nomRendu: string): string {
	const trouve = arrondissementDe(insee);
	if (trouve === null) return nomRendu;
	const rang = Number(insee) - trouve.premier + 1;
	return `${trouve.nom} ${rang}${rang === 1 ? 'er' : 'e'} Arrondissement`;
}

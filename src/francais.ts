/*
 * « Cadastre de Arras ».
 *
 * La faute existait des le premier jour, sur six des quarante-sept communes du
 * Val-de-Marne. Elle a cesse d'etre une coquille le 2026-09-05, quand les
 * 34 933 communes sont entrees au plan du site : **6 481 d'entre elles, soit
 * 18,6 %, demandent une elision ou un article contracte**. Trois mille cinq cent
 * quatre-vingt-dix-sept commencent par une voyelle, six cent soixante et un par un h, sept cent
 * cinquante-sept par « Le », mille cinquante-quatre par « La », trois cent
 * trente et une par « Les », quatre-vingt-un par « L' ».
 *
 * Une page qui ecrit « Cadastre de Le Mans » dans son titre le dit a Google et
 * a qui lit le resultat. Ce n'est pas de la coquetterie : c'est le genre de
 * detail qui fait la difference entre un texte ecrit et un gabarit rempli, et
 * un gabarit rempli est exactement ce qu'on reproche aux catalogues.
 *
 * LA SEULE AMBIGUITE RESTANTE EST LE H ASPIRE, et elle est assumee. « Le Havre »
 * tombe sous la regle de l'article et sort juste (« du Havre ») ; restent les
 * noms a h initial sans article, ou l'usage hesite - on ecrit « d'Hagetmau »
 * aussi souvent que « de Hagetmau ». L'elision est choisie parce qu'elle est
 * juste sur l'immense majorite (Hérouville, Hyères, Honfleur) et que l'autre
 * regle demanderait une liste d'exceptions que personne ne tiendrait a jour.
 */

const VOYELLE = /^[aeiouyàâäéèêëîïôöùûü]/i;

/**
 * Le nom d'une commune precede de « de », avec l'article contracte.
 *
 * « Arras » -> « d'Arras », « Le Mans » -> « du Mans », « La Rochelle » ->
 * « de la Rochelle », « Les Sables-d'Olonne » -> « des Sables-d'Olonne »,
 * « L'Isle-Adam » -> « de l'Isle-Adam », « Nantes » -> « de Nantes ».
 */
export function deLaCommune(nom: string): string {
	if (nom.startsWith('Les ')) return `des ${nom.slice(4)}`;
	if (nom.startsWith('Le ')) return `du ${nom.slice(3)}`;
	if (nom.startsWith('La ')) return `de la ${nom.slice(3)}`;
	/* L'apostrophe est la DROITE, comme partout sur ce site : `AGENTS.md` bannit
	   la courbe, et la Base Adresse Nationale sert la droite. */
	if (nom.startsWith("L'")) return `de l'${nom.slice(2)}`;
	return VOYELLE.test(nom) || nom.startsWith('H') || nom.startsWith('h') ? `d'${nom}` : `de ${nom}`;
}

/**
 * Le nom d'une commune precede de « a ».
 *
 * Meme regle d'article, autre preposition : « a Nantes », « au Mans », « aux
 * Sables-d'Olonne », « a la Rochelle », « a l'Isle-Adam ». Une voyelle ne change
 * rien ici - « a Arras » s'ecrit sans elision.
 */
export function aLaCommune(nom: string): string {
	if (nom.startsWith('Les ')) return `aux ${nom.slice(4)}`;
	if (nom.startsWith('Le ')) return `au ${nom.slice(3)}`;
	if (nom.startsWith('La ')) return `à la ${nom.slice(3)}`;
	if (nom.startsWith("L'")) return `à l'${nom.slice(2)}`;
	return `à ${nom}`;
}

/**
 * Un cap precede de son article : « vers le nord », mais « vers l'est ».
 *
 * La page de voie servait « vers le est » en production le 2026-09-05. Seuls
 * `est` et `ouest` commencent par une voyelle ; les six autres caps prennent
 * l'article plein, y compris ceux qui les contiennent - « vers le nord-est ».
 */
export const versLeCap = (cap: string): string =>
	VOYELLE.test(cap) ? `vers l'${cap}` : `vers le ${cap}`;

/*
 * L'ARTICLE D'UN DEPARTEMENT NE SE DEDUIT PAS DE SON NOM, et c'est pour ca que
 * cette table existe alors que celle des communes n'existe pas.
 *
 * Une commune se plie a quatre regles (« Le », « La », « Les », « L' ») parce
 * que son article est ECRIT dans son nom. Un departement porte le sien dans le
 * genre du fleuve, du massif ou de la province qui le nomme, et rien dans la
 * chaine ne le dit : la Mayenne et le Morbihan s'ecrivent pareil, l'Aisne est
 * feminin et l'Allier masculin. Les pluriels ne se voient pas non plus - les
 * Landes et la Manche finissent toutes deux par une consonne muette.
 *
 * Cent une entrees ecrites a la main, une fois. C'est la forme « de » qui est
 * stockee, entiere : elle est ce que les pages emploient, et une regle qui
 * recomposerait « de » + article rendrait la table plus difficile a relire pour
 * ne rien economiser.
 */
const DU_DEPARTEMENT: Record<string, string> = {
	'01': "de l'Ain",
	'02': "de l'Aisne",
	'03': "de l'Allier",
	'04': 'des Alpes-de-Haute-Provence',
	'05': 'des Hautes-Alpes',
	'06': 'des Alpes-Maritimes',
	'07': "de l'Ardèche",
	'08': 'des Ardennes',
	'09': "de l'Ariège",
	'10': "de l'Aube",
	'11': "de l'Aude",
	'12': "de l'Aveyron",
	'13': 'des Bouches-du-Rhône',
	'14': 'du Calvados',
	'15': 'du Cantal',
	'16': 'de la Charente',
	'17': 'de la Charente-Maritime',
	'18': 'du Cher',
	'19': 'de la Corrèze',
	'21': "de la Côte-d'Or",
	'22': "des Côtes-d'Armor",
	'23': 'de la Creuse',
	'24': 'de la Dordogne',
	'25': 'du Doubs',
	'26': 'de la Drôme',
	'27': "de l'Eure",
	'28': "d'Eure-et-Loir",
	'29': 'du Finistère',
	'30': 'du Gard',
	'31': 'de la Haute-Garonne',
	'32': 'du Gers',
	'33': 'de la Gironde',
	'34': "de l'Hérault",
	'35': "d'Ille-et-Vilaine",
	'36': "de l'Indre",
	'37': "d'Indre-et-Loire",
	'38': "de l'Isère",
	'39': 'du Jura',
	'40': 'des Landes',
	'41': 'de Loir-et-Cher',
	'42': 'de la Loire',
	'43': 'de la Haute-Loire',
	'44': 'de la Loire-Atlantique',
	'45': 'du Loiret',
	'46': 'du Lot',
	'47': 'de Lot-et-Garonne',
	'48': 'de la Lozère',
	'49': 'de Maine-et-Loire',
	'50': 'de la Manche',
	'51': 'de la Marne',
	'52': 'de la Haute-Marne',
	'53': 'de la Mayenne',
	'54': 'de Meurthe-et-Moselle',
	'55': 'de la Meuse',
	'56': 'du Morbihan',
	'57': 'de la Moselle',
	'58': 'de la Nièvre',
	'59': 'du Nord',
	'60': "de l'Oise",
	'61': "de l'Orne",
	'62': 'du Pas-de-Calais',
	'63': 'du Puy-de-Dôme',
	'64': 'des Pyrénées-Atlantiques',
	'65': 'des Hautes-Pyrénées',
	'66': 'des Pyrénées-Orientales',
	'67': 'du Bas-Rhin',
	'68': 'du Haut-Rhin',
	'69': 'du Rhône',
	'70': 'de la Haute-Saône',
	'71': 'de Saône-et-Loire',
	'72': 'de la Sarthe',
	'73': 'de la Savoie',
	'74': 'de la Haute-Savoie',
	'75': 'de Paris',
	'76': 'de la Seine-Maritime',
	'77': 'de Seine-et-Marne',
	'78': 'des Yvelines',
	'79': 'des Deux-Sèvres',
	'80': 'de la Somme',
	'81': 'du Tarn',
	'82': 'de Tarn-et-Garonne',
	'83': 'du Var',
	'84': 'du Vaucluse',
	'85': 'de la Vendée',
	'86': 'de la Vienne',
	'87': 'de la Haute-Vienne',
	'88': 'des Vosges',
	'89': "de l'Yonne",
	'90': 'du Territoire de Belfort',
	'91': "de l'Essonne",
	'92': 'des Hauts-de-Seine',
	'93': 'de la Seine-Saint-Denis',
	'94': 'du Val-de-Marne',
	'95': "du Val-d'Oise",
	'971': 'de la Guadeloupe',
	'972': 'de la Martinique',
	'973': 'de la Guyane',
	'974': 'de La Réunion',
	'976': 'de Mayotte',
	'2A': 'de la Corse-du-Sud',
	'2B': 'de la Haute-Corse'
};

/**
 * Le nom d'un departement precede de « de », par son CODE.
 *
 * Par le code et non par le nom : deux departements portent un nom qui ne
 * differe que par un mot (« Haute-Corse », « Corse-du-Sud ») et le code est la
 * seule cle que le reste du site manipule. Un code inconnu rend une chaine
 * vide, jamais « de undefined » - l'appelant doit alors se taire.
 */
export function duDepartement(code: string): string {
	return DU_DEPARTEMENT[code] ?? '';
}

/** Les departements dont l'article est ecrit, pour que le banc les compte tous. */
export const DEPARTEMENTS_ARTICULES = Object.keys(DU_DEPARTEMENT);

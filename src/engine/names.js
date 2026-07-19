/* Geração de nomes — jogadores (com nacionalidade), managers simulados e clubes. */

const PT_FIRST = [
  "João", "Tiago", "Miguel", "Rui", "Pedro", "André", "Bruno", "Diogo", "Gonçalo", "Rafael",
  "Ricardo", "Nuno", "Hugo", "Fábio", "Vasco", "Tomás", "Duarte", "Afonso", "Martim", "Simão",
  "Carlos", "Paulo", "Sérgio", "Marco", "Vítor", "Daniel", "Renato", "Leandro", "Luís", "Filipe",
  "Alexandre", "Guilherme", "Henrique", "Bernardo", "Francisco", "Rodrigo", "Samuel", "Xavier",
];
const PT_LAST = [
  "Silva", "Santos", "Ferreira", "Pereira", "Oliveira", "Costa", "Rodrigues", "Martins", "Sousa", "Fernandes",
  "Gonçalves", "Gomes", "Lopes", "Marques", "Alves", "Almeida", "Ribeiro", "Pinto", "Carvalho", "Teixeira",
  "Moreira", "Correia", "Mendes", "Nunes", "Soares", "Vieira", "Monteiro", "Cardoso", "Rocha", "Neves",
  "Coelho", "Cruz", "Cunha", "Pires", "Ramos", "Reis", "Simões", "Antunes", "Matos", "Fonseca",
  "Machado", "Barbosa", "Tavares", "Lourenço", "Azevedo", "Freitas", "Borges", "Faria", "Amaral", "Baptista",
];

/* Nacionalidades: Portugal domina, com estrangeiros à mistura (como no 11x11). */
export const NATIONS = [
  { code: "PT", flag: "🇵🇹", w: 62, first: PT_FIRST, last: PT_LAST },
  { code: "BR", flag: "🇧🇷", w: 8, first: ["Carlinhos", "Ronaldinho", "Juninho", "Marcelo", "Thiago", "Wesley", "Caio", "Matheus", "Gustavo", "Vinícius"], last: ["do Nascimento", "de Souza", "Pereira", "Cavalcanti", "Batista", "Moraes", "Santana", "Barros"] },
  { code: "ES", flag: "🇪🇸", w: 6, first: ["Álvaro", "Sergio", "Iker", "Pablo", "Javier", "Adrián", "Marcos", "Raúl"], last: ["García", "Fernández", "López", "Martínez", "Sánchez", "Torres", "Navarro", "Ruiz"] },
  { code: "DE", flag: "🇩🇪", w: 6, first: ["Lukas", "Felix", "Jonas", "Maximilian", "Tobias", "Niklas", "Fabian", "Poldi"], last: ["Müller", "Schmidt", "Wagner", "Becker", "Hoffmann", "Krüger", "Rudwaleit", "Capobianco"] },
  { code: "GB", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", w: 6, first: ["Harry", "Jack", "Oliver", "George", "Charlie", "Hope", "Alfie", "Ben"], last: ["Smith", "Jackson", "Taylor", "Brown", "Wilson", "Davies", "Evans", "Walker"] },
  { code: "IT", flag: "🇮🇹", w: 5, first: ["Marco", "Luca", "Alessandro", "Matteo", "Camillo", "Giovanni", "Federico", "Simone"], last: ["Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano", "Donati", "Greco"] },
  { code: "FR", flag: "🇫🇷", w: 4, first: ["Antoine", "Hugo", "Louis", "Théo", "Lucas", "Nathan", "Enzo", "Léo"], last: ["Martin", "Bernard", "Dubois", "Moreau", "Laurent", "Girard", "Lefevre", "Roux"] },
  { code: "TR", flag: "🇹🇷", w: 3, first: ["Engin", "Emre", "Burak", "Hakan", "Arda", "Cenk", "Mert", "Ozan"], last: ["Yakut", "Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Aydın", "Öztürk"] },
];

const CLUB_PREFIX = [
  "Sporting", "Atlético", "União", "Real", "Estrela", "Académico", "Operário", "Juventude",
  "Vitória", "Nacional", "Leões", "Águias", "Dragões", "Lobos", "Furacão", "Relâmpago",
  "Independente", "Portuense", "Marítimo", "Ribeirense",
];
const CLUB_SUFFIX = [
  "do Norte", "do Sul", "da Serra", "do Mar", "de Aldeia Nova", "de Vila Franca", "do Vale",
  "da Foz", "de São Pedro", "das Colinas", "da Ribeira", "do Monte", "de Riba d'Ave",
  "da Costa", "do Cabo", "de Alvalede", "da Fronteira", "do Lima", "de Vale Verde", "da Lagoa",
];

const USER_WORDS = [
  "King", "Pro", "Master", "Boss", "Craque", "Mister", "Lenda", "Golo", "Magico", "Rei",
  "Capitao", "Bomber", "Falcao", "Tuga", "Furia", "Ninja", "Aguia", "Leao", "Dragao", "Lobo",
];

export const pickFrom = (rng, arr) => arr[Math.floor(rng() * arr.length)];

export const pickNation = (rng) => {
  const total = NATIONS.reduce((s, n) => s + n.w, 0);
  let r = rng() * total;
  for (const n of NATIONS) {
    r -= n.w;
    if (r <= 0) return n;
  }
  return NATIONS[0];
};

export const playerIdentity = (rng) => {
  const nat = pickNation(rng);
  return { name: `${pickFrom(rng, nat.first)} ${pickFrom(rng, nat.last)}`, nat: nat.code, flag: nat.flag };
};

export const clubName = (rng) => `${pickFrom(rng, CLUB_PREFIX)} ${pickFrom(rng, CLUB_SUFFIX)}`;

export const managerName = (rng) => {
  const style = rng();
  const num = rng() < 0.55 ? String(Math.floor(rng() * 99)).padStart(2, "0") : "";
  if (style < 0.4) return `${pickFrom(rng, PT_FIRST)}${pickFrom(rng, USER_WORDS)}${num}`;
  if (style < 0.7) return `${pickFrom(rng, USER_WORDS)}${pickFrom(rng, PT_LAST)}${num}`;
  return `${pickFrom(rng, PT_FIRST)}_${pickFrom(rng, PT_LAST)}${num}`;
};

// PRNG determinístico (mulberry32) — para sintetizar plantéis de bots a partir do id.
export const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

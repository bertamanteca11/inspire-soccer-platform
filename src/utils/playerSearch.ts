import type { Player } from '../types';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();

export function matchesPlayerSearch(player: Player, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const name = normalize([player.name,player.display_name,player.nickname,player.shirt_number].filter(value => value != null).join(' '));
  return words.every(word => name.includes(word));
}

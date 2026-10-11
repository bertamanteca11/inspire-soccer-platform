import type { Player } from '../types';
export const avatarOptions = [
  {id:'short',name:'Pelo corto'}, {id:'curly',name:'Pelo rizado'},
  {id:'long',name:'Pelo largo'}, {id:'buzz',name:'Rapado'},
  {id:'blond',name:'Pelo rubio'}, {id:'dark',name:'Pelo oscuro'},
];
export function PlayerAvatar({player,large=false}:{player:Pick<Player,'photo_url'|'display_name'>;large?:boolean}){
 const photo=player.photo_url||'';
 if(photo && !photo.startsWith('avatar:')) return <img className={large?'player-photo large':'player-photo'} src={photo} alt={player.display_name} />;
 const variant=photo.startsWith('avatar:')?photo.slice(7):'short';
 const hair=variant==='blond'?'#d6a64e':variant==='dark'?'#171b27':'#45342e';
 return <div className={large?'player-photo large illustrated-avatar':'player-photo illustrated-avatar'} role="img" aria-label={'Avatar de '+player.display_name}>
  <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
   <circle cx="50" cy="50" r="49" fill="#d9e5ed"/>
   <path d="M8 100 Q11 69 34 67 L66 67 Q90 69 92 100Z" fill="#122c55"/>
   <path d="M38 67 L50 80 L62 67" fill="none" stroke="#e6f1ff" strokeWidth="3"/>
   <rect x="42" y="57" width="16" height="16" rx="6" fill="#d8a27f"/>
   <ellipse cx="50" cy="43" rx="23" ry="27" fill="#d8a27f"/>
   {variant==='buzz'?<path d="M28 39 Q27 16 50 16 Q74 16 72 39 L69 30 Q50 23 31 31Z" fill={hair}/>:
    variant==='curly'?<><path d="M26 42 Q19 13 48 15 Q81 11 75 43 L69 29 Q52 27 31 34Z" fill={hair}/>{[29,39,49,59,69].map((x,i)=><circle key={x} cx={x} cy={22+(i%2)*-5} r="9" fill={hair}/>)}</>:
    variant==='long'?<path d="M26 70 L25 36 Q25 13 50 15 Q76 13 75 36 L76 70 L68 67 L68 33 Q49 25 32 35 L32 67Z" fill={hair}/>:
    <path d="M27 42 Q22 15 48 15 Q77 13 74 41 L69 30 Q50 28 30 35Z" fill={hair}/>}
   <circle cx="41" cy="45" r="2" fill="#30303b"/><circle cx="59" cy="45" r="2" fill="#30303b"/>
   <path d="M44 56 Q50 60 56 56" fill="none" stroke="#925c4d" strokeWidth="2" strokeLinecap="round"/>
  </svg>
 </div>;
}

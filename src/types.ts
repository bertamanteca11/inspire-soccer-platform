export type Role='admin'|'coach'|'viewer';
export type Session={id:string;name:string;session_date:string;type:string;status:string;opponent?:string|null;high_rating_limit:number};
export type Player={id:string;name:string;nickname?:string|null;display_name:string;position?:string|null;shirt_number?:number|null;status:string};
export type Attendance={id:string;session_id:string;player_id:string;status:string;notes?:string|null};
export type Evaluation={id:string;session_id:string;player_id:string;tactical_discipline:number;effort_commitment:number;decision_making:number;mentality_attitude:number;coachability:number;comment?:string|null;evaluated:boolean;total_score:number};

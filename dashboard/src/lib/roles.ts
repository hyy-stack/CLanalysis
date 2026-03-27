export interface Person {
  name: string;
  role: string;
  manager: string;
}

export const ROSTER: Person[] = [
  { name: 'Dan Burrill',       role: 'CRO',                              manager: '' },
  { name: 'Alivia Schlueter',  role: 'Enterprise AE',                    manager: 'Dan Gronski' },
  { name: 'Hannah Franzen',    role: 'Enterprise AE',                    manager: 'Dan Gronski' },
  { name: 'Sam Johnson',       role: 'Enterprise AE',                    manager: 'Dan Gronski' },
  { name: 'Connor Yakushi',    role: 'Enterprise AE',                    manager: 'Dan Gronski' },
  { name: 'Samuel Baker',      role: 'Mid-Market AE',                    manager: 'Jack Alexander' },
  { name: 'Katie Reilly',      role: 'Mid-Market AE',                    manager: 'Jack Alexander' },
  { name: 'Darius Tan',        role: 'Mid-Market AE',                    manager: 'Jack Alexander' },
  { name: 'Jake Ferman',       role: 'Commercial AE',                    manager: 'Zak Sanderson' },
  { name: 'Harrison Tan',      role: 'Commercial AE',                    manager: 'Zak Sanderson' },
  { name: 'Jack Denhart',      role: 'Commercial AE',                    manager: 'Zak Sanderson' },
  { name: 'Zoe Hundertmark',   role: 'Commercial AE',                    manager: 'Zak Sanderson' },
  { name: 'Josh Musler',       role: 'Commercial AE',                    manager: 'Zak Sanderson' },
  { name: 'Maya Schumb',       role: 'Commercial AE',                    manager: 'Zak Sanderson' },
  { name: 'Rydian Searles',    role: 'Sales Development Representative', manager: 'Dan Gronski' },
  { name: 'Yana Bogoev',       role: 'Sales Development Representative', manager: 'Dan Gronski' },
  { name: 'Zak Sanderson',     role: 'Commercial Sales Manager',         manager: 'Dan Burrill' },
  { name: 'Jack Alexander',    role: 'Mid-Market Sales Manager',         manager: 'Dan Burrill' },
  { name: 'Clare Peterson',    role: 'Head of Activation',               manager: 'Dan Burrill' },
  { name: 'Steve Hackney',     role: 'Head of Solutions & Enablement',   manager: 'Dan Burrill' },
  { name: 'Dan Gronski',       role: 'Enterprise Sales Manager',         manager: 'Dan Burrill' },
  { name: 'Kelsey Aina',       role: 'Head of Partnerships',             manager: 'Dan Burrill' },
  { name: 'Autumn Carter',     role: 'Partner Manager',                  manager: 'Kelsey Aina' },
  { name: 'Doreen Leong',      role: 'Partner Manager',                  manager: 'Kelsey Aina' },
  { name: 'Ian Cugniere',      role: 'Partner Manager',                  manager: 'Kelsey Aina' },
  { name: "Garrett O'Toole",   role: 'Partner Manager',                  manager: 'Kelsey Aina' },
  { name: 'Elaine Toledo',     role: 'Enterprise Account Manager',       manager: 'Clare Peterson' },
  { name: 'Spencer Stitt',     role: 'Enterprise Account Manager',       manager: 'Clare Peterson' },
  { name: 'Ethan Giacalone',   role: 'Enterprise Account Manager',       manager: 'Clare Peterson' },
];

/** Everyone who directly manages at least one person. */
export const MANAGERS = Array.from(
  new Set(ROSTER.map(p => p.manager).filter(Boolean))
).sort();

/** Direct reports for a given manager name. */
export function getTeamMembers(managerName: string): Person[] {
  return ROSTER.filter(p => p.manager === managerName);
}

/** Short role badge label. */
export function roleBadge(role: string): string {
  if (role.includes('Enterprise AE'))             return 'Ent AE';
  if (role.includes('Mid-Market AE'))             return 'MM AE';
  if (role.includes('Commercial AE'))             return 'Comm AE';
  if (role.includes('Account Manager'))           return 'AM';
  if (role.includes('Partner Manager'))           return 'Partner';
  if (role.includes('Sales Development'))         return 'SDR';
  if (role.includes('Sales Manager'))             return 'Manager';
  if (role.includes('Head of Activation'))        return 'Activation';
  if (role.includes('Head of Partnerships'))      return 'Partnerships';
  if (role.includes('Head of Solutions'))         return 'Solutions';
  if (role === 'CRO')                             return 'CRO';
  return role;
}

/** Tailwind classes for role badge. */
export function roleBadgeClass(role: string): string {
  if (role.includes('Enterprise AE'))             return 'bg-purple-100 text-purple-700';
  if (role.includes('Mid-Market AE'))             return 'bg-sky-100 text-sky-700';
  if (role.includes('Commercial AE'))             return 'bg-teal-100 text-teal-700';
  if (role.includes('Account Manager'))           return 'bg-green-100 text-green-700';
  if (role.includes('Partner Manager'))           return 'bg-amber-100 text-amber-700';
  if (role.includes('Sales Development'))         return 'bg-pink-100 text-pink-700';
  if (role.includes('Manager') || role === 'CRO') return 'bg-gray-200 text-gray-700';
  return 'bg-gray-100 text-gray-600';
}

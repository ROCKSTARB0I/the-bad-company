// ============================================================================
// THE BAD COMPANY -- characters, an 18-level branching campaign, and the
// ending. Hotline-Miami-style dialogue: big text, colored speaker, typed out.
// ============================================================================

export const CHARS = {
  recker: {
    id: 'recker', name: 'RECKER', full: 'RECKER',
    tagline: 'He had a family on Tuesday.',
    color: '#ff2d3d', accent: '#ff6b52',
    floor: '#241014', wall: '#431d23', trim: '#6b2a30', fog: '#120609',
    hp: 100, speed: 11.4, start: 'colt-m1911',
    bio: `A man the Company made by accident. An entry team hit the wrong address on a
false alarm and cleared the house by the book. His wife, Ana. His son, who never got
a name. Recker was out in the garage with the radio on. They never checked the garage.`,
  },
  ron: {
    id: 'ron', name: 'RON', full: 'RON HALLECK',
    tagline: 'Badge 4471. He signs the paperwork.',
    color: '#4ec8ff', accent: '#8be9ff',
    floor: '#0e1720', wall: '#1d3040', trim: '#2f4c62', fog: '#060b10',
    hp: 115, speed: 10.6, start: 'sig-p226',
    bio: `Six years on a Bad Company entry team. He writes the after-action reports.
He has started reading them twice. There is a draft in his outbox he has not sent.`,
  },
  john: {
    id: 'john', name: 'JOHN', full: 'JOHN ARDEN',
    tagline: 'Freelance. Nobody prints him anymore.',
    color: '#5dff9b', accent: '#c8ff6b',
    floor: '#0d1a12', wall: '#1c3123', trim: '#2e4d36', fog: '#050c08',
    hp: 85, speed: 12.2, start: 'remington-model-870',
    bio: `A journalist with one source and no editor. He took a call from a man who
would not give a name, only a badge number. Then he rented a house he could see the
Company's fence from, and started counting trucks.`,
  },
  vance: {
    id: 'vance', name: 'VANCE', full: 'DALE "CUTTER" VANCE',
    tagline: 'He was point man on the false alarm.',
    color: '#ffb020', accent: '#ffe27a',
    floor: '#1d1608', wall: '#33290f', trim: '#544319', fog: '#0d0a04',
    hp: 135, speed: 10.2, start: 'heckler-koch-mp5',
    bio: `The man who went through Recker's front door first. The Company has decided
that raid never happened — and that means neither did the six men who ran it.
They are closing the file. He is on the last page of it.`,
  },

  // ---- BONUS CAMPAIGN CAST ------------------------------------------------
  nora: {
    id: 'nora', name: 'NORA', full: 'NORA VASQUEZ',
    tagline: 'Office of Contract Compliance. She reads the footnotes.',
    color: '#a86bff', accent: '#d9b6ff',
    floor: '#171226', wall: '#2a2140', trim: '#463668', fog: '#0a0713',
    hp: 90, speed: 11.8, start: 'glock-19',
    bio: `Twelve years signing off on other people's arithmetic. She is not brave.
She is thorough, which turns out to be considerably worse for everyone involved.
She went to Meridian to certify a routine transfer of assets and found the Bad
Company's serial numbers on every page.`,
  },
  wren: {
    id: 'wren', name: 'WREN', full: 'WREN',
    tagline: 'Meridian does not have a cleanup crew. It has a phone number.',
    color: '#22d3c5', accent: '#8ff5ea',
    floor: '#0d1c1c', wall: '#17302f', trim: '#28514e', fog: '#050f0f',
    hp: 105, speed: 12.4, start: 'heckler-koch-mp5sd',
    bio: `Forty-one incidents closed. Forty-one times the paperwork came out clean
and nobody ever knew there had been an incident at all. Wren has never once
fired a shot in anger, which is not the same as never having fired one.
The forty-second file is a woman with a clipboard who did nothing wrong.`,
  },
  bajic: {
    id: 'bajic', name: 'BAJIC', full: 'EMIL BAJIC',
    tagline: 'Seventeen months. He was not at Galloway.',
    color: '#b8c4d4', accent: '#e8f0f8',
    floor: '#1b1e22', wall: '#2e343c', trim: '#4a5462', fog: '#090b0e',
    hp: 145, speed: 9.8, start: 'mossberg-590',
    bio: `He went down on the Halleck testimony with everyone else who had ever
worn the patch. Seventeen months. He was not at Galloway — he has explained
this to parole boards, to reporters, and to a bathroom mirror. Nobody has ever
cared, and now the successor company would like him back, or quiet.`,
  },
};

// ---------------------------------------------------------------------------
// CAMPAIGN -- 18 levels. `gen` drives the building generator (see worldgen.js).
// ---------------------------------------------------------------------------
export const LEVELS = [

  // ======================= ACT I -- THE LIST ===============================
  // --- PROLOGUE: the night it happened. Playable, no combat. -------------
  {
    id: 'prologue', char: 'recker', act: 0, kind: 'prologue',
    title: 'GALLOWAY', sub: '4127 GALLOWAY DRIVE — ELEVEN MONTHS AGO — 04:11',
    objective: 'GO INSIDE.',
    gen: { theme: 'house', w: 28, h: 22, rooms: 6, enemies: 0, tier: 0, prologue: true },
    intro: [
      { who: '', text: 'A Tuesday. The garage light is on because he is fixing a bicycle.', c: '#888' },
      { who: '', text: 'It is a small bicycle. It is nobody\'s birthday for another month.', c: '#888' },
      { who: 'ANA', text: 'Are you coming to bed or are you sleeping out there', c: '#ffd7d7' },
      { who: 'RECKER', text: 'Ten minutes.' },
      { who: 'ANA', text: 'You said ten minutes at nine', c: '#ffd7d7' },
      { who: 'RECKER', text: 'And I meant it at nine.' },
      { who: 'ANA', text: 'He kicked. Come feel it before he stops', c: '#ffd7d7' },
      { who: 'RECKER', text: 'Ten minutes. Then I\'m all yours, both of you.' },
      { who: '', text: '—', c: '#888' },
      { who: '', text: '04:11. A van stops outside with its headlights already off.', c: '#888' },
      { who: '', text: 'The garage radio is loud. He does not hear the door go in.', c: '#888' },
      { who: '', text: 'He hears the rest of it.', c: '#666' },
    ],
    outro: [
      { who: '', text: 'It lasted nine seconds. He counted them later, from the recording,', c: '#888' },
      { who: '', text: 'the one time anybody let him near a recording.', c: '#888' },
      { who: '', text: 'Nine seconds, and then men talking normally in his kitchen.', c: '#888' },
      { who: '', text: 'One of them said the address out loud and got it wrong.', c: '#888' },
      { who: '', text: 'Nobody checked the garage.', c: '#666' },
      { who: '', text: '—', c: '#888' },
      { who: '', text: 'ELEVEN MONTHS LATER', c: '#ff2d3d' },
    ],
  },

  {
    id: 'recker_1', char: 'recker', act: 1, requires: 'prologue',
    title: 'VELOUR', sub: 'NIGHTCLUB — LOWER MARKET ST — 01:14',
    objective: 'A COMPANY MAN IS DRINKING IN HERE. TAKE HIM ALIVE.',
    gen: { theme: 'nightclub', w: 46, h: 34, rooms: 9, enemies: 16, tier: 1,
           civilians: 45, target: true },
    intro: [
      { who: '', text: 'The Bad Company drinks at one address and one address only.', c: '#888' },
      { who: '', text: 'It has a velvet rope and a two-drink minimum.', c: '#888' },
      { who: 'RECKER', text: 'I keep a list.' },
      { who: 'RECKER', text: 'Tonight I only need one name off it. Breathing.' },
      { who: '', text: 'You are RECKER. Four hundred people are dancing in there.', c: '#888' },
      { who: '', text: 'None of them know anything. Nine of them are armed.', c: '#888' },
      { who: 'RECKER', text: 'Then let\'s find out who runs when the music stops.' },
    ],
    outro: [
      { who: '', text: 'The house lights are up. The floor is empty. The music is still going.', c: '#888' },
      { who: 'RECKER', text: 'Your ledger. Where.' },
      { who: 'COMPANY MAN', text: "Records annex — off Ninth — please, man, I do payroll—", c: '#dddddd' },
      { who: 'RECKER', text: 'Payroll.' },
      { who: 'RECKER', text: 'Somebody paid them for that night. That was you.' },
      { who: 'COMPANY MAN', text: 'It was a line item. It was a LINE ITEM—', c: '#dddddd' },
    ],
  },

  {
    id: 'ron_1', char: 'ron', act: 1, kind: 'choice',
    title: 'COMPLIANCE', sub: 'HALLECK RESIDENCE — 01:52',
    objective: 'THE EMAIL IS WRITTEN. SEND IT, OR DELETE IT.',
    gen: { theme: 'house', w: 26, h: 20, rooms: 5, enemies: 0, tier: 0, terminal: true },
    intro: [
      { who: '', text: 'Two hundred miles away, a man cannot sleep.', c: '#888' },
      { who: 'RON', text: 'I wrote it three weeks ago.' },
      { who: 'RON', text: "I've opened it every night since." },
      { who: '', text: 'You are RON HALLECK. Walk to the desk. Decide.', c: '#888' },
    ],
  },
  {
    id: 'recker_2', char: 'recker', act: 1, requires: 'recker_1',
    title: 'PAPER TRAIL', sub: 'RECORDS ANNEX — 05:40',
    objective: 'THE LEDGER NAMES THIS BUILDING. LEAVE NOBODY IN IT.',
    gen: { theme: 'warehouse', w: 52, h: 38, rooms: 10, enemies: 15, tier: 1, cluster: 2 },
    intro: [
      { who: '', text: 'The payroll man was right about the annex. He was wrong about walking away.', c: '#888' },
      { who: 'RECKER', text: 'Page one is a list of addresses.' },
      { who: 'RECKER', text: 'Mine is on it. Underlined.' },
      { who: 'RECKER', text: 'Somebody underlined my house.' },
    ],
    outro: [
      { who: 'RECKER', text: 'Requisition forms. Overtime. A catering invoice.' },
      { who: 'RECKER', text: 'They ordered sandwiches for the night they did it.' },
    ],
  },
  {
    id: 'ron_2', char: 'ron', act: 1, requires: 'ron_1',
    title: 'SHIFT CHANGE', sub: 'SUBSTATION 9 — 22:40',
    objective: 'THE COMPANY SAYS THIS ADDRESS IS HOSTILE. GO IN ANYWAY.',
    gen: { theme: 'industrial', w: 44, h: 32, rooms: 8, enemies: 16, tier: 1 },
    introSent: [
      { who: '', text: 'The email went out at 01:57. Nothing has happened yet.', c: '#888' },
      { who: '', text: 'That is the worst part. Nothing has happened yet.', c: '#888' },
      { who: 'DISPATCH', text: 'HALLECK. STACK UP. HOSTILE ADDRESS.', c: '#ff2d3d' },
      { who: 'RON', text: '...Copy.' },
      { who: 'RON', text: "It's never a hostile address." },
    ],
    introKept: [
      { who: '', text: 'He deleted it. Emptied the folder. Emptied it again.', c: '#888' },
      { who: 'DISPATCH', text: 'HALLECK. STACK UP. HOSTILE ADDRESS.', c: '#ff2d3d' },
      { who: 'RON', text: 'Copy.' },
      { who: '', text: 'He does not ask what these people did. He stopped asking.', c: '#888' },
    ],
    outroSent: [
      { who: 'RON', text: 'Somebody at a newspaper has my badge number now.' },
      { who: 'RON', text: 'Good. Let it be somebody.' },
    ],
    outroKept: [
      { who: 'RON', text: 'Nobody knows. Nobody is ever going to know.' },
      { who: 'RON', text: "That's supposed to feel safer." },
    ],
  },
  {
    id: 'john_1', char: 'john', act: 1, requires: 'sent',
    title: 'LINE OF SIGHT', sub: 'RENTAL PROPERTY — 2.1 KM FROM THE FENCE',
    objective: 'THEY FOUND THE HOUSE. DO NOT LET THEM LEAVE.',
    gen: { theme: 'house', w: 38, h: 30, rooms: 7, enemies: 15, tier: 1, siege: true },
    intro: [
      { who: '', text: 'A phone rang in a newsroom nobody staffs after six.', c: '#888' },
      { who: 'JOHN', text: "He wouldn't give a name. Just a badge number." },
      { who: 'JOHN', text: 'Four-four-seven-one.' },
      { who: '', text: 'You are JOHN ARDEN. You rented a house you can see their fence from.', c: '#888' },
      { who: '', text: 'Headlights just came up the drive. Four vehicles.', c: '#888' },
      { who: 'JOHN', text: 'Okay. Okay. Okay.' },
    ],
    outro: [
      { who: 'JOHN', text: 'I have photographs of eleven men who do not exist.' },
      { who: 'JOHN', text: 'And now I have their van.' },
    ],
  },

  // ======================= ACT II -- THE FENCE =============================
  {
    id: 'recker_3', char: 'recker', act: 2, requires: 'recker_2',
    title: 'THE CONTRACTOR', sub: 'ARMS DEPOT — 11:20',
    objective: 'THE COMPANY BUYS ITS GUNS SOMEWHERE. GO SHOPPING.',
    gen: { theme: 'warehouse', w: 56, h: 40, rooms: 11, enemies: 24, tier: 2, armory: true },
    intro: [
      { who: '', text: 'The ledger has a supplier column.', c: '#888' },
      { who: 'RECKER', text: 'Everything they used on my family has a serial number.' },
      { who: 'RECKER', text: 'And a receipt.' },
      { who: 'RECKER', text: "I'd like to see the rest of the catalogue." },
    ],
    outro: [
      { who: 'RECKER', text: "Take what you can carry, they said." },
      { who: 'RECKER', text: 'I can carry a lot.' },
    ],
  },
  {
    id: 'john_2', char: 'john', act: 2, requires: 'sent',
    title: 'THE FENCE', sub: 'COMPOUND PERIMETER — 02:00',
    objective: 'GET INSIDE. PHOTOGRAPH EVERYTHING. GET OUT.',
    gen: { theme: 'compound', w: 50, h: 36, rooms: 9, enemies: 20, tier: 2, stealthy: true },
    intro: [
      { who: 'JOHN', text: 'Nineteen trucks in, seventeen out. Every night.' },
      { who: 'JOHN', text: "I'm a features writer. I did a piece on artisanal bread." },
      { who: 'JOHN', text: "I don't know why I'm the one holding this." },
      { who: '', text: 'Because you answered the phone.', c: '#888' },
    ],
    outro: [
      { who: 'JOHN', text: 'Four hundred photographs.' },
      { who: 'JOHN', text: "Now I need somebody who'll swear to what's in them." },
    ],
  },
  {
    id: 'ron_3', char: 'ron', act: 2, requires: 'ron_2',
    title: 'AFTER ACTION', sub: 'INTERNAL REVIEW — 09:00',
    objective: 'THEY PULLED YOUR FILE. GET OUT OF THE BUILDING.',
    gen: { theme: 'office', w: 48, h: 34, rooms: 10, enemies: 18, tier: 2 },
    introSent: [
      { who: 'DISPATCH', text: 'HALLECK. REVIEW ROOM. BRING YOUR SIDEARM.', c: '#ff2d3d' },
      { who: 'RON', text: "They never ask you to bring your sidearm." },
      { who: '', text: 'They found the email. It took them nine days.', c: '#888' },
    ],
    introKept: [
      { who: 'DISPATCH', text: 'HALLECK. REVIEW ROOM. BRING YOUR SIDEARM.', c: '#ff2d3d' },
      { who: 'RON', text: 'I never sent anything. I never said anything.' },
      { who: '', text: 'It did not matter. He read the reports twice. Somebody noticed.', c: '#888' },
    ],
    outro: [
      { who: 'RON', text: 'Six years.' },
      { who: 'RON', text: 'Six years, and the second I hesitated they had a room ready.' },
    ],
  },
  {
    id: 'vance_1', char: 'vance', act: 2, requires: 'recker_3',
    title: 'HOUSEKEEPING', sub: 'COMPANY MOTOR POOL — 04:00',
    objective: 'YOUR OWN SQUAD IS HERE FOR YOU. GET TO THE CAR.',
    gen: { theme: 'industrial', w: 46, h: 36, rooms: 8, enemies: 22, tier: 2 },
    intro: [
      { who: '', text: 'The raid on the Recker house is not in any system.', c: '#888' },
      { who: '', text: 'Neither are the six men who ran it.', c: '#888' },
      { who: 'VANCE', text: 'I went through that door first.' },
      { who: 'VANCE', text: "I've told myself the alarm was real about a thousand times." },
      { who: 'VANCE', text: 'It gets less true every time.' },
      { who: '', text: 'You are DALE VANCE. They sent your own team for you.', c: '#888' },
    ],
    outro: [
      { who: 'VANCE', text: 'Ellis. Bray. Pardo.' },
      { who: 'VANCE', text: 'I taught two of them how to clear a corner.' },
    ],
  },
  {
    id: 'recker_4', char: 'recker', act: 2, requires: 'recker_3',
    title: 'NIGHT SHIFT', sub: 'CONTRACTED CLINIC — 01:00',
    objective: 'THIS IS WHERE THE PAPERWORK SAYS PEOPLE STOP EXISTING.',
    gen: { theme: 'clinic', w: 50, h: 36, rooms: 12, enemies: 26, tier: 2 },
    intro: [
      { who: '', text: 'Every body the Company makes comes through one address.', c: '#888' },
      { who: 'RECKER', text: 'They brought Ana here.' },
      { who: 'RECKER', text: 'Somebody signed her in at 05:12 and typed a cause of death.' },
      { who: 'RECKER', text: "I want to meet whoever can type at a time like that." },
    ],
    outro: [
      { who: 'RECKER', text: 'Intake log. Eleven months back.' },
      { who: 'RECKER', text: "Two names and a line that says 'unregistered, male, 31 weeks'." },
      { who: 'RECKER', text: '...' },
      { who: 'RECKER', text: "He'd have been eight months old this week." },
    ],
  },
  {
    id: 'john_3', char: 'john', act: 2, requires: 'sent',
    title: 'THE SOURCE', sub: 'MOTEL OFF THE 9 — 23:30',
    objective: 'YOUR SOURCE IS IN ROOM 14. SO IS EVERYONE ELSE.',
    gen: { theme: 'motel', w: 52, h: 30, rooms: 12, enemies: 21, tier: 2, escort: true },
    intro: [
      { who: 'JOHN', text: 'He said room fourteen. He said come alone.' },
      { who: 'JOHN', text: 'He also said "I think they know", which is a hell of a thing to add.' },
      { who: '', text: 'There are nine cars in a lot with four rooms occupied.', c: '#888' },
      { who: 'JOHN', text: 'Yeah. I can count.' },
    ],
    outro: [
      { who: 'RON', text: "You're the journalist." },
      { who: 'JOHN', text: "You're four-four-seven-one." },
      { who: 'RON', text: 'Ron. My name is Ron.' },
      { who: 'JOHN', text: 'Okay, Ron. Say it into the recorder.' },
    ],
  },

  // ======================= ACT III -- THE COMPANY ==========================
  {
    id: 'vance_2', char: 'vance', act: 3, requires: 'vance_1',
    title: 'THE FALSE ALARM', sub: '4127 CALLOWAY — ELEVEN MONTHS AGO — 04:11',
    objective: 'CLEAR THE HOUSE.',
    gen: { theme: 'house', w: 30, h: 24, rooms: 6, enemies: 0, tier: 0, flashback: true },
    intro: [
      { who: '', text: 'He goes back to it every night, so you have to go with him.', c: '#888' },
      { who: 'DISPATCH', text: 'CONFIRMED ARMED SUBJECT. 4127 CALLOWAY. GO.', c: '#ff2d3d' },
      { who: 'VANCE', text: 'Copy. Vance on point.' },
      { who: '', text: 'The address was 4127 Galloway. One letter.', c: '#888' },
      { who: '', text: 'Nobody in the van has ever read the warrant.', c: '#888' },
    ],
    outro: [
      { who: 'VANCE', text: 'There was a nursery.' },
      { who: 'VANCE', text: 'We stood in a half-painted nursery for eleven minutes.' },
      { who: 'VANCE', text: 'Then a man from the office came and took our helmet cameras.' },
      { who: 'VANCE', text: 'And that was the whole investigation.' },
    ],
  },
  {
    id: 'ron_4', char: 'ron', act: 3, requires: 'ron_3',
    title: 'THE WIRE', sub: 'FEDERAL BUILDING — 14:00',
    objective: 'YOU ARE WEARING A RECORDER INTO A COMPANY MEETING.',
    gen: { theme: 'office', w: 46, h: 34, rooms: 11, enemies: 24, tier: 3 },
    intro: [
      { who: 'JOHN', text: "Everything you say in there, I get." },
      { who: 'RON', text: 'And if they find it?' },
      { who: 'JOHN', text: '...I still get everything you say in there.' },
      { who: 'RON', text: 'Great. Great pep talk.' },
    ],
    outro: [
      { who: 'RON', text: 'Tell me you got it.' },
      { who: 'JOHN', text: 'I got a Deputy Director saying the words "acceptable overage".' },
      { who: 'RON', text: 'That was about my family. Not his. Mine.' },
    ],
  },
  {
    id: 'recker_5', char: 'recker', act: 3, requires: 'recker_4',
    title: 'THE SIGNATORY', sub: 'EXECUTIVE FLOOR — 19:45',
    objective: 'ONE NAME IS ON EVERY PAGE. FIND OUT WHOSE HAND IT IS.',
    gen: { theme: 'office', w: 52, h: 38, rooms: 12, enemies: 30, tier: 3 },
    intro: [
      { who: 'RECKER', text: 'Every page. Same initials. Same pen.' },
      { who: 'RECKER', text: 'Eleven months of my life and it fits in a signature box.' },
    ],
    outro: [
      { who: '', text: 'The office is empty. The nameplate says DEPUTY DIRECTOR M. KESSLER.', c: '#888' },
      { who: '', text: 'There is a photograph on the desk of a man with two daughters.', c: '#888' },
      { who: 'RECKER', text: '...' },
      { who: 'RECKER', text: 'Put it face down.' },
    ],
  },
  {
    id: 'john_4', char: 'john', act: 3, requires: 'sent',
    title: 'PRESS', sub: 'THE HERALD — 03:00',
    objective: 'THE STORY GOES UP AT SUNRISE. HOLD THE BUILDING UNTIL IT DOES.',
    gen: { theme: 'office', w: 48, h: 34, rooms: 10, enemies: 28, tier: 3, siege: true },
    intro: [
      { who: 'JOHN', text: "Eleven thousand words. Four hundred photographs. A recording." },
      { who: 'JOHN', text: 'My editor quit in 2019. I still have his door code.' },
      { who: '', text: 'Upload begins at 06:00. It is 03:00. They know where he is.', c: '#888' },
      { who: 'JOHN', text: "I've been a coward my whole career." },
      { who: 'JOHN', text: 'Three hours. I can do three hours.' },
    ],
    outro: [
      { who: '', text: '06:00:04 — THE HERALD — "THE BAD COMPANY: A DECADE OF WRONG ADDRESSES"', c: '#5dff9b' },
      { who: 'JOHN', text: "It's out. It's out, it's out, it's out—" },
      { who: 'JOHN', text: 'You cannot un-publish something.' },
    ],
  },
  {
    id: 'vance_3', char: 'vance', act: 3, requires: 'vance_2',
    title: 'AMENDS', sub: 'HOLDING GARAGE — 05:20',
    objective: "RECKER IS COMING THROUGH HERE. GET THE DOORS OPEN FOR HIM.",
    gen: { theme: 'industrial', w: 48, h: 34, rooms: 9, enemies: 26, tier: 3 },
    intro: [
      { who: '', text: 'Vance knows exactly one useful thing: the route in.', c: '#888' },
      { who: 'VANCE', text: "He's going to kill me when he gets here." },
      { who: 'VANCE', text: "That's fine. That's — that's arithmetic, that's fine." },
      { who: 'VANCE', text: 'But he is not getting stopped at a door.' },
    ],
    outro: [
      { who: 'VANCE', text: 'Doors are open. Every one of them.' },
      { who: 'VANCE', text: "Come on, then. I'll be standing up." },
    ],
  },
  {
    id: 'recker_6', char: 'recker', act: 3, requires: 'recker_5',
    title: 'FOUR OF US', sub: 'CENTRAL COMPOUND — GROUND FLOOR — 05:40',
    objective: 'YOU ARE NOT DOING THIS ALONE. YOU HAVE NOT BEEN FOR A WHILE.',
    gen: { theme: 'compound', w: 56, h: 40, rooms: 12, enemies: 34, tier: 3, allies: true },
    intro: [
      { who: 'VANCE', text: 'Recker.' },
      { who: 'RECKER', text: 'I know your face.' },
      { who: 'VANCE', text: 'You should. I was first through your door.' },
      { who: '', text: 'Recker raises the gun. Nobody in the room moves to stop him.', c: '#888' },
      { who: 'JOHN', text: "He opened every door in this building for you." },
      { who: 'RON', text: 'And he goes on the record after. He said so.' },
      { who: 'VANCE', text: 'I do. Either way. Whatever you decide, I do.' },
      { who: 'RECKER', text: '...' },
      { who: 'RECKER', text: 'After.' },
    ],
    outro: [
      { who: 'RON', text: 'Top floor. Kessler signed for everything.' },
      { who: 'RECKER', text: 'Then that is the last name.' },
      { who: 'JOHN', text: 'Recker. When you get up there—' },
      { who: 'RECKER', text: 'I know what you want me to do.' },
    ],
  },
  {
    id: 'recker_7', char: 'recker', act: 3, requires: 'recker_6', finale: true,
    title: 'THE BAD COMPANY', sub: 'TOP FLOOR — SUNRISE',
    objective: 'THE LAST NAME ON THE LIST.',
    gen: { theme: 'office', w: 44, h: 34, rooms: 8, enemies: 30, tier: 4, finale: true },
    intro: [
      { who: '', text: 'One hundred and nine people worked for the Bad Company.', c: '#888' },
      { who: '', text: 'The list in his pocket is down to a single line.', c: '#888' },
      { who: 'RECKER', text: 'Ana used to say I never finish anything.' },
      { who: 'RECKER', text: 'One more floor.' },
    ],
  },
];


// ---------------------------------------------------------------------------
// The literal win condition, derived from the very same gen flags that
// checkObjective() reads -- so the text on screen can never drift away from
// what the game is actually testing for.
// ---------------------------------------------------------------------------
export function taskFor(level) {
  const g = level.gen || {};
  if (g.prologue || g.flashback) return 'WALK TO THE MARKER';
  if (g.terminal)                return 'GO TO THE DESK';
  if (g.target)                  return 'SHOOT THE TARGET DOWN — HE SURVIVES IT';
  if (level.finale)              return 'KILL EVERY HOSTILE, THEN GO UP';
  return 'KILL EVERY HOSTILE';
}


// ===========================================================================
// BONUS CAMPAIGN -- "THE SUBSIDIARY"
// Unlocked by finishing the main campaign. Eighteen months later, same
// universe, entirely new people. The Bad Company was dissolved by statute.
// Its contracts were not: they were novated to a shell that kept the serial
// numbers, the personnel files, and the business model.
// ===========================================================================
export const BONUS_LEVELS = [
  {
    id: 'nora_1', char: 'nora', act: 4, bonus: true,
    title: 'SCHEDULE C', sub: 'MERIDIAN CIVIL SOLUTIONS — 10:15',
    objective: 'CERTIFY THE ASSET TRANSFER. IT WILL TAKE AN HOUR.',
    gen: { theme: 'office', w: 46, h: 34, rooms: 10, enemies: 16, tier: 2 },
    intro: [
      { who: '', text: 'The Bad Company was dissolved by statute on a Thursday afternoon.', c: '#888' },
      { who: '', text: 'Dissolution ends a company. It does not end a contract.', c: '#888' },
      { who: '', text: 'Eighteen months later the same work is being done by a firm', c: '#888' },
      { who: '', text: 'called Meridian Civil Solutions, and somebody has to certify it.', c: '#888' },
      { who: 'NORA', text: "I audit asset transfers. That's the whole job." },
      { who: 'NORA', text: 'Schedule C. Equipment inventory. Two hundred line items.' },
      { who: 'NORA', text: "And every serial number on it is a dead company's." },
      { who: '', text: 'You are NORA VASQUEZ. You have said that out loud in the building.', c: '#888' },
    ],
    outro: [
      { who: 'NORA', text: 'They did not even re-stamp the crates.' },
      { who: 'NORA', text: 'Eighteen months and they did not re-stamp the crates.' },
    ],
    // --- diverges on whether Recker left Kessler breathing -----------------
    outroAlive: [
      { who: 'NORA', text: 'They did not even re-stamp the crates.' },
      { who: 'NORA', text: 'And the transfer is counter-signed. M. Kessler.' },
      { who: 'NORA', text: 'Who has been in federal custody for eighteen months.' },
      { who: 'NORA', text: 'Cooperating. Loudly. On the record.' },
      { who: 'NORA', text: 'So either he signed this from a cell, or somebody used his name.' },
    ],
    outroDead: [
      { who: 'NORA', text: 'They did not even re-stamp the crates.' },
      { who: 'NORA', text: 'And the transfer is counter-signed. M. Kessler.' },
      { who: '', text: 'Deputy Director Kessler was shot dead in his office at sunrise,', c: '#888' },
      { who: '', text: 'eighteen months and four days before the date on this page.', c: '#888' },
      { who: 'NORA', text: 'A dead man signed this. Nine times. Quarterly.' },
      { who: 'NORA', text: 'And not one system in this country noticed.' },
    ],
  },
  {
    id: 'wren_1', char: 'wren', act: 4, bonus: true,
    title: 'FILE FORTY-TWO', sub: 'CONTRACTED — 14:40',
    objective: 'THE AUDITOR IS A PROBLEM. RESOLVE HER.',
    gen: { theme: 'motel', w: 50, h: 30, rooms: 12, enemies: 18, tier: 2 },
    intro: [
      { who: '', text: 'Meridian has no cleanup crew. It has one number and one person.', c: '#888' },
      { who: 'CLIENT', text: 'Forty-two. Auditor, state office, took photographs.', c: '#dddddd' },
      { who: 'WREN', text: 'Photographs of what.' },
      { who: 'CLIENT', text: "That isn't in your scope.", c: '#dddddd' },
      { who: 'WREN', text: 'It never is.' },
      { who: '', text: 'You are WREN. Forty-one files closed. Nobody ever knew.', c: '#888' },
      { who: '', text: 'Meridian sent a second team behind you. They do not say why.', c: '#888' },
    ],
    outro: [
      { who: 'WREN', text: 'The second team was not backup.' },
      { who: 'WREN', text: 'They were here to close file forty-three.' },
      { who: 'WREN', text: '...I am file forty-three.' },
    ],
  },
  {
    id: 'bajic_1', char: 'bajic', act: 4, bonus: true,
    title: 'PAROLE', sub: 'HALFWAY HOUSE, EAST DISTRICT — 21:00',
    objective: 'THEY WANT AN ANSWER TONIGHT. GIVE THEM ONE.',
    gen: { theme: 'house', w: 40, h: 30, rooms: 8, enemies: 17, tier: 2, siege: true },
    intro: [
      { who: '', text: 'Everyone who ever wore the patch went down on the Halleck testimony.', c: '#888' },
      { who: '', text: 'Emil Bajic did seventeen months. He was not at Galloway.', c: '#888' },
      { who: '', text: 'He has explained this to three parole boards and a bathroom mirror.', c: '#888' },
      { who: 'RECRUITER', text: 'Meridian is hiring. Same work, better paper.', c: '#dddddd' },
      { who: 'BAJIC', text: 'No.' },
      { who: 'RECRUITER', text: "That's a shame. You know the address of every cache we own.", c: '#dddddd' },
      { who: 'BAJIC', text: '...Yeah. I do.' },
      { who: '', text: 'You are EMIL BAJIC. There are four cars outside a halfway house.', c: '#888' },
    ],
    outro: [
      { who: 'BAJIC', text: 'Seventeen months I kept my mouth shut about those caches.' },
      { who: 'BAJIC', text: 'Turns out that was the only thing keeping me breathing.' },
      { who: 'BAJIC', text: 'And they just spent it.' },
    ],
  },
  {
    id: 'nora_2', char: 'nora', act: 4, bonus: true,
    title: 'MATERIAL WEAKNESS', sub: 'MERIDIAN RECORDS DEPOT — 02:30',
    objective: 'THE ORIGINALS ARE HERE. THE COPIES WILL NOT BE ENOUGH.',
    gen: { theme: 'warehouse', w: 52, h: 38, rooms: 11, enemies: 22, tier: 3 },
    introAlive: [
      { who: 'NORA', text: 'My photographs are inadmissible. I took them without a warrant.' },
      { who: 'NORA', text: 'But Kessler will talk. Kessler has done nothing but talk for a year.' },
      { who: 'NORA', text: 'I sent him one page. He sent back four words.' },
      { who: 'KESSLER', text: '"I never signed that."', c: '#dddddd' },
      { who: 'NORA', text: 'So somebody is still using a convicted man as a rubber stamp.' },
    ],
    introDead: [
      { who: 'NORA', text: 'My photographs are inadmissible. I took them without a warrant.' },
      { who: 'NORA', text: 'And I cannot ask the signatory, because somebody shot him.' },
      { who: '', text: 'There is no deposition. There is no cooperation agreement.', c: '#888' },
      { who: '', text: 'There is a closed casket and a signature that kept working.', c: '#888' },
      { who: 'NORA', text: 'I have to prove a dead man did not do this. From nothing.' },
    ],
    intro: [
      { who: 'NORA', text: 'My photographs are inadmissible. I took them without a warrant.' },
      { who: 'NORA', text: 'I know that because I am the person who writes that rule.' },
      { who: 'NORA', text: 'So I need the originals, and I need them signed for.' },
      { who: '', text: 'She has never held a weapon before this week. She holds one now.', c: '#888' },
    ],
    outro: [
      { who: 'NORA', text: 'Novation agreement. Two signatures.' },
      { who: 'NORA', text: 'One of them belongs to a man who cannot have signed it.' },
    ],
    outroAlive: [
      { who: 'NORA', text: 'Novation agreement. Two signatures.' },
      { who: 'NORA', text: 'Kessler will swear the second one is not his hand.' },
      { who: 'NORA', text: 'A cooperating witness disowning a document. That is a case.' },
      { who: 'NORA', text: 'An ugly one, with a monster for a witness. But a case.' },
    ],
    outroDead: [
      { who: 'NORA', text: 'Novation agreement. Two signatures.' },
      { who: 'NORA', text: 'Nobody alive can swear the second one is forged.' },
      { who: 'NORA', text: 'The only man who could tell me took a round at sunrise.' },
      { who: 'NORA', text: 'So I do not get a witness. I get arithmetic, and I get to be right.' },
    ],
  },
  {
    id: 'wren_2', char: 'wren', act: 4, bonus: true,
    title: 'THE PEOPLE WHO KNOW', sub: 'MERIDIAN OPERATIONS — 04:10',
    objective: 'THERE IS A LIST OF EVERYONE WHO KNOWS. GET IT.',
    gen: { theme: 'compound', w: 50, h: 36, rooms: 10, enemies: 24, tier: 3 },
    intro: [
      { who: 'WREN', text: 'Every job I ever did, I told myself the same sentence.' },
      { who: 'WREN', text: '"Somebody was always going to do this one."' },
      { who: 'WREN', text: 'Which is true, and is not a defence, and I knew that too.' },
      { who: '', text: 'Somewhere in this building is the list Wren is now on.', c: '#888' },
    ],
    outroAlive: [
      { who: 'WREN', text: 'Sixty-one names.' },
      { who: 'WREN', text: 'The auditor is nineteen. I am forty-three.' },
      { who: 'WREN', text: 'And number one is a federal witness in protective custody.' },
      { who: 'WREN', text: 'They are going to try to reach Kessler in a cell.' },
      { who: 'WREN', text: 'Which means for the first time, he and I want the same thing.' },
    ],
    outroDead: [
      { who: 'WREN', text: 'Sixty-one names.' },
      { who: 'WREN', text: 'The auditor is nineteen. I am forty-three.' },
      { who: 'WREN', text: 'Number one is struck through. Resolved, eighteen months ago.' },
      { who: 'WREN', text: 'Somebody did my job for me, before I ever got the file.' },
      { who: 'WREN', text: 'And it changed nothing at all. Nothing. The list just got longer.' },
    ],
    outro: [
      { who: 'WREN', text: 'Sixty-one names.' },
      { who: 'WREN', text: 'The auditor is nineteen. I am forty-three.' },
      { who: 'WREN', text: 'And there is a man at number six who did seventeen months already.' },
    ],
  },
  {
    id: 'bajic_2', char: 'bajic', act: 4, bonus: true,
    title: 'NUMBER SIX', sub: 'PRISONER TRANSPORT, ROUTE 9 — 06:00',
    objective: 'THEY VIOLATED YOUR PAROLE TO GET YOU IN A VAN. GET OUT OF THE VAN.',
    gen: { theme: 'industrial', w: 46, h: 34, rooms: 9, enemies: 23, tier: 3 },
    intro: [
      { who: '', text: 'A parole violation is easy to arrange if you own the paperwork.', c: '#888' },
      { who: 'BAJIC', text: 'I did my time. I did all of it. I did not even appeal.' },
      { who: 'BAJIC', text: 'You people wrote the sentence and I served it like it was fair.' },
      { who: '', text: 'The transport is not going to a facility. It has not been for an hour.', c: '#888' },
    ],
    outro: [
      { who: 'BAJIC', text: 'Somebody cut the lock from the outside.' },
      { who: 'BAJIC', text: 'Teal jacket. Never saw the face.' },
      { who: 'BAJIC', text: 'Left me a phone with one number in it.' },
    ],
  },
  {
    id: 'nora_3', char: 'nora', act: 4, bonus: true,
    title: 'GOING CONCERN', sub: 'AUDIT COMMITTEE, ROOM 4B — 09:00',
    objective: 'PRESENT YOUR FINDINGS. THE COMMITTEE IS COMPROMISED.',
    gen: { theme: 'office', w: 48, h: 34, rooms: 11, enemies: 26, tier: 3 },
    intro: [
      { who: 'NORA', text: 'I have forty minutes and eleven exhibits.' },
      { who: 'WREN', text: "Four of the nine people in that room are on Meridian's payroll." },
      { who: 'NORA', text: 'Which four?' },
      { who: 'WREN', text: "I don't know. That's rather the problem." },
      { who: 'NORA', text: 'Then I present to all nine and watch who reaches for a phone.' },
    ],
    outro: [
      { who: 'NORA', text: 'Three of them reached for a phone.' },
      { who: 'NORA', text: 'The fourth reached for something else.' },
    ],
  },
  {
    id: 'wren_3', char: 'wren', act: 4, bonus: true,
    title: 'THE CLIENT', sub: 'A NUMBER, NOT AN ADDRESS — 23:15',
    objective: 'FORTY-ONE JOBS AND YOU NEVER ASKED WHO WAS PAYING. ASK.',
    gen: { theme: 'clinic', w: 50, h: 36, rooms: 12, enemies: 27, tier: 4 },
    intro: [
      { who: 'WREN', text: 'Forty-one times I took the call and never asked the name.' },
      { who: 'WREN', text: 'That was the professionalism. That was the entire product.' },
      { who: 'BAJIC', text: 'You knew.' },
      { who: 'WREN', text: 'I knew enough not to ask. Those are different, and they are the same.' },
    ],
    outro: [
      { who: '', text: 'The client is not a person. It is a standing purchase order.', c: '#888' },
      { who: '', text: 'It renews automatically. It has renewed nine times.', c: '#888' },
      { who: 'WREN', text: 'Nobody is doing this. It is just... continuing.' },
    ],
    outroAlive: [
      { who: '', text: 'The client is not a person. It is a standing purchase order.', c: '#888' },
      { who: '', text: 'Authorised once, four years ago, by a man now serving forty years.', c: '#888' },
      { who: 'WREN', text: 'He told the court everything he did.' },
      { who: 'WREN', text: 'He never mentioned this. I do not think he remembered it.' },
      { who: 'WREN', text: 'It was a Tuesday and a form. Why would he remember it.' },
    ],
    outroDead: [
      { who: '', text: 'The client is not a person. It is a standing purchase order.', c: '#888' },
      { who: '', text: 'Authorised once, four years ago, by a man who has been dead', c: '#888' },
      { who: '', text: 'for eighteen months and has approved nine renewals since.', c: '#888' },
      { who: 'WREN', text: 'They shot him and the signature kept working.' },
      { who: 'BAJIC', text: 'Then what exactly did that man die for.' },
      { who: 'WREN', text: 'A Tuesday. And a form.' },
    ],
  },
  {
    id: 'bajic_3', char: 'bajic', act: 4, bonus: true,
    title: 'OLD UNIT', sub: 'MERIDIAN STAGING YARD — 03:40',
    objective: 'YOU KNOW EVERY MAN IN THIS YARD. GO IN ANYWAY.',
    gen: { theme: 'warehouse', w: 52, h: 38, rooms: 10, enemies: 30, tier: 4 },
    intro: [
      { who: 'BAJIC', text: 'Kovac. Then Aldritt. Then the tall one, I never learned his name.' },
      { who: 'BAJIC', text: 'We all went down together and we all came out together.' },
      { who: 'BAJIC', text: 'They took the job. I said no. That is the entire difference between us.' },
      { who: 'NORA', text: 'You do not have to be the one who goes in.' },
      { who: 'BAJIC', text: 'Yes I do. They will not shoot at me first.' },
    ],
    outro: [
      { who: 'BAJIC', text: 'Kovac said he had a kid now.' },
      { who: 'BAJIC', text: 'He said it while he was reloading.' },
      { who: 'BAJIC', text: "I don't know what he wanted me to do with that." },
    ],
  },
  {
    id: 'meridian', char: 'nora', act: 4, bonus: true, bonusFinale: true,
    title: 'MERIDIAN', sub: 'HEAD OFFICE — 08:59',
    objective: 'THE PURCHASE ORDER RENEWS AT NINE. BE IN THE ROOM.',
    gen: { theme: 'office', w: 46, h: 36, rooms: 9, enemies: 30, tier: 4, allies: true, finale: true },
    introAlive: [
      { who: '', text: 'It renews at nine every quarter. It has never once been read.', c: '#888' },
      { who: 'NORA', text: 'Kessler gave us the room number. From a cell, on a recorded line.' },
      { who: 'WREN', text: 'He wanted something for it.' },
      { who: 'NORA', text: 'He wanted me to write down that he helped.' },
      { who: 'BAJIC', text: 'And will you?' },
      { who: 'NORA', text: 'I will write down exactly what happened. That is the whole job.' },
      { who: 'NORA', text: 'It is also, apparently, the only thing that has ever worked.' },
    ],
    introDead: [
      { who: '', text: 'It renews at nine every quarter. It has never once been read.', c: '#888' },
      { who: 'NORA', text: 'It took us four months to find the room number.' },
      { who: 'NORA', text: 'One man knew it and a man with a list shot him for it.' },
      { who: 'BAJIC', text: 'You would rather Kessler were alive?' },
      { who: 'NORA', text: 'I would rather he were alive and talking, yes.' },
      { who: 'NORA', text: 'I have read what he did. I would still rather he were talking.' },
      { who: 'WREN', text: 'That is the most auditor thing anyone has ever said.' },
    ],
    intro: [
      { who: '', text: 'It renews at nine every quarter. It has never once been read.', c: '#888' },
      { who: 'NORA', text: 'Recker killed a hundred and nine people and it grew back.' },
      { who: 'WREN', text: 'Because he killed the staff. Nobody killed the paperwork.' },
      { who: 'BAJIC', text: "So what stops it? Properly. What actually stops it." },
      { who: 'NORA', text: 'A signature. Mine. On a form I am authorised to file.' },
      { who: 'NORA', text: 'It is the least dramatic thing that has ever saved anyone.' },
      { who: 'BAJIC', text: 'Then we get you to the room.' },
    ],
  },
];

// The bonus campaign has its own closing choice, and it deliberately rhymes
// with Recker's: the gun, or the paperwork.
export const BONUS_CONFRONT_ALIVE = [
  { who: '', text: 'Room 900. One long table. One printer. No people at all.', c: '#888' },
  { who: 'NORA', text: 'Kessler said there would be nobody here and I did not believe him.' },
  { who: 'WREN', text: 'He was telling the truth. He does that now, apparently.' },
  { who: '', text: 'The purchase order renews itself at 09:00 and issues its own tasking.', c: '#888' },
  { who: 'BAJIC', text: 'Forty years for him. Seventeen months for me.' },
  { who: 'BAJIC', text: 'And the thing that actually did it is a printer on a table.' },
  { who: 'NORA', text: '08:59.' },
  { who: 'WREN', text: 'Shoot it and it renews from the backup at noon.' },
  { who: 'NORA', text: 'I know.' },
];

export const BONUS_CONFRONT_DEAD = [
  { who: '', text: 'Room 900. One long table. One printer. No people at all.', c: '#888' },
  { who: 'NORA', text: 'Four months to find this room. Nobody left alive knew the number.' },
  { who: '', text: 'The purchase order renews itself at 09:00 and issues its own tasking.', c: '#888' },
  { who: '', text: 'It signs each renewal M. KESSLER, and has done nine times', c: '#888' },
  { who: '', text: 'since the morning M. Kessler stopped being able to sign anything.', c: '#888' },
  { who: 'BAJIC', text: 'Recker killed him for this.' },
  { who: 'WREN', text: 'Recker killed him instead of this.' },
  { who: 'NORA', text: '08:59.' },
  { who: 'NORA', text: 'Nobody shoot the printer. I am asking sincerely.' },
];

export const BONUS_CONFRONT = [
  { who: '', text: 'Room 900. One long table. One printer. No people at all.', c: '#888' },
  { who: 'NORA', text: 'Where is he. Where is the man who signs it.' },
  { who: 'WREN', text: 'There is no man. There has not been a man in four years.' },
  { who: '', text: 'The purchase order renews itself at 09:00 and issues its own tasking.', c: '#888' },
  { who: 'BAJIC', text: 'I did seventeen months because of a machine that nobody turned off.' },
  { who: 'NORA', text: '08:59.' },
  { who: 'WREN', text: 'Shoot it and it renews from the backup at noon.' },
  { who: 'NORA', text: 'I know.' },
];

export const BONUS_CHOICE = {
  prompt: 'ONE MINUTE. THE ORDER RENEWS AT NINE.',
  left:  { key: 'F', label: 'DESTROY THE TERMINAL', id: 'burn' },
  right: { key: 'E', label: 'FILE THE OBJECTION', id: 'file' },
};

// Filled in at runtime depending on whether Kessler survived the main game.
export const KESSLER_EPILOGUE = {
  alive: 'Kessler is produced from custody to authenticate the forgery. He is thanked.',
  dead:  'Nobody ever proves whose hand signed it. The court accepts the arithmetic instead.',
};
export const KESSLER_EPILOGUE_QUIET = {
  alive: 'Kessler is still in a cell, still willing to talk, still waiting to be asked.',
  dead:  'The only man who could have explained it has been dead for eighteen months.',
};

export const BONUS_ENDING_GOOD = {
  id: 'bonus_good',
  title: 'MERIDIAN CIVIL SOLUTIONS',
  sub: 'DISSOLVED — 09:00:04',
  lines: [
    { who: '', text: 'She does not shoot it. She fills it in.', c: '#888' },
    { who: '', text: 'Form CC-19. Objection to Novation. Four fields and a signature.', c: '#888' },
    { who: 'NORA', text: 'Vasquez, N. Office of Contract Compliance.' },
    { who: 'NORA', text: 'Grounds: the transferring party does not exist.' },
    { who: '', text: 'The order tries to renew at 09:00:00 and is refused at 09:00:04', c: '#a86bff' },
    { who: '', text: 'by the same system that had been renewing it for four years.', c: '#a86bff' },
    { who: '', text: '—', c: '#888' },
    { who: '', text: 'KESSLER_LINE', c: '#dddddd' },
    { who: '', text: 'Wren testifies for eleven days and names all forty-one.', c: '#22d3c5' },
    { who: '', text: 'Every family gets a letter with a real date and a real cause.', c: '#22d3c5' },
    { who: '', text: 'Wren asks the court for the maximum and is given rather less.', c: '#22d3c5' },
    { who: '', text: "Emil Bajic's conviction is vacated. He is owed seventeen months", c: '#b8c4d4' },
    { who: '', text: 'and the state settles for a number and an apology in writing.', c: '#b8c4d4' },
    { who: '', text: 'He frames the apology. He spends the number on a garage.', c: '#b8c4d4' },
    { who: '', text: '—', c: '#888' },
    { who: '', text: 'Nora Vasquez is back at her desk inside a fortnight.', c: '#888' },
    { who: '', text: 'There is a backlog. There is always a backlog.', c: '#888' },
    { who: 'NORA', text: 'People keep asking me what it was like.' },
    { who: 'NORA', text: 'It was paperwork. It was always paperwork.' },
    { who: 'NORA', text: 'That is what nobody wants to hear, so I stopped saying it.' },
    { who: '', text: '—', c: '#888' },
    { who: '', text: 'Somewhere across the city a man finishes painting a small blue room', c: '#ff6b52' },
    { who: '', text: 'for the second time, because the first coat never did take properly.', c: '#ff6b52' },
    { who: '', text: 'He reads about it in the paper. He does not recognise a single name.', c: '#ff6b52' },
    { who: 'RECKER', text: 'Good.' },
  ],
};

export const BONUS_ENDING_QUIET = {
  id: 'bonus_quiet',
  title: 'RESTORED FROM BACKUP',
  sub: '12:00',
  lines: [
    { who: '', text: 'The terminal comes apart very satisfyingly.', c: '#888' },
    { who: '', text: 'It takes nine rounds and about four seconds.', c: '#888' },
    { who: 'BAJIC', text: 'That felt good.' },
    { who: 'NORA', text: 'It did.' },
    { who: '', text: '—', c: '#888' },
    { who: '', text: 'The order is restored from backup at 12:00 and renews immediately.', c: '#888' },
    { who: '', text: 'It issues four taskings. Three are addresses in this room.', c: '#888' },
    { who: '', text: '—', c: '#888' },
    { who: '', text: 'Recker learned this the hard way and it cost him everything.', c: '#ff2d3d' },
    { who: '', text: 'You cannot shoot an institution. You can only file against it.', c: '#ff2d3d' },
    { who: '', text: '—', c: '#888' },
    { who: '', text: 'KESSLER_LINE', c: '#dddddd' },
    { who: '', text: 'Nora is still authorised. The form is still four fields long.', c: '#a86bff' },
    { who: '', text: 'Go back to Room 900 before nine.', c: '#a86bff' },
  ],
};

export const ALL_LEVELS = [...LEVELS, ...BONUS_LEVELS];
export const LEVEL_BY_ID = Object.fromEntries(ALL_LEVELS.map(l => [l.id, l]));

// ---------------------------------------------------------------------------
// THE ENDING
// Reached after the finale. The final choice belongs to Recker, and it mirrors
// the choice Ron made in his first level: pull the trigger, or put it on record.
// ---------------------------------------------------------------------------
export const FINALE_CONFRONT = [
  { who: '', text: 'The top floor is one room and one man in it.', c: '#888' },
  { who: '', text: 'Deputy Director Kessler does not reach for anything.', c: '#888' },
  { who: 'KESSLER', text: 'You are the Calloway man.', c: '#dddddd' },
  { who: 'RECKER', text: 'Galloway.' },
  { who: 'KESSLER', text: "...Yes. That's right. One letter." },
  { who: 'KESSLER', text: 'Do you want me to say it was a mistake? It was a mistake.', c: '#dddddd' },
  { who: 'KESSLER', text: 'I signed eleven hundred of those last year. Yours was a mistake.', c: '#dddddd' },
  { who: 'RECKER', text: 'Her name was Ana.' },
  { who: 'KESSLER', text: "I don't know what you want me to do with that.", c: '#dddddd' },
  { who: 'RECKER', text: 'Learn it.' },
];

export const ENDING_CHOICE = {
  prompt: 'ELEVEN MONTHS. ONE NAME LEFT.',
  left:  { key: 'F', label: 'PULL THE TRIGGER', id: 'trigger' },
  right: { key: 'E', label: 'PUT HIM ON THE RECORD', id: 'record' },
};

// --- THE GOOD ENDING (record; or trigger with the full network alive) -------
export const ENDING_GOOD = {
  id: 'good',
  title: 'THE BAD COMPANY',
  sub: 'SIX MONTHS LATER',
  lines: [
    { who: '', text: 'He does not shoot.', c: '#888' },
    { who: '', text: 'He stands there long enough that the sun gets all the way up.', c: '#888' },
    { who: 'RECKER', text: "You're going to say it out loud." },
    { who: 'RECKER', text: "Her name, his badge number, the address you underlined." },
    { who: 'RECKER', text: "And you're going to say it to a man with a recorder." },
    { who: 'KESSLER', text: 'And if I refuse?', c: '#dddddd' },
    { who: 'RECKER', text: 'Then you and I are alone in a room, and I have a list.' },
    { who: '', text: '—', c: '#888' },
    { who: '', text: 'John Arden files at 06:00. Eleven thousand words.', c: '#5dff9b' },
    { who: '', text: 'By noon it is on every wire service in the country.', c: '#5dff9b' },
    { who: '', text: 'Ron Halleck testifies for nine days. He does not take a deal.', c: '#4ec8ff' },
    { who: '', text: 'Dale Vance walks into a field office and puts his badge on the counter.', c: '#ffb020' },
    { who: '', text: 'He gets eighteen years. He tells the court he asked for them.', c: '#ffb020' },
    { who: '', text: 'Kessler talks for six hours. Every word of it is admissible.', c: '#888' },
    { who: '', text: 'The Bad Company is dissolved by statute on a Thursday afternoon.', c: '#888' },
    { who: '', text: 'It takes four signatures. Nobody underlines anything.', c: '#888' },
    { who: '', text: '—', c: '#888' },
    { who: '', text: 'Recker is not charged. Nobody can decide what to charge him with.', c: '#888' },
    { who: '', text: 'He goes back to 4127 Galloway with a can of paint.', c: '#888' },
    { who: '', text: 'The nursery had one wall left unfinished for eleven months.', c: '#888' },
    { who: 'RECKER', text: 'It was going to be blue.' },
    { who: '', text: 'He finishes the wall. It takes an afternoon.', c: '#888' },
    { who: '', text: 'Then he sits down on the floor of a small blue room, in a house', c: '#888' },
    { who: '', text: 'that is quiet for the first time in eleven months, and he stays a while.', c: '#888' },
    { who: 'RECKER', text: "Okay, Ana." },
    { who: 'RECKER', text: 'Okay.' },
    { who: '', text: '—', c: '#888' },
    { who: '', text: 'He is forty-one years old. He has the rest of it.', c: '#ff6b52' },
    { who: '', text: 'He finished something.', c: '#ff6b52' },
  ],
};

// --- reached if you pull the trigger, or never built the network ------------
export const ENDING_QUIET = {
  id: 'quiet',
  title: 'CASE CLOSED',
  sub: 'NO ARTICLE WAS EVER PUBLISHED',
  lines: [
    { who: '', text: 'It takes one round and less than a second.', c: '#888' },
    { who: '', text: 'The room is very quiet afterward. It stays quiet.', c: '#888' },
    { who: 'RECKER', text: '...' },
    { who: 'RECKER', text: 'That was it. That was the whole list.' },
    { who: '', text: '—', c: '#888' },
    { who: '', text: 'The Bad Company writes an after-action report about the incident.', c: '#888' },
    { who: '', text: 'It is four pages. Recker is described as "an unstable individual".', c: '#888' },
    { who: '', text: 'A new Deputy Director signs it on a Thursday afternoon.', c: '#888' },
    { who: '', text: 'They are back to full staffing inside a year.', c: '#888' },
    { who: '', text: '—', c: '#888' },
    { who: '', text: 'You killed everyone who did it. That is not the same as stopping it.', c: '#ff2d3d' },
    { who: '', text: 'Somebody has to be left alive to say the names out loud.', c: '#ff2d3d' },
    { who: '', text: '—', c: '#888' },
    { who: '', text: 'There is another way through the top floor.', c: '#ffe27a' },
    { who: '', text: 'And there is a man in Ron Halleck\'s outbox waiting on an email.', c: '#ffe27a' },
  ],
};

// ---------------------------------------------------------------------------
// Barks fired by gameplay events.
// ---------------------------------------------------------------------------
export const BARKS = {
  recker: {
    firstKill: ['One.', 'Off the list.'],
    lowHp: ['Not yet.', "I'm not done."],
    door: ['Knock knock.'],
    clear: ['Quiet again.'],
    lastEnemy: ['Last one.'],
    pickup: ['This\'ll do.'],
  },
  ron: {
    firstKill: ['God. God.', "He wasn't— he wasn't even armed."],
    lowHp: ["I'm hit—"],
    door: ['Breaching!'],
    clear: ['Room clear. Room clear.'],
    lastEnemy: ['Stay down. Please just stay down.'],
    pickup: ['Company issue.'],
  },
  john: {
    firstKill: ["I've never— oh god."],
    lowHp: ['Come on. Come on.'],
    door: ['Sorry about the door!'],
    clear: ['Is that all of them?'],
    lastEnemy: ['One more. One more.'],
    pickup: ['I have no idea how this works.'],
  },
  nora: {
    firstKill: ["I'm an auditor.", 'Oh god. Oh god.'],
    lowHp: ['No no no—'],
    door: ['Sorry!'],
    clear: ['Is it— is that it?'],
    lastEnemy: ['One left. One more.'],
    pickup: ['I have no idea what this is.'],
  },
  wren: {
    firstKill: ['Forty-two.', 'Noted.'],
    lowHp: ['Careless.'],
    door: [''],
    clear: ['Clear. Moving.'],
    lastEnemy: ['Last one.'],
    pickup: ['Adequate.'],
  },
  bajic: {
    firstKill: ['I know you.', 'Kovac. Damn it.'],
    lowHp: ['Not going back inside.'],
    door: ['Move.'],
    clear: ['Yard clear.'],
    lastEnemy: ['Just you.'],
    pickup: ['Company issue. Still.'],
  },
  vance: {
    firstKill: ['Sorry, Ellis.', 'I trained him.'],
    lowHp: ['Still up.'],
    door: ['Coming through.'],
    clear: ['Clear.'],
    lastEnemy: ['Just you left, then.'],
    pickup: ['Better.'],
  },
};


// ---------------------------------------------------------------------------
// CREDITS -- rolled after the final mission.
// ---------------------------------------------------------------------------
export const CREDIT_NAMES = ['CLAUDE', 'ATLAS BARNES'];
export const CREDIT_ROLES = [
  'DIRECTED BY',
  'WRITTEN BY',
  'GAME DESIGN',
  'LEVEL DESIGN',
  'ENGINE PROGRAMMING',
  'GAMEPLAY PROGRAMMING',
  'ENEMY AI',
  'WEAPON SYSTEMS',
  'BALLISTICS & COLLISION',
  'PROCEDURAL LEVEL GENERATION',
  'CHARACTER MODELS',
  'ENVIRONMENT ART',
  'LIGHTING',
  'VISUAL EFFECTS',
  'USER INTERFACE',
  'ORIGINAL MUSIC',
  'SOUND DESIGN',
  'AUDIO PROGRAMMING',
  'DIALOGUE',
  'NARRATIVE DESIGN',
  'QUALITY ASSURANCE',
  'PRODUCTION',
  'SPECIAL THANKS',
];
export const CREDIT_TAIL = [
  { role: 'WEAPON DATA', body: '800 firearms sourced from public reference listings' },
  { role: 'BUILT WITH', body: 'three.js · Web Audio API · no asset files' },
];

// ---------------------------------------------------------------------------
// Save / progress
// ---------------------------------------------------------------------------
const KEY = 'the-bad-company-save-v2';
export function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.flags) return migrate(s);
  } catch (e) { /* corrupt save -> fresh */ }
  return { flags: {}, done: {}, best: {}, ending: null };
}

// Saves written before the bonus campaign existed have no kesslerAlive flag.
// Backfill it from the ending they got, so the bonus story branches correctly
// for anyone who already finished.
function migrate(s) {
  s.flags = s.flags || {};
  s.done = s.done || {};
  s.best = s.best || {};
  if (s.done.recker_7 && s.flags.kesslerAlive === undefined) {
    // the good ending is only reachable by putting him on the record
    s.flags.kesslerAlive = s.ending === 'good';
  }
  return s;
}
export function writeSave(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
export function resetSave() { try { localStorage.removeItem(KEY); } catch (e) {} }

// Every mission is selectable from the start -- play the campaign in order or
// jump straight to whichever one you want. `requires` is kept on the level
// data because the ending still reads the story state (see networkAlive).
// The bonus campaign is gated on one thing only: beating the final mission.
// You do not have to clear anything else -- every main mission is selectable
// from the start, so you can go straight to THE BAD COMPANY and unlock it.
export const FINAL_LEVEL_ID = 'recker_7';
export function bonusUnlocked(save) { return !!(save.done && save.done[FINAL_LEVEL_ID]); }
export function levelUnlocked(lvl, save) {
  if (lvl.bonus) return bonusUnlocked(save);
  return true;
}

// The good ending needs somebody left alive to carry the story: either Ron
// actually sent the email, or John got the piece published. With every mission
// unlocked you can reach that either way.
export function networkAlive(save) {
  return !!(save.flags.sent || save.done.john_4 || save.done.john_3);
}

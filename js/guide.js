// Plain-English guidance for people who are new to moving data between
// systems. Written to be read easily by an eleven-year-old: short sentences,
// everyday words, one idea at a time.
//
// Keep it that way when editing. tests/reconcile.test.mjs checks the reading
// level and fails if it creeps up.

export const INTRO = 'You are moving information from an old system to a new one. There are five steps. Do them in order. This page shows which step you are on and what to do next.';

// Keyed by step key (see STEPS in progress.js).
export const STEP_GUIDE = {
  setup: {
    what: 'Tell MapBridge what information each system holds.',
    todo: [
      'Add the list of fields from the old system.',
      'Add the list of fields from the new system.',
      'Add the names of the people working on the move.',
    ],
    done: 'Both lists are in.',
  },
  map: {
    what: 'Match each piece of information in the old system to its place in the new one.',
    todo: [
      'Draw a line from each old field to the new field it belongs in.',
      'Add a rule where the two systems write things in a different way. For example, the old system says 1 and the new one says Yes.',
      'You can ask for a first draft. Check every match yourself before you keep it.',
    ],
    done: 'Every field the new system must have has a match.',
  },
  check: {
    what: 'The data is copied into the new system. This is called a load. Then you check the copy is right.',
    todo: [
      'Ask for two files. One comes from the old system and one from the new system.',
      'Add both files and press Run checks.',
      'Read the summary. It tells you what matched and what needs fixing.',
      'Fix the problems. Then load and check again.',
    ],
    done: 'Every table passes its latest check.',
  },
  signoff: {
    what: 'The people in charge of each area agree that their part is right.',
    todo: [
      'Look at the overview. It shows each area and if it is clear.',
      'The owner of each area records that they agree.',
      'After the last load, mark it as the final load.',
    ],
    done: 'Every area is agreed on the final load, with nothing left to fix.',
  },
  handover: {
    what: 'Save the proof and tidy up.',
    todo: [
      'Download the evidence pack. It holds all that was agreed, checked and signed.',
      'Keep it somewhere safe. Someone may ask to see it later.',
      'Close the project to remove it from this browser.',
    ],
    done: 'The evidence pack is saved.',
  },
};

// Keyed by screen key: shown under the step bar as "What do I do here?"
export const SCREEN_GUIDE = {
  home: [
    'This is the home page for one move.',
    'The box marked Next tells you the one thing to do now.',
    'Below it are the five steps. A tick means a step is done.',
  ],
  setup: [
    'A field is one piece of information, like a name or a date of birth.',
    'Each system has a list of its fields. Add the list for the old system on the left. Add the list for the new system on the right.',
    'You only need the lists. Do not add real records about people.',
  ],
  invite: [
    'Add the people who are working on this move.',
    'Their names are used later to record who did each job.',
  ],
  map: [
    'The old system is on the left. The new system is on the right.',
    'Drag from a dot on the left to a dot on the right to match two fields.',
    'Click a match to add a rule or a note.',
    'A warning shows when the two sides write things in a different way.',
  ],
  reconcile: [
    'A load is when data is copied into the new system.',
    'For each table, add one file from the old system and one from the new system.',
    'Press Run checks. You get a report that shows what matched and what did not.',
    'Your files stay on this computer. They are not sent anywhere.',
  ],
  verify: [
    'Each row is one field. The dots show how far it has got.',
    'Click the plus sign on a row when the next job is done. Say who did it.',
    'The Latest load check column shows if the field matched in the last check.',
    'A red row means it was marked as passed but the last check found a problem.',
  ],
  overview: [
    'This page shows the whole move on one screen.',
    'Each area has a colour. Green means clear. Red means there is something to fix. Grey means not checked yet.',
    'When an area is right, its owner records that they agree.',
    'After the very last load, choose it as the final load.',
  ],
  export: [
    'The evidence pack is one file with the full story of this move.',
    'Download it and keep it safe.',
    'Closing the project deletes it from this browser. You cannot undo that.',
  ],
};

export const GLOSSARY = [
  ['Field', 'One piece of information, like a name, a date or an amount.'],
  ['Table', 'A group of fields about one kind of thing, like all the facts about a supplier.'],
  ['Record', 'One row in a table. For example, one supplier.'],
  ['Match', 'A link that says this old field goes into that new field.'],
  ['Load', 'Copying data into the new system. A trial load is a practice run.'],
  ['Check', 'Comparing the old data with the new data to see if they are the same.'],
  ['Sign off', 'When the person in charge says, on the record, that their part is right.'],
];

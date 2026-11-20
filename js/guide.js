// Plain-English guidance for people who are new to moving data between
// systems. Written to be read easily by an eleven-year-old: short sentences,
// everyday words, one idea at a time.
//
// Keep it that way when editing. tests/reconcile.test.mjs checks the reading
// level and fails if it creeps up.

export const INTRO = 'You are moving information from an old system to a new one. There are five steps. Each area of the work goes through them at its own pace, and may need to go back a step. The home page shows what to do next.';

// Keyed by step key (see STEPS in progress.js).
export const STEP_GUIDE = {
  setup: {
    what: 'Get a list of fields from each system.',
    todo: [
      'Pick how to get the old system\'s list, and add it.',
      'Pick how to get the new system\'s list, and add it.',
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
    what: 'The tables are filled and loaded into test, then live. Your team checks each field on screen.',
    todo: [
      'Fill the tables and send them to the person who loads them.',
      'When they are loaded into test, check each field on screen.',
      'Record pass or fail in the field tracker. Fix what fails and load again.',
      'Do the same in live.',
    ],
    done: 'Every field has passed on screen in live.',
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
    'You need a list of fields from each system. The next step matches the two lists.',
    'Pick how you will get each list. Only the tool you pick opens.',
    'You only need the lists. Do not add real records about people.',
  ],
  invite: [
    'Add the people who are working on this move.',
    'Their names are used later to record who did each job.',
  ],
  map: [
    'The old system is on the left. The new system is on the right.',
    'Drag from a dot on the left to a dot on the right to match two fields.',
    'Select a match to add a rule or a note.',
    'A warning shows when the two sides write things in a different way.',
  ],
  reconcile: [
    'This is an extra check. You do not have to use it.',
    'Add what was meant to arrive, and what did arrive.',
    'MapBridge shows records that are missing, extra or different.',
    'Your files stay on this computer. They are not sent anywhere.',
  ],
  verify: [
    'Each row is one field. The dots show how far it has got.',
    'Select the plus sign on a row when the next job is done. Say who did it.',
    'The Latest load check part of each row shows if the field matched in the last check.',
    'A red row means it was marked as passed but the last check found a problem.',
  ],
  problems: [
    'Each time a field fails testing, the problem is listed here.',
    'When you load a fix, it shows as waiting to be checked again.',
    'When the field passes, its problem is marked fixed.',
    'Download the list to send to the supplier.',
  ],
  settings: [
    'This page holds the things you set once and may change later.',
    'Give each area a service area manager. They sign off the area.',
    'Add the names of the people who record steps.',
  ],
  area: [
    'This page is for one area of the move.',
    'The boxes at the top show how far each step has got.',
    'Each field shows where it is now and the latest note.',
    'When live is correct, the service area manager signs off here.',
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

// The project home page.
export const HOME_TEXT = {
  todoHelp: 'This is every job left, from all the steps. The ones at the top hold other work up, so do those first.',
  boardHelp: 'Each area moves at its own pace. One area can be at the checks while another is still being matched. That is normal.',
  nothing: 'There is nothing left to do. Every step is complete.',
};

export const GLOSSARY = [
  ['Field', 'One piece of information, like a name, a date or an amount.'],
  ['Field list', 'All the fields one system holds, with what each one means.'],
  ['Table', 'A group of fields about one kind of thing, like all the facts about a supplier.'],
  ['Record', 'One row in a table. For example, one supplier.'],
  ['Match', 'A link that says this old field goes into that new field.'],
  ['Load', 'Copying data into the new system. A test load is a practice run in a copy of the new system.'],
  ['Check', 'Comparing the old data with the new data to see if they are the same.'],
  ['Area', 'A part of the work, such as Finance or Pupils. Each area has an owner who agrees it is right.'],
  ['Old and new system', 'The system the data comes from, and the one it moves to. MapBridge uses their own names when you give them.'],
  ['Sign off', 'When the person in charge says, on the record, that their part is right.'],
  ['Evidence pack', 'One file with the whole story of the move: what was matched, checked and signed.'],
];

export const synergySample = {
  system: 'Synergy',
  tables: [
    {
      name: 'mig_pupil',
      columns: [
        { name: 'pupil_id', type: 'int', required: true },
        { name: 'forename', type: 'varchar(50)', required: true },
        { name: 'surname', type: 'varchar(50)', required: true },
        { name: 'dob', type: 'date', required: true },
        { name: 'upn', type: 'varchar(13)', required: false },
        { name: 'fsm_flag', type: 'char(1)', required: false },
        { name: 'sen_stage', type: 'lookup', required: false },
      ],
    },
    {
      name: 'mig_guardian',
      columns: [
        { name: 'guardian_id', type: 'int', required: true },
        { name: 'pupil_id', type: 'int', required: true },
        { name: 'guardian_name', type: 'varchar(100)', required: true },
        { name: 'relationship', type: 'lookup', required: true },
        { name: 'email', type: 'varchar(100)', required: false },
      ],
    },
    {
      name: 'mig_edhistory',
      columns: [
        { name: 'pupil_id', type: 'int', required: true },
        { name: 'school_code', type: 'varchar(10)', required: true },
        { name: 'start_date', type: 'date', required: true },
        { name: 'end_date', type: 'date', required: false },
      ],
    },
    {
      name: 'mig_fsm_claim',
      columns: [
        { name: 'pupil_id', type: 'int', required: true },
        { name: 'claim_date', type: 'date', required: true },
        { name: 'fsm_code', type: 'lookup', required: true },
      ],
    },
  ],
};

export const impulseSample = {
  system: 'Impulse',
  tables: [
    {
      name: 'Pupil_Template',
      columns: [
        { name: 'PUPIL_REF', type: 'string', required: true },
        { name: 'FIRST_NAME', type: 'string', required: true },
        { name: 'LAST_NAME', type: 'string', required: true },
        { name: 'DATE_OF_BIRTH', type: 'date', required: true },
        { name: 'UPN', type: 'string', required: false },
        { name: 'FSM_STATUS', type: 'code', required: false },
        { name: 'SEN_CODE', type: 'lookup', required: false },
      ],
    },
    {
      name: 'Guardian_Template',
      columns: [
        { name: 'CONTACT_REF', type: 'string', required: true },
        { name: 'PUPIL_REF', type: 'string', required: true },
        { name: 'CONTACT_NAME', type: 'string', required: true },
        { name: 'REL_CODE', type: 'lookup', required: true },
        { name: 'EMAIL', type: 'string', required: false },
      ],
    },
    {
      name: 'School_History_Template',
      columns: [
        { name: 'PUPIL_REF', type: 'string', required: true },
        { name: 'ESTABLISHMENT', type: 'string', required: true },
        { name: 'START_DATE', type: 'date', required: true },
        { name: 'END_DATE', type: 'date', required: false },
      ],
    },
    {
      name: 'FSM_Template',
      columns: [
        { name: 'PUPIL_REF', type: 'string', required: true },
        { name: 'CLAIM_FROM', type: 'date', required: true },
        { name: 'FSM_TYPE', type: 'code', required: true },
      ],
    },
  ],
};

export const suggestedMappings = [
  { sourceTable: 'mig_pupil', sourceColumn: 'pupil_id', targetTable: 'Pupil_Template', targetColumn: 'PUPIL_REF' },
  { sourceTable: 'mig_pupil', sourceColumn: 'forename', targetTable: 'Pupil_Template', targetColumn: 'FIRST_NAME' },
  { sourceTable: 'mig_pupil', sourceColumn: 'surname', targetTable: 'Pupil_Template', targetColumn: 'LAST_NAME' },
  { sourceTable: 'mig_pupil', sourceColumn: 'dob', targetTable: 'Pupil_Template', targetColumn: 'DATE_OF_BIRTH' },
  { sourceTable: 'mig_guardian', sourceColumn: 'guardian_name', targetTable: 'Guardian_Template', targetColumn: 'CONTACT_NAME' },
];

export function cloneSample(schema) {
  return JSON.parse(JSON.stringify(schema));
}

export const synergySample = {
  system: 'Synergy',
  tables: [
    {
      name: 'mig_pupil',
      columns: [
        { name: 'pupil_id', type: 'int', required: true, description: 'Internal Synergy pupil identifier', values: 'Numeric ID' },
        { name: 'forename', type: 'varchar(50)', required: true, description: 'Pupil given name', values: 'Free text' },
        { name: 'surname', type: 'varchar(50)', required: true, description: 'Pupil family name', values: 'Free text' },
        { name: 'dob', type: 'date', required: true, description: 'Date of birth', values: 'YYYY-MM-DD' },
        { name: 'upn', type: 'varchar(13)', required: false, description: 'Unique Pupil Number', values: '13-character UPN or blank' },
        { name: 'fsm_flag', type: 'char(1)', required: false, description: 'Free school meals eligibility at extract date', values: '1 = eligible, 0 = not eligible' },
        { name: 'sen_stage', type: 'lookup', required: false, description: 'SEN provision stage', values: 'Synergy SEN lookup code' },
      ],
    },
    {
      name: 'mig_guardian',
      columns: [
        { name: 'guardian_id', type: 'int', required: true, description: 'Internal guardian/contact identifier', values: 'Numeric ID' },
        { name: 'pupil_id', type: 'int', required: true, description: 'Linked pupil', values: 'Numeric pupil ID' },
        { name: 'guardian_name', type: 'varchar(100)', required: true, description: 'Contact full name', values: 'Free text' },
        { name: 'relationship', type: 'lookup', required: true, description: 'Relationship to pupil', values: 'Synergy lookup code — see relationship table' },
        { name: 'email', type: 'varchar(100)', required: false, description: 'Contact email address', values: 'Valid email or blank' },
      ],
    },
    {
      name: 'mig_edhistory',
      columns: [
        { name: 'pupil_id', type: 'int', required: true, description: 'Linked pupil', values: 'Numeric pupil ID' },
        { name: 'school_code', type: 'varchar(10)', required: true, description: 'Previous school establishment code', values: 'DFE / establishment code' },
        { name: 'start_date', type: 'date', required: true, description: 'Start date at school', values: 'YYYY-MM-DD' },
        { name: 'end_date', type: 'date', required: false, description: 'End date at school', values: 'YYYY-MM-DD or blank if current' },
      ],
    },
    {
      name: 'mig_fsm_claim',
      columns: [
        { name: 'pupil_id', type: 'int', required: true, description: 'Linked pupil', values: 'Numeric pupil ID' },
        { name: 'claim_date', type: 'date', required: true, description: 'FSM claim effective date', values: 'YYYY-MM-DD' },
        { name: 'fsm_code', type: 'lookup', required: true, description: 'FSM claim type', values: 'Synergy FSM lookup code' },
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
        { name: 'PUPIL_REF', type: 'string', required: true, description: 'Impulse pupil reference', values: 'Vendor-assigned pupil key' },
        { name: 'FIRST_NAME', type: 'string', required: true, description: 'Pupil given name', values: 'Free text' },
        { name: 'LAST_NAME', type: 'string', required: true, description: 'Pupil family name', values: 'Free text' },
        { name: 'DATE_OF_BIRTH', type: 'date', required: true, description: 'Date of birth', values: 'YYYY-MM-DD' },
        { name: 'UPN', type: 'string', required: false, description: 'Unique Pupil Number', values: '13-character UPN or blank' },
        { name: 'FSM_STATUS', type: 'code', required: false, description: 'Free school meals status', values: 'Y = eligible, N = not eligible' },
        { name: 'SEN_CODE', type: 'lookup', required: false, description: 'SEN provision code', values: 'Impulse SEN code list' },
      ],
    },
    {
      name: 'Guardian_Template',
      columns: [
        { name: 'CONTACT_REF', type: 'string', required: true, description: 'Impulse contact reference', values: 'Vendor-assigned contact key' },
        { name: 'PUPIL_REF', type: 'string', required: true, description: 'Linked pupil reference', values: 'Must match PUPIL_REF' },
        { name: 'CONTACT_NAME', type: 'string', required: true, description: 'Contact full name', values: 'Free text' },
        { name: 'REL_CODE', type: 'lookup', required: true, description: 'Relationship to pupil', values: 'Impulse relationship code — vendor list required' },
        { name: 'EMAIL', type: 'string', required: false, description: 'Contact email address', values: 'Valid email or blank' },
      ],
    },
    {
      name: 'School_History_Template',
      columns: [
        { name: 'PUPIL_REF', type: 'string', required: true, description: 'Linked pupil reference', values: 'Must match PUPIL_REF' },
        { name: 'ESTABLISHMENT', type: 'string', required: true, description: 'School name or establishment code', values: 'Free text or vendor code' },
        { name: 'START_DATE', type: 'date', required: true, description: 'Start date at school', values: 'YYYY-MM-DD' },
        { name: 'END_DATE', type: 'date', required: false, description: 'End date at school', values: 'YYYY-MM-DD or blank if current' },
      ],
    },
    {
      name: 'FSM_Template',
      columns: [
        { name: 'PUPIL_REF', type: 'string', required: true, description: 'Linked pupil reference', values: 'Must match PUPIL_REF' },
        { name: 'CLAIM_FROM', type: 'date', required: true, description: 'FSM claim start date', values: 'YYYY-MM-DD' },
        { name: 'FSM_TYPE', type: 'code', required: true, description: 'FSM claim type', values: 'Impulse FSM type code — vendor list required' },
      ],
    },
  ],
};

export const suggestedMappings = [
  { sourceTable: 'mig_pupil', sourceColumn: 'pupil_id', targetTable: 'Pupil_Template', targetColumn: 'PUPIL_REF' },
  { sourceTable: 'mig_pupil', sourceColumn: 'forename', targetTable: 'Pupil_Template', targetColumn: 'FIRST_NAME' },
  { sourceTable: 'mig_pupil', sourceColumn: 'surname', targetTable: 'Pupil_Template', targetColumn: 'LAST_NAME' },
  { sourceTable: 'mig_pupil', sourceColumn: 'dob', targetTable: 'Pupil_Template', targetColumn: 'DATE_OF_BIRTH' },
  { sourceTable: 'mig_pupil', sourceColumn: 'fsm_flag', targetTable: 'Pupil_Template', targetColumn: 'FSM_STATUS' },
  { sourceTable: 'mig_guardian', sourceColumn: 'guardian_name', targetTable: 'Guardian_Template', targetColumn: 'CONTACT_NAME' },
];

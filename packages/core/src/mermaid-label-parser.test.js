import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractMermaidLabels,
  getMermaidEditAvailability,
  replaceMermaidLabels,
  isMermaidEditSupported,
} from './mermaid-label-parser.js';

const assertOffsetsPointToOriginal = (source, labels) => {
  for (const label of labels) {
    assert.equal(
      source.slice(label.sourceOffset, label.sourceOffset + label.sourceLength),
      label.original,
      `offset mismatch for "${label.original}"`,
    );
  }
};

// ---------------------------------------------------------------------------
// isMermaidEditSupported
// ---------------------------------------------------------------------------

test('isMermaidEditSupported returns true for supported diagram types', () => {
  assert.equal(isMermaidEditSupported('graph TD\n  A --> B'), true);
  assert.equal(isMermaidEditSupported('flowchart LR\n  A --> B'), true);
  assert.equal(isMermaidEditSupported('sequenceDiagram\n  A->>B: hi'), true);
  assert.equal(isMermaidEditSupported('classDiagram\n  class Foo'), true);
  assert.equal(isMermaidEditSupported('gantt\n  title Test'), true);
  assert.equal(isMermaidEditSupported('pie\n  "A": 10'), true);
  assert.equal(isMermaidEditSupported('journey\n  title Test'), true);
  assert.equal(isMermaidEditSupported('gitGraph\n  commit "Initial"'), true);
  assert.equal(isMermaidEditSupported('timeline\n  title Test'), true);
  assert.equal(isMermaidEditSupported('quadrantChart\n  title Test'), true);
  assert.equal(isMermaidEditSupported('xychart-beta\n  title "Test"'), true);
  assert.equal(isMermaidEditSupported('requirementDiagram\n  requirement "A" { id: 1 }'), true);
  assert.equal(isMermaidEditSupported('block-beta\n  A["Alpha"]'), true);
  assert.equal(isMermaidEditSupported('packet-beta\n  0-15: "Source"'), true);
  assert.equal(isMermaidEditSupported('architecture-beta\n  service api(server)[API]'), true);
  assert.equal(isMermaidEditSupported('kanban\n  Todo\n    [Task]'), true);
  assert.equal(isMermaidEditSupported('radar-beta\n  axis m["Math"]'), true);
  assert.equal(isMermaidEditSupported('treemap-beta\n"Root"\n  "Leaf": 1'), true);
  assert.equal(isMermaidEditSupported('C4Context\nPerson(user, "User")'), true);
});

test('isMermaidEditSupported returns false for unsupported types', () => {
  assert.equal(isMermaidEditSupported(''), false);
  assert.equal(isMermaidEditSupported('not a diagram'), false);
});

test('getMermaidEditAvailability reports supported diagrams with no safe labels', () => {
  const availability = getMermaidEditAvailability('gitGraph\n  commit\n  branch feature');
  assert.equal(availability.supported, true);
  assert.equal(availability.editable, false);
  assert.equal(availability.reason, 'no-editable-labels');
});

// ---------------------------------------------------------------------------
// Flowchart — node labels
// ---------------------------------------------------------------------------

test('extractMermaidLabels extracts flowchart node labels from various shapes', () => {
  const src = `graph TD
  A[Rectangle]
  B(Rounded)
  C{Diamond}
  D((Circle))
  E[[Subroutine]]
  F[(Database)]
  G([Stadium])`;

  const labels = extractMermaidLabels(src);
  const texts = labels.map((l) => l.original);
  assert.deepEqual(texts, [
    'Rectangle',
    'Rounded',
    'Diamond',
    'Circle',
    'Subroutine',
    'Database',
    'Stadium',
  ]);
  assert.ok(labels.every((l) => l.kind === 'node'));
  // Verify offsets point to actual text in source
  for (const l of labels) {
    assert.equal(src.slice(l.sourceOffset, l.sourceOffset + l.sourceLength), l.original,
      `offset mismatch for "${l.original}"`);
  }
});

test('extractMermaidLabels extracts flowchart edge labels', () => {
  const src = `graph LR
  A -->|edge text| B
  C -.->|dashed text| D
  E ==>|thick text| F`;

  const labels = extractMermaidLabels(src);
  const edgeLabels = labels.filter((l) => l.kind === 'edge');
  assert.deepEqual(edgeLabels.map((l) => l.original), [
    'edge text',
    'dashed text',
    'thick text',
  ]);
  for (const l of edgeLabels) {
    assert.equal(src.slice(l.sourceOffset, l.sourceOffset + l.sourceLength), l.original);
  }
});

test('extractMermaidLabels extracts flowchart mid-edge labels', () => {
  const src = `graph LR
  A -- some text --> B`;

  const labels = extractMermaidLabels(src);
  const edgeLabels = labels.filter((l) => l.kind === 'edge');
  assert.equal(edgeLabels.length, 1);
  assert.equal(edgeLabels[0].original.trim(), 'some text');
});

// ---------------------------------------------------------------------------
// Sequence diagram
// ---------------------------------------------------------------------------

test('extractMermaidLabels extracts sequence participants with and without alias', () => {
  const src = `sequenceDiagram
  participant Alice
  participant B as Bob`;

  const labels = extractMermaidLabels(src);
  assert.equal(labels.length, 2);
  assert.equal(labels[0].kind, 'participant');
  assert.equal(labels[0].original, 'Alice');
  assert.equal(labels[1].kind, 'participant');
  assert.equal(labels[1].original, 'Bob');
  for (const l of labels) {
    assert.equal(src.slice(l.sourceOffset, l.sourceOffset + l.sourceLength), l.original);
  }
});

test('extractMermaidLabels extracts sequence messages', () => {
  const src = `sequenceDiagram
  Alice->>Bob: Hello
  Bob-->>Alice: Hi back`;

  const labels = extractMermaidLabels(src);
  const msgs = labels.filter((l) => l.kind === 'message');
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].original, 'Hello');
  assert.equal(msgs[1].original, 'Hi back');
  for (const l of msgs) {
    assert.equal(src.slice(l.sourceOffset, l.sourceOffset + l.sourceLength), l.original);
  }
});

// ---------------------------------------------------------------------------
// Class diagram
// ---------------------------------------------------------------------------

test('extractMermaidLabels extracts class names', () => {
  const src = `classDiagram
  class Animal
  class Dog`;

  const labels = extractMermaidLabels(src);
  const classes = labels.filter((l) => l.kind === 'class');
  assert.equal(classes.length, 2);
  assert.equal(classes[0].original, 'Animal');
  assert.equal(classes[1].original, 'Dog');
  for (const l of classes) {
    assert.equal(src.slice(l.sourceOffset, l.sourceOffset + l.sourceLength), l.original);
  }
});

test('extractMermaidLabels extracts class attributes and methods', () => {
  const src = `classDiagram
  class Animal {
    +name : String
    +getName() : String
  }`;

  const labels = extractMermaidLabels(src);
  const attrs = labels.filter((l) => l.kind === 'attribute');
  const methods = labels.filter((l) => l.kind === 'method');
  assert.equal(attrs.length, 1, `expected 1 attribute, got ${attrs.map((a) => a.original)}`);
  assert.equal(methods.length, 1, `expected 1 method, got ${methods.map((m) => m.original)}`);
  assert.equal(attrs[0].original, '+name : String');
  assert.equal(methods[0].original, '+getName() : String');
  for (const l of [...attrs, ...methods]) {
    assert.equal(src.slice(l.sourceOffset, l.sourceOffset + l.sourceLength), l.original,
      `offset mismatch for "${l.original}"`);
  }
});

// ---------------------------------------------------------------------------
// State diagram
// ---------------------------------------------------------------------------

test('extractMermaidLabels extracts state names', () => {
  const src = `stateDiagram-v2
  state "Idle State" as idle
  [*] --> idle`;

  const labels = extractMermaidLabels(src);
  assert.ok(labels.length >= 2, `expected >=2 labels, got ${labels.length}: ${labels.map((l) => l.original)}`);
  const named = labels.find((l) => l.original === 'Idle State');
  assert.ok(named, 'should find named state');
  assert.equal(named.kind, 'state');
  assert.equal(src.slice(named.sourceOffset, named.sourceOffset + named.sourceLength), 'Idle State');

  const target = labels.find((l) => l.original === 'idle');
  assert.ok(target, 'should find transition target');
  assert.equal(target.kind, 'state');
});

// ---------------------------------------------------------------------------
// ER diagram
// ---------------------------------------------------------------------------

test('extractMermaidLabels extracts ER entities and relation labels', () => {
  const src = `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE_ITEM : contains`;

  const labels = extractMermaidLabels(src);
  const entities = labels.filter((l) => l.kind === 'entity');
  assert.ok(entities.length >= 2, `expected >=2 entities, got ${entities.length}: ${entities.map((e) => e.original)}`);
  assert.equal(entities[0].original, 'CUSTOMER');
  assert.equal(entities[1].original, 'ORDER');
  for (const l of entities) {
    assert.equal(src.slice(l.sourceOffset, l.sourceOffset + l.sourceLength), l.original);
  }

  const relations = labels.filter((l) => l.kind === 'relation');
  assert.ok(relations.length >= 2, `expected >=2 relations, got ${relations.length}: ${relations.map((r) => r.original)}`);
  assert.equal(relations[0].original, 'places');
  assert.equal(relations[0].contextLabel, 'CUSTOMER -> ORDER');
  assert.equal(relations[1].original, 'contains');
});

test('extractMermaidLabels extracts ER entity blocks, field types, field names, and relation text', () => {
  const src = `erDiagram
  CUSTOMER {
    string name
    string email
  }
  ORDER {
    int id
    string address
  }
  CUSTOMER ||--o{ ORDER : places`;

  const labels = extractMermaidLabels(src);
  const texts = labels.map((l) => l.original);
  assert.deepEqual(texts, [
    'CUSTOMER',
    'string',
    'name',
    'string',
    'email',
    'ORDER',
    'int',
    'id',
    'string',
    'address',
    'places',
  ]);
  assert.deepEqual(labels.map((l) => l.kind), [
    'entity',
    'fieldType',
    'field',
    'fieldType',
    'field',
    'entity',
    'fieldType',
    'field',
    'fieldType',
    'field',
    'relation',
  ]);
  assert.deepEqual(
    labels.map((l) => l.contextLabel ?? null),
    [
      'CUSTOMER',
      'CUSTOMER',
      'CUSTOMER.name',
      'CUSTOMER',
      'CUSTOMER.email',
      'ORDER',
      'ORDER',
      'ORDER.id',
      'ORDER',
      'ORDER.address',
      'CUSTOMER -> ORDER',
    ],
  );
  for (const l of labels) {
    assert.equal(src.slice(l.sourceOffset, l.sourceOffset + l.sourceLength), l.original,
      `offset mismatch for "${l.original}"`);
  }
});

test('replaceMermaidLabels updates ER entity declarations, relation references, fields, and relation text', () => {
  const src = `erDiagram
  CUSTOMER {
    string name
  }
  ORDER {
    int id
  }
  CUSTOMER ||--o{ ORDER : places`;
  const labels = extractMermaidLabels(src);
  const customer = labels.find((l) => l.kind === 'entity' && l.original === 'CUSTOMER');
  const fieldType = labels.find((l) => l.kind === 'fieldType' && l.original === 'string');
  const field = labels.find((l) => l.kind === 'field' && l.original === 'name');
  const relation = labels.find((l) => l.kind === 'relation' && l.original === 'places');
  assert.ok(customer);
  assert.ok(fieldType);
  assert.ok(field);
  assert.ok(relation);

  const edits = new Map([
    [customer.id, 'CLIENT'],
    [fieldType.id, 'varchar'],
    [field.id, 'fullName'],
    [relation.id, 'orders'],
  ]);
  const result = replaceMermaidLabels(src, edits);

  assert.match(result, /CLIENT \{/);
  assert.match(result, /CLIENT \|\|--o\{ ORDER : orders/);
  assert.match(result, /varchar fullName/);
  assert.doesNotMatch(result, /CUSTOMER/);
  assert.doesNotMatch(result, /string name/);
  assert.doesNotMatch(result, /places/);
});

// ---------------------------------------------------------------------------
// Gantt
// ---------------------------------------------------------------------------

test('extractMermaidLabels extracts gantt task names', () => {
  const src = `gantt
  title A Gantt Chart
  dateFormat YYYY-MM-DD
  section Section1
  task Task1 :a1, 2024-01-01, 7d
  active task Task2 :a2, after a1, 5d`;

  const labels = extractMermaidLabels(src);
  const tasks = labels.filter((l) => l.kind === 'task');
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].original, 'Task1');
  assert.equal(tasks[1].original, 'Task2');
});

// ---------------------------------------------------------------------------
// Pie
// ---------------------------------------------------------------------------

test('extractMermaidLabels extracts pie slice labels', () => {
  const src = `pie title Pets
  "Dogs" : 40
  "Cats" : 30`;

  const labels = extractMermaidLabels(src);
  const slices = labels.filter((l) => l.kind === 'slice');
  const title = labels.find((l) => l.kind === 'title');
  assert.equal(title?.original, 'Pets');
  assert.equal(slices.length, 2);
  assert.equal(slices[0].original, 'Dogs');
  assert.equal(slices[1].original, 'Cats');
  for (const l of slices) {
    assert.equal(src.slice(l.sourceOffset, l.sourceOffset + l.sourceLength), l.original);
  }
});

// ---------------------------------------------------------------------------
// Mindmap
// ---------------------------------------------------------------------------

test('extractMermaidLabels extracts mindmap branch text', () => {
  const src = `mindmap
  Root
    Branch A
    Branch B`;

  const labels = extractMermaidLabels(src);
  assert.ok(labels.length >= 3, `expected >=3 labels, got ${labels.length}`);
  const texts = labels.map((l) => l.original);
  assert.ok(texts.includes('Root'));
  assert.ok(texts.includes('Branch A'));
  assert.ok(texts.includes('Branch B'));
  for (const l of labels) {
    assert.equal(l.kind, 'branch');
    assert.equal(src.slice(l.sourceOffset, l.sourceOffset + l.sourceLength), l.original);
  }
});

// ---------------------------------------------------------------------------
// Mermaid 11.15 diagram matrix
// ---------------------------------------------------------------------------

test('extractMermaidLabels covers additional Mermaid diagram text contracts', () => {
  const cases = [
    {
      name: 'journey',
      source: `journey
  title Release Journey
  section Build
  Write docs: 5: Agent`,
      expected: ['Release Journey', 'Build', 'Write docs'],
    },
    {
      name: 'timeline',
      source: `timeline
  title Theme Smoke
  2026 : Markdown : Mermaid`,
      expected: ['Theme Smoke', '2026', 'Markdown', 'Mermaid'],
    },
    {
      name: 'gitGraph',
      source: `gitGraph:
  commit "Initial"
  commit id:"1111" tag:"release"`,
      expected: ['Initial', '1111', 'release'],
    },
    {
      name: 'quadrantChart',
      source: `quadrantChart
  title Priority Matrix
  x-axis Low --> High
  y-axis Cheap --> Expensive
  quadrant-1 Invest
  Campaign A: [0.7, 0.8]`,
      expected: ['Priority Matrix', 'Low', 'High', 'Cheap', 'Expensive', 'Invest', 'Campaign A'],
    },
    {
      name: 'xychart',
      source: `xychart-beta
  title "Model Scores"
  x-axis "Date" ["Apr", "May"]
  y-axis "Score" 0 --> 100
  line [60 "Small", 80 "Large"]`,
      expected: ['Model Scores', 'Date', 'Apr', 'May', 'Score', 'Small', 'Large'],
    },
    {
      name: 'requirement',
      source: `requirementDiagram
  requirement "Login" {
    id: 1
    text: "User can sign in"
  }`,
      expected: ['Login', 'User can sign in'],
    },
    {
      name: 'block',
      source: `block-beta
  A["Input"]
  B["Output"]`,
      expected: ['Input', 'Output'],
    },
    {
      name: 'kanban',
      source: `kanban
  Todo
    [Create docs]
  id9[Ready for deploy]`,
      expected: ['Todo', 'Create docs', 'Ready for deploy'],
    },
    {
      name: 'architecture',
      source: `architecture-beta
  service api(server)[API]
  service web(browser)[Web]
  api:R -[HTTPS]- L:web`,
      expected: ['API', 'Web', 'HTTPS'],
    },
    {
      name: 'radar',
      source: `radar-beta
  axis m["Math"], s["Science"]
  curve a["Alice"]{85, 90}`,
      expected: ['Math', 'Science', 'Alice'],
    },
    {
      name: 'treemap',
      source: `treemap-beta
"Section 1"
  "Leaf 1": 12`,
      expected: ['Section 1', 'Leaf 1'],
    },
    {
      name: 'packet',
      source: `packet-beta
0-15: "Source Port"
16-31: Destination Port`,
      expected: ['Source Port', 'Destination Port'],
    },
    {
      name: 'c4',
      source: `C4Context
Person(user, "User", "Reads reports")`,
      expected: ['User', 'Reads reports'],
    },
    {
      name: 'sankey',
      source: `sankey-beta
Source,Target,12
Target,Done,8`,
      expected: ['Source', 'Target', 'Done'],
    },
  ];

  for (const item of cases) {
    const labels = extractMermaidLabels(item.source);
    assert.deepEqual(labels.map((label) => label.original), item.expected, item.name);
    assertOffsetsPointToOriginal(item.source, labels);
  }
});

// ---------------------------------------------------------------------------
// Unsupported types
// ---------------------------------------------------------------------------

test('extractMermaidLabels returns empty array for unsupported diagram types', () => {
  assert.deepEqual(extractMermaidLabels(''), []);
  assert.deepEqual(extractMermaidLabels('not a diagram'), []);
});

// ---------------------------------------------------------------------------
// replaceMermaidLabels
// ---------------------------------------------------------------------------

test('replaceMermaidLabels replaces a single label preserving source structure', () => {
  const src = `graph TD
  A[Hello]`;
  const labels = extractMermaidLabels(src);
  assert.equal(labels.length, 1);

  const edits = new Map();
  edits.set(labels[0].id, 'World');
  const result = replaceMermaidLabels(src, edits);
  assert.ok(result.includes('World'), 'should contain new text');
  assert.ok(!result.includes('Hello'), 'should not contain old text');
  // Structure preserved: still has A[...]
  assert.ok(result.includes('A[World]'), 'should preserve node syntax');
});

test('replaceMermaidLabels replaces multiple labels from end to front', () => {
  const src = `graph LR
  A[Alpha] --> B[Beta]`;
  const labels = extractMermaidLabels(src);
  assert.ok(labels.length >= 2, `expected >=2 labels, got ${labels.length}`);

  const edits = new Map();
  for (const l of labels) {
    edits.set(l.id, l.original.toUpperCase());
  }
  const result = replaceMermaidLabels(src, edits);
  assert.ok(result.includes('ALPHA'));
  assert.ok(result.includes('BETA'));
  assert.ok(!result.includes('Alpha'));
  assert.ok(!result.includes('Beta'));
});

test('replaceMermaidLabels returns source unchanged when no edits match', () => {
  const src = `graph TD\n  A[Test]`;
  const edits = new Map();
  edits.set(99999, 'Ignored');
  assert.equal(replaceMermaidLabels(src, edits), src);
});

test('replaceMermaidLabels works on sequence diagram', () => {
  const src = `sequenceDiagram
  participant Alice
  Alice->>Bob: Hello`;
  const labels = extractMermaidLabels(src);
  const msg = labels.find((l) => l.kind === 'message');
  assert.ok(msg, 'should find a message label');

  const edits = new Map();
  edits.set(msg.id, 'Goodbye');
  const result = replaceMermaidLabels(src, edits);
  assert.ok(result.includes('Goodbye'));
  assert.ok(!result.includes('Hello'));
});

test('replaceMermaidLabels updates sequence participant declarations and references', () => {
  const src = `sequenceDiagram
  participant Alice
  Alice->>Bob: Hello
  Bob-->>Alice: Hi`;
  const labels = extractMermaidLabels(src);
  const participant = labels.find((l) => l.kind === 'participant' && l.original === 'Alice');
  assert.ok(participant);

  const result = replaceMermaidLabels(src, new Map([[participant.id, 'Client']]));
  assert.match(result, /participant Client/);
  assert.match(result, /Client->>Bob: Hello/);
  assert.match(result, /Bob-->>Client: Hi/);
  assert.doesNotMatch(result, /Alice/);
});

test('replaceMermaidLabels updates class declarations and relationship references', () => {
  const src = `classDiagram
  class Animal {
    +name : String
  }
  Animal <|-- Dog`;
  const labels = extractMermaidLabels(src);
  const animal = labels.find((l) => l.kind === 'class' && l.original === 'Animal');
  assert.ok(animal);

  const result = replaceMermaidLabels(src, new Map([[animal.id, 'Creature']]));
  assert.match(result, /class Creature/);
  assert.match(result, /Creature <\|-- Dog/);
  assert.doesNotMatch(result, /Animal/);
});

test('replaceMermaidLabels updates state identifiers and transition labels', () => {
  const src = `stateDiagram-v2
  state "Idle State" as idle
  [*] --> idle
  idle --> done : completes`;
  const labels = extractMermaidLabels(src);
  const idle = labels.find((l) => l.replacementMode === 'stateId' && l.original === 'idle');
  const edge = labels.find((l) => l.kind === 'edge' && l.original === 'completes');
  assert.ok(idle);
  assert.ok(edge);

  const result = replaceMermaidLabels(src, new Map([
    [idle.id, 'ready'],
    [edge.id, 'finishes'],
  ]));
  assert.match(result, /as ready/);
  assert.match(result, /\[\*\] --> ready/);
  assert.match(result, /ready --> done : finishes/);
  assert.doesNotMatch(result, /\bidle\b/);
});

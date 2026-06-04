import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AnnotationTool } from '../src/shared/types';
import {
  createAnnotation,
  deserialiseAnnotationDocument,
  emptyAnnotationDocument,
  hitTestAnnotation,
  pushUndo,
  serialiseAnnotationDocument,
} from '../src/annotation/model';

const MVP_TOOLS: AnnotationTool[] = ['arrow', 'text', 'rect', 'ellipse', 'callout', 'highlight', 'blur', 'step', 'redact'];

test('annotation tools survive JSON round-trip with geometry and style', () => {
  let doc = emptyAnnotationDocument();
  for (const type of MVP_TOOLS) {
    const ann = createAnnotation({
      type,
      start: { x: 10, y: 20 },
      end: { x: 110, y: 80 },
      color: '#4F46E5',
      text: type === 'text' || type === 'callout' ? 'Label' : undefined,
      existing: doc.annotations,
    });
    doc = { ...doc, annotations: [...doc.annotations, ann] };
  }

  const restored = deserialiseAnnotationDocument(serialiseAnnotationDocument(doc));
  assert.equal(restored.annotations.length, MVP_TOOLS.length);
  assert.deepEqual(restored.annotations.map(a => a.type), MVP_TOOLS);
  assert.equal(restored.annotations.find(a => a.type === 'step')?.order, 1);
  assert.ok(restored.annotations.every(a => a.style?.strokeWidth));
});

test('hit testing returns the topmost matching annotation', () => {
  const low = createAnnotation({ type: 'rect', start: { x: 0, y: 0 }, end: { x: 100, y: 100 }, color: '#111', existing: [] });
  const high = createAnnotation({ type: 'ellipse', start: { x: 10, y: 10 }, end: { x: 90, y: 90 }, color: '#222', existing: [low] });
  assert.equal(hitTestAnnotation([low, high], { x: 50, y: 50 })?.id, high.id);
});

test('undo history keeps the latest 20 document states', () => {
  let doc = emptyAnnotationDocument();
  let history: typeof doc[] = [];
  for (let i = 0; i < 25; i += 1) {
    history = pushUndo(history, doc);
    doc = {
      ...doc,
      annotations: [
        ...doc.annotations,
        createAnnotation({ type: 'step', start: { x: i, y: i }, end: { x: i, y: i }, color: '#4F46E5', existing: doc.annotations }),
      ],
    };
  }

  assert.equal(history.length, 20);
  assert.equal(history[0].annotations.length, 5);
  assert.equal(history[19].annotations.length, 24);
});

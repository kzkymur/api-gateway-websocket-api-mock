import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRouteSelectionExpression, resolveRouteKeyFromText } from './route-selection.js';

test('parseRouteSelectionExpression parses $request.body path', () => {
  assert.deepEqual(parseRouteSelectionExpression('$request.body.action'), ['action']);
  assert.deepEqual(parseRouteSelectionExpression('$request.body.payload.action'), ['payload', 'action']);
});

test('parseRouteSelectionExpression returns null for invalid expression', () => {
  assert.equal(parseRouteSelectionExpression('$request.header.action'), null);
  assert.equal(parseRouteSelectionExpression('$request.body.'), null);
});

test('resolveRouteKeyFromText resolves configured path', () => {
  const message = JSON.stringify({ payload: { route: 'customRoute' }, action: 'fallbackAction' });
  assert.equal(resolveRouteKeyFromText(message, '$request.body.payload.route'), 'customRoute');
});

test('resolveRouteKeyFromText falls back to action when expression is invalid', () => {
  const message = JSON.stringify({ action: 'sendMessage' });
  assert.equal(resolveRouteKeyFromText(message, '$request.query.action'), 'sendMessage');
});

test('resolveRouteKeyFromText returns $default when payload is invalid', () => {
  assert.equal(resolveRouteKeyFromText('not-json', '$request.body.action'), '$default');
  assert.equal(resolveRouteKeyFromText(JSON.stringify({ foo: 'bar' }), '$request.body.action'), '$default');
});

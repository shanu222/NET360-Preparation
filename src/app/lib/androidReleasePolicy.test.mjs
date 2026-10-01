import assert from 'node:assert/strict';
import { decideAndroidUpdate } from './androidReleasePolicy.ts';

assert.equal(decideAndroidUpdate(36, 36, true), 'allow');
assert.equal(decideAndroidUpdate(36, 35, true), 'allow');
assert.equal(decideAndroidUpdate(35, 36, true), 'update');
assert.equal(decideAndroidUpdate(1, 36, true), 'update');
assert.equal(decideAndroidUpdate(36, 0, true), 'allow');
assert.equal(decideAndroidUpdate(36, null, true), 'allow');
assert.equal(decideAndroidUpdate(36, Number.NaN, true), 'allow');
assert.equal(decideAndroidUpdate(35, 36, false), 'allow');
assert.equal(decideAndroidUpdate(Number.NaN, 36, true), 'allow');
assert.equal(decideAndroidUpdate(0, 36, true), 'allow');

console.log('android release policy ok');

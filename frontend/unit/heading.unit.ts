import assert from 'node:assert/strict';
import test from 'node:test';
import { cameraHeading, meanHeading, roseDegrees, rosePoint } from '../src/lib/heading.ts';

const near = (a: number | null, b: number, tol = 0.01) => assert.ok(a !== null && Math.abs(((a - b + 540) % 360) - 180) < tol, `${a} is not ${b}`);

test('an upright phone facing north reads 0, and turning left reads 360 minus the turn', () => {
  near(cameraHeading(0, 90, 0), 0);
  near(cameraHeading(90, 90, 0), 270);
  near(cameraHeading(270, 90, 0), 90);
  near(cameraHeading(180, 90, 0), 180);
});

test('tilting the camera up or down does not change the direction', () => {
  near(cameraHeading(40, 120, 0), 320);
  near(cameraHeading(40, 60, 0), 320);
});

test('a phone lying flat or pointing straight up has no direction', () => {
  assert.equal(cameraHeading(10, 0, 0), null);
  assert.equal(cameraHeading(10, 180, 0), null);
});

test('headings average around the 360 wrap', () => {
  near(meanHeading([350, 10]), 0);
  near(meanHeading([90, 100, 110]), 100);
  assert.equal(meanHeading([]), null);
});

test('the eight-point rose maps to and from degrees', () => {
  assert.equal(rosePoint(0), 'N'); assert.equal(rosePoint(44), 'NE'); assert.equal(rosePoint(359), 'N'); assert.equal(rosePoint(225), 'SW');
  assert.equal(roseDegrees('E'), 90); assert.equal(roseDegrees('NW'), 315);
});

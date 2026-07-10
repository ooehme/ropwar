import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildXRSessionInit,
  detectDepthMode,
  requestXRSession,
  shouldFallbackToMinimalXR,
  shouldUseMinimalXRSession
} from '../public/js/xr-session.js';

test('requests immersive-ar once with depth as an optional feature', async () => {
  const calls = [];
  const session = { depthUsage: undefined };
  const overlayRoot = {};
  const xr = {
    requestSession(...args) {
      calls.push(args);
      return Promise.resolve(session);
    }
  };

  const result = await requestXRSession(xr, overlayRoot);

  assert.equal(result, session);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'immersive-ar');
  assert.equal('requiredFeatures' in calls[0][1], false);
  assert.deepEqual(calls[0][1].optionalFeatures, [
    'depth-sensing',
    'dom-overlay'
  ]);
  assert.deepEqual(calls[0][1].depthSensing, {
    usagePreference: ['gpu-optimized', 'cpu-optimized'],
    dataFormatPreference: ['luminance-alpha', 'float32']
  });
  assert.equal(calls[0][1].domOverlay.root, overlayRoot);
});

test('uses the literal minimal request when capability support is uncertain', async () => {
  const calls = [];
  const xr = {
    requestSession(...args) {
      calls.push(args);
      return Promise.resolve({});
    }
  };

  await requestXRSession(xr, {}, shouldUseMinimalXRSession(null));

  assert.deepEqual(calls, [['immersive-ar']]);
  assert.equal(shouldUseMinimalXRSession(false), true);
  assert.equal(shouldUseMinimalXRSession(true), false);
  assert.equal(shouldUseMinimalXRSession(true, true), true);
});

test('does not retry an immersive session after rejection', async () => {
  let callCount = 0;
  const xr = {
    requestSession() {
      callCount += 1;
      return Promise.reject(new DOMException('denied', 'NotAllowedError'));
    }
  };

  await assert.rejects(requestXRSession(xr, null), { name: 'NotAllowedError' });
  assert.equal(callCount, 1);
});

test('omits DOM overlay when no root exists', () => {
  const sessionInit = buildXRSessionInit(null);

  assert.deepEqual(sessionInit.optionalFeatures, ['depth-sensing']);
  assert.equal('domOverlay' in sessionInit, false);
});

test('detects negotiated GPU, CPU and no-depth modes', () => {
  assert.equal(detectDepthMode({ depthUsage: 'gpu-optimized' }), 'gpu');
  assert.equal(detectDepthMode({ depthUsage: 'cpu-optimized' }), 'cpu');
  assert.equal(detectDepthMode({}), 'off');
  assert.equal(detectDepthMode({
    get depthUsage() {
      throw new Error('unsupported getter');
    }
  }), 'off');
});

test('falls back to a minimal request only for feature compatibility errors', () => {
  assert.equal(shouldFallbackToMinimalXR({ name: 'NotSupportedError' }), true);
  assert.equal(shouldFallbackToMinimalXR({ name: 'TypeError' }), true);
  assert.equal(shouldFallbackToMinimalXR({ name: 'NotAllowedError' }), false);
});

test('negative capability status still starts one minimal session', async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const calls = [];

  function createElement() {
    return {
      children: [],
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute() {},
      prepend(child) { this.children.unshift(child); },
      removeChild(child) {
        const index = this.children.indexOf(child);
        if (index >= 0) this.children.splice(index, 1);
      },
      get lastChild() { return this.children.at(-1); }
    };
  }

  const elements = new Map();
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, createElement());
      return elements.get(selector);
    },
    createElement
  };
  const navigator = {
    xr: {
      requestSession(...args) {
        calls.push(args);
        return Promise.resolve({});
      }
    }
  };

  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: navigator });

  try {
    const { state } = await import('../public/js/state.js');
    const { requestAdaptiveXRSession } = await import('../public/js/depth.js?capability-regression');
    state.xrSupported = false;
    state.forceMinimalXR = false;

    const result = await requestAdaptiveXRSession();

    assert.deepEqual(calls, [['immersive-ar']]);
    assert.equal(result.depthMode, 'off');
    assert.equal(result.referenceSpaceType, 'local');

    calls.length = 0;
    let rejectOptions = true;
    navigator.xr.requestSession = (...args) => {
      calls.push(args);
      if (rejectOptions) {
        rejectOptions = false;
        return Promise.reject(new DOMException('unsupported options', 'NotSupportedError'));
      }
      return Promise.resolve({});
    };
    state.xrSupported = true;
    state.forceMinimalXR = false;

    await assert.rejects(requestAdaptiveXRSession(), { name: 'NotSupportedError' });
    assert.equal(state.forceMinimalXR, true);
    await requestAdaptiveXRSession();

    assert.equal(calls.length, 2);
    assert.equal(calls[0].length, 2);
    assert.deepEqual(calls[1], ['immersive-ar']);
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else delete globalThis.document;
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
  }
});
